import streamlit as st
import fitz
import base64
import json
import pandas as pd
from openai import OpenAI
import os
import time
import hashlib
import html
import asyncio
import edge_tts
import re
import random
from concurrent.futures import ThreadPoolExecutor, as_completed

st.set_page_config(page_title="Tiger English - Corpus and Audio Tool", layout="wide", page_icon="T")

st.markdown("""
<style>
    .stTabs [data-baseweb="tab-list"] {
        gap: 8px;
    }
    .stTabs [data-baseweb="tab"] {
        height: 50px;
        padding-left: 20px;
        padding-right: 20px;
        font-weight: 500;
    }
    .stTabs [aria-selected="true"] {
        background-color: #1f77b4;
        color: white;
    }
    div[data-testid="stVerticalBlock"] > div[style*="flex-direction: column"] > div > div > div > div {
        opacity: 1 !important;
    }
</style>
""", unsafe_allow_html=True)

if "all_extracted_data" not in st.session_state:
    st.session_state.all_extracted_data = []
if "is_extracting_pdf" not in st.session_state:
    st.session_state.is_extracting_pdf = False
if "is_generating_audio" not in st.session_state:
    st.session_state.is_generating_audio = False
if "task_duration" not in st.session_state:
    st.session_state.task_duration = None
if "jsonl_audio_data" not in st.session_state:
    st.session_state.jsonl_audio_data = []
if "pdf_bytes" not in st.session_state:
    st.session_state.pdf_bytes = None
if "pdf_doc" not in st.session_state:
    st.session_state.pdf_doc = None
if "current_page_images" not in st.session_state:
    st.session_state.current_page_images = {}
if "extraction_progress" not in st.session_state:
    st.session_state.extraction_progress = {"current": 0, "total": 0, "current_page": 1}
if "realtime_data" not in st.session_state:
    st.session_state.realtime_data = []
if "edited_words" not in st.session_state:
    st.session_state.edited_words = {}
if "edited_phrases" not in st.session_state:
    st.session_state.edited_phrases = {}
if "audio_cache" not in st.session_state:
    st.session_state.audio_cache = {}
if "selected_range" not in st.session_state:
    st.session_state.selected_range = (1, 1)
if "items_to_delete" not in st.session_state:
    st.session_state.items_to_delete = set()
if "items_to_move" not in st.session_state:
    st.session_state.items_to_move = set()
if "custom_units" not in st.session_state:
    st.session_state.custom_units = set()
if "preprocessed_pages" not in st.session_state:
    st.session_state.preprocessed_pages = {}
if "split_mode" not in st.session_state:
    st.session_state.split_mode = {}
if "stop_extraction" not in st.session_state:
    st.session_state.stop_extraction = False

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
AUDIO_DIR = os.path.join(BASE_DIR, "audio")
DATA_DIR = os.path.join(BASE_DIR, "word_data")
UNRECORDED_DIR = os.path.join(DATA_DIR, "未录音")
RECORDED_DIR = os.path.join(DATA_DIR, "已录音")
RUNS_DIR = os.path.join(BASE_DIR, "runs")
PREPROCESS_DOC_DIR = os.path.join(BASE_DIR, "教材预处理文档")
STRUCTURE_DIR = os.path.join(BASE_DIR, "structure_data")
TARGET_TEXTBOOK_DIR = os.path.join(BASE_DIR, "待处理教材")
PASSAGE_OUTPUT_DIR = UNRECORDED_DIR
PASSAGE_AUDIO_DIR = os.path.join(BASE_DIR, "passage_audio")
MAX_CONCURRENT_TTS = 4
LLM_TIMEOUT_SECONDS = 90
LLM_MAX_RETRIES = 4
LLM_CLIENT_CACHE = {}
STAGE1_ITEM_RETRY_LIMIT = 2

def ensure_runtime_dirs():
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(UNRECORDED_DIR, exist_ok=True)
    os.makedirs(RECORDED_DIR, exist_ok=True)
    os.makedirs(AUDIO_DIR, exist_ok=True)
    os.makedirs(PASSAGE_AUDIO_DIR, exist_ok=True)
    os.makedirs(RUNS_DIR, exist_ok=True)
    os.makedirs(PREPROCESS_DOC_DIR, exist_ok=True)


def make_task_id():
    return time.strftime("%Y%m%d_%H%M%S")


def sanitize_filename(text):
    safe = re.sub(r'[\\/:*?"<>|]+', "_", str(text or "").strip())
    safe = re.sub(r"\s+", "", safe)
    return safe or "unknown"


def to_abs_audio_path(audio_rel_path):
    if not audio_rel_path:
        return ""
    cleaned = str(audio_rel_path).strip()
    if cleaned.startswith("./audio/"):
        return os.path.join(AUDIO_DIR, cleaned.replace("./audio/", ""))
    if cleaned.startswith("audio/"):
        return os.path.join(AUDIO_DIR, cleaned.replace("audio/", ""))
    if cleaned.startswith("./passage_audio/"):
        return os.path.join(PASSAGE_AUDIO_DIR, cleaned.replace("./passage_audio/", ""))
    if cleaned.startswith("passage_audio/"):
        return os.path.join(PASSAGE_AUDIO_DIR, cleaned.replace("passage_audio/", ""))
    if cleaned.startswith("./"):
        return os.path.join(BASE_DIR, cleaned[2:])
    if os.path.isabs(cleaned):
        return cleaned
    return os.path.join(AUDIO_DIR, cleaned)


def build_recorded_output_base(uploaded_name, source_type):
    stem = os.path.splitext(os.path.basename(str(uploaded_name or "")))[0]
    safe_stem = sanitize_filename(stem)
    if safe_stem and safe_stem != "unknown":
        return safe_stem
    return f"{sanitize_filename(source_type)}_source"


def infer_source_tag_from_filename(filename):
    stem = os.path.splitext(os.path.basename(str(filename or "")))[0]
    if "_current_book_" in stem or stem.endswith("_current_book"):
        return "current_book"
    if "_primary_school_review_" in stem or stem.endswith("_primary_school_review"):
        return "primary_school_review"
    return ""


def list_existing_recorded_versions(base_name):
    if not base_name:
        return []
    if not os.path.exists(RECORDED_DIR):
        return []
    pattern = re.compile(rf"^{re.escape(base_name)}_\d{{8}}_\d{{6}}(?:_\d+)?\.jsonl$")
    matched = []
    for name in os.listdir(RECORDED_DIR):
        if pattern.match(name):
            matched.append(os.path.join(RECORDED_DIR, name))
    return sorted(matched)


def build_book_key(book_version, grade, semester, pdf_filename):
    return f"{sanitize_filename(book_version)}|{sanitize_filename(grade)}|{sanitize_filename(semester)}|{sanitize_filename(pdf_filename)}"


def build_result_filename(book_version, grade, semester, kind_text, task_id):
    return f"{sanitize_filename(book_version)}_{sanitize_filename(grade)}_{sanitize_filename(semester)}_{kind_text}_{task_id}.jsonl"


def get_pdf_stem(filename):
    return os.path.splitext(os.path.basename(str(filename or "")))[0]


def preprocess_filename_for_pdf(pdf_filename):
    return f"{get_pdf_stem(pdf_filename)}.预处理.jsonl"


def extract_pdf_stem_from_preprocess_filename(preprocess_filename):
    stem = os.path.splitext(os.path.basename(str(preprocess_filename or "")))[0]
    if stem.endswith(".预处理"):
        return stem[:-4]
    return stem


def get_preprocess_profile_path_for_pdf(pdf_filename):
    return os.path.join(PREPROCESS_DOC_DIR, preprocess_filename_for_pdf(pdf_filename))


def save_preprocess_profile_by_pdf(pdf_filename, start_page, end_page, preprocessed_pages, odd_default_split=None, odd_left_ratio=None, even_default_split=None, even_left_ratio=None):
    ensure_runtime_dirs()
    save_path = get_preprocess_profile_path_for_pdf(pdf_filename)

    meta = {
        "record_type": "meta",
        "pdf_filename": os.path.basename(str(pdf_filename or "")),
        "start_page": int(start_page),
        "end_page": int(end_page),
        "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "defaults": {
            "odd_default_split": bool(odd_default_split) if odd_default_split is not None else None,
            "odd_left_ratio": float(odd_left_ratio) if odd_left_ratio is not None else None,
            "even_default_split": bool(even_default_split) if even_default_split is not None else None,
            "even_left_ratio": float(even_left_ratio) if even_left_ratio is not None else None,
        }
    }

    with open(save_path, "w", encoding="utf-8") as wf:
        wf.write(json.dumps(meta, ensure_ascii=False) + "\n")
        for p_num in sorted((preprocessed_pages or {}).keys(), key=lambda x: int(x)):
            info = (preprocessed_pages or {}).get(p_num, {})
            if not isinstance(info, dict):
                continue
            mode = info.get("mode", "none")
            row = {
                "record_type": "page",
                "page": int(p_num),
                "mode": "split" if mode == "split" else "none",
                "left_ratio": float(info.get("left_ratio", 0.5)) if mode == "split" else None,
            }
            wf.write(json.dumps(row, ensure_ascii=False) + "\n")

    return save_path


def load_preprocess_profile_from_jsonl_bytes(content_bytes, source_name=""):
    text = (content_bytes or b"").decode("utf-8-sig", errors="replace")
    page_configs = {}
    start_page = None
    end_page = None
    defaults = {}

    for line in text.splitlines():
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except Exception:
            continue
        if not isinstance(row, dict):
            continue
        rtype = row.get("record_type", "")
        if rtype == "meta":
            start_page = row.get("start_page")
            end_page = row.get("end_page")
            defaults = row.get("defaults", {}) if isinstance(row.get("defaults", {}), dict) else {}
            continue
        if rtype == "page" or "page" in row:
            pnum = row.get("page")
            if pnum is None:
                continue
            mode = row.get("mode", "none")
            if mode == "split":
                page_configs[str(int(pnum))] = {
                    "mode": "split",
                    "left_ratio": float(row.get("left_ratio", 0.5))
                }
            else:
                page_configs[str(int(pnum))] = {"mode": "none"}

    if start_page is None and page_configs:
        keys = sorted([int(k) for k in page_configs.keys()])
        start_page = keys[0]
        end_page = keys[-1]

    if start_page is None:
        return None

    return {
        "source_name": source_name,
        "start_page": int(start_page),
        "end_page": int(end_page),
        "page_configs": page_configs,
        "defaults": defaults,
    }


def load_preprocess_profile_from_file(file_path):
    if not os.path.exists(file_path):
        return None
    try:
        with open(file_path, "rb") as rf:
            data = rf.read()
        return load_preprocess_profile_from_jsonl_bytes(data, os.path.basename(file_path))
    except Exception:
        return None


def get_preprocess_profile_for_pdf(pdf_filename):
    path = get_preprocess_profile_path_for_pdf(pdf_filename)
    return load_preprocess_profile_from_file(path)


def build_preprocessed_pages_from_profile(doc, start_page, end_page, profile):
    result = {}
    page_configs = (profile or {}).get("page_configs", {})
    for p_num in range(start_page, end_page + 1):
        cfg = page_configs.get(str(p_num), {})
        mode = cfg.get("mode", "none")
        page = doc.load_page(p_num - 1)
        mat = fitz.Matrix(1.5, 1.5)
        pix = page.get_pixmap(matrix=mat)
        img_bytes = pix.tobytes("png")
        if mode == "split":
            left_ratio = float(cfg.get("left_ratio", 0.5))
            page_width = pix.width
            page_height = pix.height
            left_width = int(page_width * left_ratio)
            left_rect = fitz.Rect(0, 0, left_width, page_height)
            right_rect = fitz.Rect(left_width, 0, page_width, page_height)
            left_pix = page.get_pixmap(matrix=mat, clip=left_rect)
            right_pix = page.get_pixmap(matrix=mat, clip=right_rect)
            result[p_num] = {
                "mode": "split",
                "left_ratio": left_ratio,
                "left_bytes": left_pix.tobytes("png"),
                "right_bytes": right_pix.tobytes("png")
            }
        else:
            result[p_num] = {
                "mode": "none",
                "original_bytes": img_bytes
            }
    return result
OPENROUTER_MODEL_OPTIONS = [
    {
        "id": "openai/gpt-4o-mini",
        "name": "OpenAI GPT-4o mini",
        "input_price": "$0.15/M",
        "output_price": "$0.60/M",
    },
    {
        "id": "openai/gpt-4.1-mini",
        "name": "OpenAI GPT-4.1 mini",
        "input_price": "$0.40/M",
        "output_price": "$1.60/M",
    },
    {
        "id": "openai/gpt-4.1",
        "name": "OpenAI GPT-4.1",
        "input_price": "$2.00/M",
        "output_price": "$8.00/M",
    },
    {
        "id": "openai/gpt-4o",
        "name": "OpenAI GPT-4o",
        "input_price": "$2.50/M",
        "output_price": "$10.00/M",
    },
    {
        "id": "google/gemini-2.5-flash-lite",
        "name": "Google Gemini 2.5 Flash Lite",
        "input_price": "$0.10/M",
        "output_price": "$0.40/M",
    },
    {
        "id": "google/gemini-2.5-flash",
        "name": "Google Gemini 2.5 Flash",
        "input_price": "$0.15/M",
        "output_price": "$0.60/M",
    },
    {
        "id": "google/gemini-2.5-pro",
        "name": "Google Gemini 2.5 Pro",
        "input_price": "$1.25/M",
        "output_price": "$10.00/M",
    },
    {
        "id": "qwen/qwen-2.5-vl-72b-instruct",
        "name": "Qwen 2.5 VL 72B Instruct",
        "input_price": "OpenRouter实时价",
        "output_price": "OpenRouter实时价",
    },
]


def is_chinese_prompt_model(model_name):
    model = (model_name or "").lower()
    return model.startswith("qwen/") or "qwen" in model


def _model_label(option):
    return (
        f"{option['name']} | {option['id']} | "
        f"输入 {option['input_price']} 输出 {option['output_price']}"
    )


OPENROUTER_MODEL_LABEL_TO_ID = {_model_label(opt): opt["id"] for opt in OPENROUTER_MODEL_OPTIONS}
OPENROUTER_MODEL_ID_TO_LABEL = {opt["id"]: _model_label(opt) for opt in OPENROUTER_MODEL_OPTIONS}
OPENROUTER_MODEL_LABELS = list(OPENROUTER_MODEL_LABEL_TO_ID.keys())


def render_model_selector(widget_label, default_model_id, picker_key):
    safe_default_id = default_model_id if default_model_id in OPENROUTER_MODEL_ID_TO_LABEL else "openai/gpt-4o-mini"
    default_label = OPENROUTER_MODEL_ID_TO_LABEL[safe_default_id]
    selected = st.multiselect(
        widget_label,
        options=OPENROUTER_MODEL_LABELS,
        default=[default_label],
        max_selections=1,
        key=picker_key,
    )
    if selected:
        return OPENROUTER_MODEL_LABEL_TO_ID[selected[0]]
    return safe_default_id
def get_openai_client(api_key, base_url):
    cache_key = f"{base_url}|{api_key}"
    if cache_key not in LLM_CLIENT_CACHE:
        LLM_CLIENT_CACHE[cache_key] = OpenAI(api_key=api_key, base_url=base_url)
    return LLM_CLIENT_CACHE[cache_key]


def parse_api_keys(primary_key, multi_text):
    keys = []
    if primary_key and str(primary_key).strip():
        keys.append(str(primary_key).strip())
    for line in str(multi_text or "").splitlines():
        v = line.strip()
        if v and v not in keys:
            keys.append(v)
    return keys


def pick_api_key_for_job(api_keys, job_idx):
    if not api_keys:
        return ""
    return api_keys[job_idx % len(api_keys)]


def _strip_markdown_fences(text):
    if not isinstance(text, str):
        return ""
    cleaned = text.strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    elif cleaned.startswith("```"):
        cleaned = cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    return cleaned.strip()


def _extract_likely_json_block(text, expect_list=False):
    cleaned = _strip_markdown_fences(text)
    if not cleaned:
        return cleaned

    if expect_list:
        start = cleaned.find("[")
        end = cleaned.rfind("]")
    else:
        start = cleaned.find("{")
        end = cleaned.rfind("}")

    if start != -1 and end != -1 and end > start:
        return cleaned[start:end + 1]
    return cleaned


def _safe_json_parse(text, expect_list=False):
    json_block = _extract_likely_json_block(text, expect_list=expect_list)
    return json.loads(json_block)


def _load_json_line(line):
    if isinstance(line, bytes):
        line = line.decode("utf-8-sig", errors="replace")
    cleaned = (line or "").lstrip("\ufeff").strip()
    return json.loads(cleaned)

def call_chat_json_with_retry(client, request_kwargs, expect_list=False):
    last_error = None
    for attempt in range(1, LLM_MAX_RETRIES + 1):
        try:
            response = client.chat.completions.create(
                timeout=LLM_TIMEOUT_SECONDS,
                **request_kwargs
            )
            content = (response.choices[0].message.content or "").strip()
            parsed = _safe_json_parse(content, expect_list=expect_list)
            return parsed, None
        except Exception as e:
            last_error = e
            if attempt < LLM_MAX_RETRIES:
                backoff_seconds = min(2 ** (attempt - 1) + random.uniform(0, 1), 8)
                time.sleep(backoff_seconds)
    return None, str(last_error)


def _normalize_meanings(item):
    valid_pos = {"n.", "v.", "adj.", "adv.", "prep.", "pron.", "conj.", "interj.", "num.", "art.", "phr."}
    pos_alias = {
        "n": "n.",
        "v": "v.",
        "vt": "v.",
        "vi": "v.",
        "adj": "adj.",
        "adv": "adv.",
        "prep": "prep.",
        "pron": "pron.",
        "conj": "conj.",
        "interj": "interj.",
        "num": "num.",
        "art": "art.",
        "phr": "phr.",
    }

    def normalize_pos_token(token):
        t = (token or "").strip().lower()
        if not t:
            return ""
        if t in valid_pos:
            return t
        t = t.replace(".", "")
        return pos_alias.get(t, "")

    def split_pos_values(pos_text):
        raw = (pos_text or "").strip()
        if not raw:
            return [""]
        parts = re.split(r"\s*(?:&|/|,|，|、|;|；|\+|\band\b|\bor\b)\s*", raw, flags=re.IGNORECASE)
        normalized_parts = []
        seen = set()
        for p in parts:
            n = normalize_pos_token(p)
            if not n:
                continue
            if n in seen:
                continue
            seen.add(n)
            normalized_parts.append(n)
        return normalized_parts if normalized_parts else [raw]

    meanings = item.get("meanings")
    if not isinstance(meanings, list) or not meanings:
        meanings = [{
            "pos": item.get("pos", "") or "",
            "meaning": item.get("meaning", "") or "",
            "example": item.get("example", "") or "",
            "example_zh": item.get("example_zh", "") or ""
        }]

    normalized = []
    for m in meanings:
        if not isinstance(m, dict):
            continue
        pos_values = split_pos_values((m.get("pos", "") or "").strip())
        meaning_text = (m.get("meaning", "") or "").strip()
        example_text = (m.get("example", "") or "").strip()
        example_zh_text = (m.get("example_zh", "") or "").strip()

        for pos_value in pos_values:
            normalized.append({
                "pos": pos_value,
                "meaning": meaning_text,
                "example": example_text,
                "example_zh": example_zh_text,
            })

    normalized = [m for m in normalized if m["meaning"]]
    if not normalized:
        normalized = [{
            "pos": "",
            "meaning": "",
            "example": "",
            "example_zh": ""
        }]
    return normalized


def _sanitize_item_for_jsonl(item):
    if not isinstance(item, dict):
        return item
    sanitized = {}
    for key, value in item.items():
        if key == "example_audio":
            continue
        if key == "meanings" and isinstance(value, list):
            sanitized["meanings"] = [dict(m) for m in value if isinstance(m, dict)]
        else:
            sanitized[key] = value
    return sanitized
def _is_slash_phonetic(value):
    text = (value or "").strip()
    return bool(re.fullmatch(r"/[^/\n]+/", text))


def _has_complete_meanings(meanings, require_pos=False):
    if not isinstance(meanings, list) or not meanings:
        return False
    for m in meanings:
        if not isinstance(m, dict):
            return False
        if require_pos and not (m.get("pos", "") or "").strip():
            return False
        if not (m.get("meaning", "") or "").strip():
            return False
        if not (m.get("example", "") or "").strip():
            return False
        if not (m.get("example_zh", "") or "").strip():
            return False
    return True


def _is_complete_word_payload(payload, item_type="word"):
    if not isinstance(payload, dict):
        return False

    if item_type == "phrase":
        # Phrase entries should not carry phonetic labels.
        if (payload.get("phonetic", "") or "").strip():
            return False
        return _has_complete_meanings(payload.get("meanings"), require_pos=False)

    if not _is_slash_phonetic(payload.get("phonetic", "")):
        return False
    return _has_complete_meanings(payload.get("meanings"), require_pos=True)

def postprocess_extracted_items(items, fallback_unit):
    if not isinstance(items, list):
        return []

    cleaned_items = []
    seen = set()

    for raw in items:
        if not isinstance(raw, dict):
            continue

        word = (raw.get("word", "") or "").strip()
        word = re.sub(r"\s+", " ", word)
        word = re.sub(r"^[\-\*\d\.\)\s]+", "", word).strip()

        # Drop non-English head tokens and empty rows early.
        if not word or not re.search(r"[A-Za-z]", word):
            continue

        item_type = (raw.get("type", "") or "").strip().lower()
        if item_type not in {"word", "phrase"}:
            item_type = "phrase" if " " in word else "word"

        unit = (raw.get("unit", "") or fallback_unit or "").strip()
        if not unit:
            unit = "Unit ?"

        phonetic = (raw.get("phonetic", "") or "").strip()
        meanings = _normalize_meanings(raw)

        if item_type == "phrase":
            phonetic = ""
            for m in meanings:
                m["pos"] = ""

        dedup_key = (word.lower(), unit.lower(), item_type)
        if dedup_key in seen:
            continue
        seen.add(dedup_key)

        cleaned_items.append({
            "word": word,
            "phonetic": phonetic,
            "meanings": meanings,
            "unit": unit,
            "type": item_type,
        })

    return cleaned_items

def parse_page_range_input(page_range_text, min_page=1, max_page=1):
    text = (page_range_text or "").strip()
    if not text:
        return []
    pages = set()
    chunks = [c.strip() for c in text.split(",") if c.strip()]
    for chunk in chunks:
        if "-" in chunk:
            left, right = chunk.split("-", 1)
            if left.strip().isdigit() and right.strip().isdigit():
                start = int(left.strip())
                end = int(right.strip())
                if start > end:
                    start, end = end, start
                for p in range(start, end + 1):
                    if min_page <= p <= max_page:
                        pages.add(p)
        elif chunk.isdigit():
            p = int(chunk)
            if min_page <= p <= max_page:
                pages.add(p)
    return sorted(pages)


def _normalize_unit_text(unit, fallback_unit):
    unit_text = (unit or fallback_unit or "").strip()
    if not unit_text:
        return "Unit ?"
    match = re.search(r"Unit\s*\d+", unit_text, flags=re.IGNORECASE)
    if match:
        compact = re.sub(r"\s+", " ", match.group(0)).strip()
        compact = compact.replace("unit", "Unit").replace("UNIT", "Unit")
        return compact
    return unit_text


def _normalize_unit_meta_item(raw_item, page_number):
    if not isinstance(raw_item, dict):
        return None
    unit = _normalize_unit_text(raw_item.get("unit", ""), "")
    if not unit or unit == "Unit ?":
        return None
    title = (raw_item.get("unit_title", "") or "").strip()
    desc = (raw_item.get("unit_desc_short", "") or "").strip()
    if not desc:
        desc = (raw_item.get("description", "") or "").strip()
    return {
        "unit": unit,
        "unit_title": title,
        "unit_desc_short": desc,
        "source_page": page_number,
    }


def _validate_unit_meta_item(item, require_unit_title=True):
    if not isinstance(item, dict):
        return False
    unit = (item.get("unit", "") or "").strip()
    if not re.match(r"^Unit\s*\d+$", unit, flags=re.IGNORECASE):
        return False
    title = (item.get("unit_title", "") or "").strip()
    if require_unit_title and not title:
        return False
    desc = (item.get("unit_desc_short", "") or "").strip()
    if not desc:
        return False
    if not title:
        return False
    return True


def _repair_unit_meta_item_with_retry(raw_item, page_number, api_key, base_url, model_name):
    if not isinstance(raw_item, dict):
        return None
    client = get_openai_client(api_key, base_url)
    raw_payload = json.dumps(raw_item, ensure_ascii=False)
    prompt = f"""
Fix one unit-index JSON item from a textbook directory page.
Return ONE JSON object only:
{
  "unit": "Unit X",
  "unit_title": "....",
  "unit_desc_short": "One short question under the unit title"
}
Rules:
- unit must match Unit + number.
- unit_title must be non-empty.
- unit_desc_short must be non-empty and should be the short question line under the unit title.
- Keep text as in textbook language (do not translate).
Raw item:
{raw_payload}
"""
    request_kwargs = {
        "model": model_name,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.0,
    }
    for _ in range(STAGE1_ITEM_RETRY_LIMIT):
        parsed, error = call_chat_json_with_retry(client, request_kwargs, expect_list=False)
        if error or not isinstance(parsed, dict):
            continue
        normalized = _normalize_unit_meta_item(parsed, page_number)
        if _validate_unit_meta_item(normalized, require_unit_title=True):
            return normalized
    return None


def extract_unit_meta_from_page(base64_image, page_number, api_key, base_url, model_name):
    client = get_openai_client(api_key, base_url)
    prompt = """
You are extracting unit metadata from a textbook directory/contents page image.
Return JSON array only (no markdown).
Each item schema:
{
  "unit": "Unit X",
  "unit_title": "Unit title",
  "unit_desc_short": "Short question under unit title"
}
Rules:
- Only include real units visible on this page.
- unit must use Unit + number.
- Keep original language text; do not translate.
- unit_title and unit_desc_short should both be non-empty.
"""
    request_kwargs = {
        "model": model_name,
        "messages": [
            {"role": "user", "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{base64_image}", "detail": "high"}}
            ]}
        ],
        "temperature": 0.0,
    }
    parsed, error = call_chat_json_with_retry(client, request_kwargs, expect_list=True)
    if error or not isinstance(parsed, list):
        return []

    cleaned = []
    seen = set()
    for raw in parsed:
        normalized = _normalize_unit_meta_item(raw, page_number)
        if not _validate_unit_meta_item(normalized, require_unit_title=True):
            normalized = _repair_unit_meta_item_with_retry(raw, page_number, api_key, base_url, model_name)
        if not _validate_unit_meta_item(normalized, require_unit_title=True):
            continue
        key = (normalized["unit"].lower(), normalized["unit_title"].lower())
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(normalized)
    return cleaned


def _normalize_passage_text(text):
    if not isinstance(text, str):
        return ""
    cleaned = text.strip()
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned


def _split_passage_sentences(passage_text):
    if not isinstance(passage_text, str):
        return []
    normalized = passage_text.replace("\r\n", "\n").replace("\r", "\n")
    lines = [ln.strip() for ln in normalized.split("\n") if ln.strip()]
    sentences = []
    for line in lines:
        parts = re.split(r"(?<=[\.!?。！？])\s+", line)
        for part in parts:
            s = (part or "").strip()
            if s:
                sentences.append(s)
    return sentences


def _translate_sentences_to_zh(sentences, api_key, base_url, model_name):
    if not sentences:
        return []
    client = get_openai_client(api_key, base_url)
    payload = json.dumps(sentences, ensure_ascii=False)
    prompt = f"""
Translate the following English sentences into concise, natural Chinese.
Return JSON array only (no markdown), with exactly the same length and order.
Do not add extra commentary.
Sentences:
{payload}
"""
    request_kwargs = {
        "model": model_name,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.0,
    }
    parsed, error = call_chat_json_with_retry(client, request_kwargs, expect_list=True)
    if error or not isinstance(parsed, list):
        return [""] * len(sentences)
    translated = []
    for i in range(len(sentences)):
        if i < len(parsed):
            translated.append(str(parsed[i] or "").strip())
        else:
            translated.append("")
    return translated


def extract_passage_from_page(base64_image, api_key, base_url, model_name, unit_label, section_label, tag_label=""):
    client = get_openai_client(api_key, base_url)
    section_hint = "dialogue text in Section A" if section_label == "A" else "reading text in Section B"
    target_hint = f"Target exercise label: {tag_label}" if tag_label else "Target exercise label: not provided"
    prompt = f"""
You are extracting textbook passage content from one page image.
Target unit: {unit_label}
Target section: {section_label}
Target type: {section_hint}
{target_hint}

Return ONE JSON object only:
{{
  "title": "passage title if visible, else empty string",
  "passage_text": "main passage text on this page"
}}

Rules:
- Keep original language, do not translate.
- Focus on the target passage body, ignore page numbers, headers, footers, and exercise items.
- Prefer text belonging to the specified label when it is visible.
- If this page does not contain target passage text, return empty passage_text.
"""
    request_kwargs = {
        "model": model_name,
        "messages": [
            {"role": "user", "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{base64_image}", "detail": "high"}}
            ]}
        ],
        "temperature": 0.0,
    }
    parsed, error = call_chat_json_with_retry(client, request_kwargs, expect_list=False)
    if error or not isinstance(parsed, dict):
        return {"title": "", "passage_text": ""}
    return {
        "title": (parsed.get("title", "") or "").strip(),
        "passage_text": _normalize_passage_text(parsed.get("passage_text", ""))
    }


def _parse_book_meta_from_filename(filename):
    stem = os.path.splitext(filename or "")[0].strip()
    parts = [p.strip() for p in stem.split("_") if p.strip()]
    if len(parts) >= 3:
        return parts[0], parts[1], parts[2]
    return "", "", ""


def _parse_passage_scope_text(scope_text, min_page, max_page):
    tasks = []
    errors = []
    lines = (scope_text or "").splitlines()
    pattern = re.compile(
        r"^\s*unit\s*(\d+)\s+section\s*([abAB])\s+page\s*([0-9\-,\s]+)\s+([0-9]+[a-zA-Z])\s*$",
        flags=re.IGNORECASE
    )
    for idx, line in enumerate(lines, start=1):
        raw = (line or "").strip()
        if not raw:
            continue
        match = pattern.match(raw)
        if not match:
            errors.append(f"第 {idx} 行格式不符合：{raw}")
            continue
        unit_num = int(match.group(1))
        section = match.group(2).upper()
        page_expr = re.sub(r"\s+", "", match.group(3))
        label = match.group(4).lower()
        pages = parse_page_range_input(page_expr, min_page, max_page)
        if not pages:
            errors.append(f"第 {idx} 行页码无效或超范围：{raw}")
            continue
        tasks.append({
            "unit": f"Unit {unit_num}",
            "section": section,
            "label": label,
            "passage_type": "dialogue" if section == "A" else "reading",
            "pages": pages,
            "source_line": idx,
        })
    return tasks, errors


def _parse_manual_targets(raw_text, unit_num, section_label, min_page, max_page):
    tasks = []
    errors = []
    text = (raw_text or "").strip()
    if not text:
        return tasks, errors
    chunks = [c.strip() for c in text.split("+") if c.strip()]
    pattern = re.compile(r"^(?:page\s*)?([0-9\-,\s]+)\s+([0-9]+[a-zA-Z])$", flags=re.IGNORECASE)
    for chunk in chunks:
        m = pattern.match(chunk)
        if not m:
            errors.append(f"Unit {unit_num} Section {section_label} 格式错误：{chunk}")
            continue
        page_expr = re.sub(r"\s+", "", m.group(1))
        label = m.group(2).lower()
        pages = parse_page_range_input(page_expr, min_page, max_page)
        if not pages:
            errors.append(f"Unit {unit_num} Section {section_label} 页码无效：{chunk}")
            continue
        tasks.append({
            "unit": f"Unit {unit_num}",
            "section": section_label,
            "label": label,
            "passage_type": "dialogue" if section_label == "A" else "reading",
            "pages": pages,
        })
    return tasks, errors


def _normalize_stem_for_match(filename):
    stem = os.path.splitext(filename or "")[0].strip().lower()
    stem = re.sub(r"[\s_\-]+", "", stem)
    return stem


def _build_txt_pdf_matches(txt_files, pdf_files):
    matches = []
    unmatched_txt = []
    pdf_map = {}
    for pf in (pdf_files or []):
        pdf_name = pf.get("name") if isinstance(pf, dict) else getattr(pf, "name", str(pf))
        pdf_map[_normalize_stem_for_match(pdf_name)] = pf

    for tf in (txt_files or []):
        tname = tf.get("name") if isinstance(tf, dict) else getattr(tf, "name", str(tf))
        key = _normalize_stem_for_match(tname)
        matched_pdf = pdf_map.get(key)
        if matched_pdf is None:
            unmatched_txt.append(tf)
        else:
            matches.append((tf, matched_pdf))
    return matches, unmatched_txt


class PDFCache:
    _instance = None
    _doc = None
    _pdf_bytes = None
    
    @classmethod
    def get_doc(cls, pdf_bytes):
        if cls._pdf_bytes != pdf_bytes or cls._doc is None:
            if cls._doc is not None:
                cls._doc.close()
            cls._doc = fitz.open("pdf", pdf_bytes)
            cls._pdf_bytes = pdf_bytes
        return cls._doc
    
    @classmethod
    def close(cls):
        if cls._doc is not None:
            cls._doc.close()
            cls._doc = None
            cls._pdf_bytes = None


def pdf_page_to_base64_cached(doc, page_number):
    page = doc.load_page(page_number - 1)
    mat = fitz.Matrix(2, 2)
    pix = page.get_pixmap(matrix=mat)
    img_bytes = pix.tobytes("png")
    return base64.b64encode(img_bytes).decode('utf-8')


def pdf_page_to_image_bytes_cached(doc, page_number):
    page = doc.load_page(page_number - 1)
    mat = fitz.Matrix(1.5, 1.5)
    pix = page.get_pixmap(matrix=mat)
    return pix.tobytes("png")


def get_unique_id(word, unit, grade, semester="", book_version="", source_tag=""):
    raw_str = f"{word}_{unit}_{grade}_{semester}_{book_version}_{source_tag}"
    return hashlib.md5(raw_str.encode('utf-8')).hexdigest()[:10]


def get_audio_hash(text):
    return hashlib.md5(text.encode('utf-8')).hexdigest()[:12]


def check_audio_cache(text, audio_dir):
    audio_hash = get_audio_hash(text)
    cache_key = f"{audio_hash}_{text}"
    
    if cache_key in st.session_state.audio_cache:
        cached_path = st.session_state.audio_cache[cache_key]
        if os.path.exists(cached_path):
            return cached_path, audio_hash
    
    if os.path.exists(audio_dir):
        possible_files = [f for f in os.listdir(audio_dir) if f.startswith(audio_hash)]
        if possible_files:
            cached_path = os.path.join(audio_dir, possible_files[0])
            st.session_state.audio_cache[cache_key] = cached_path
            return cached_path, audio_hash
    
    return None, audio_hash


async def _generate_single_audio_with_retry(text, filepath, semaphore, voice="en-US-GuyNeural", max_retries=3):
    async with semaphore:
        if not text or not str(text).strip():
            return True

        if os.path.exists(filepath):
            if os.path.getsize(filepath) > 0:
                return True
            else:
                os.remove(filepath)

        for attempt in range(max_retries):
            try:
                communicate = edge_tts.Communicate(str(text), voice)
                await asyncio.wait_for(communicate.save(filepath), timeout=30)
                if os.path.exists(filepath) and os.path.getsize(filepath) > 0:
                    return True
                else:
                    if os.path.exists(filepath):
                        os.remove(filepath)
            except asyncio.TimeoutError:
                print(f"TTS 超时 [{text}] (尝试 {attempt + 1}/{max_retries})")
            except Exception as e:
                error_msg = str(e)
                if "403" in error_msg or "Invalid response status" in error_msg:
                    wait_time = 10 * (attempt + 1)
                    print(f"TTS 被服务端拒绝(403) [{text}]，等待 {wait_time} 秒后重试 (尝试 {attempt + 1}/{max_retries})")
                    await asyncio.sleep(wait_time)
                    continue
                if "503" in error_msg or "Cannot connect" in error_msg:
                    wait_time = 6 * (attempt + 1)
                    print(f"TTS 服务暂时不可用 [{text}]，等待 {wait_time} 秒后重试 (尝试 {attempt + 1}/{max_retries})")
                    await asyncio.sleep(wait_time)
                    continue
                print(f"TTS 生成失败 [{text}] (尝试 {attempt + 1}/{max_retries}): {e}")

            if attempt < max_retries - 1:
                await asyncio.sleep(2 * (attempt + 1))

        print(f"TTS 生成失败 [{text}]，已放弃")
        return False
async def _generate_audios_with_progress(audio_tasks, progress_callback=None):
    semaphore = asyncio.Semaphore(MAX_CONCURRENT_TTS)
    results = []
    
    for i, (text, path) in enumerate(audio_tasks):
        result = await _generate_single_audio_with_retry(text, path, semaphore)
        results.append(result)
        if progress_callback:
            progress_callback(i + 1, len(audio_tasks))
        await asyncio.sleep(0.5)
    
    return results


def generate_audios_in_batch(audio_tasks, progress_bar=None, status_text=None, max_concurrent=None):
    async def run_all():
        use_concurrent = int(max_concurrent or MAX_CONCURRENT_TTS)
        semaphore = asyncio.Semaphore(max(1, use_concurrent))
        total = len(audio_tasks)
        completed = [0]
        success_count = [0]
        fail_count = [0]
        
        async def process_one(text, path, idx):
            async with semaphore:
                result = await _generate_single_audio_concurrent(text, path)
                completed[0] += 1
                if result:
                    success_count[0] += 1
                else:
                    fail_count[0] += 1
                
                if progress_bar:
                    progress_bar.progress(completed[0] / total)
                if status_text:
                    status_text.text(f"🎵 音频生成进度: {completed[0]}/{total} (成功: {success_count[0]}, 失败: {fail_count[0]})")
                return result
        
        tasks = [process_one(text, path, i) for i, (text, path) in enumerate(audio_tasks)]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        return success_count[0], fail_count[0]
    
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    
    return loop.run_until_complete(run_all())


async def _generate_single_audio_concurrent(text, filepath, voice="en-US-GuyNeural", max_retries=3):
    if not text or not str(text).strip():
        return True

    if os.path.exists(filepath):
        if os.path.getsize(filepath) > 0:
            return True
        else:
            os.remove(filepath)

    for attempt in range(max_retries):
        try:
            communicate = edge_tts.Communicate(str(text), voice)
            await asyncio.wait_for(communicate.save(filepath), timeout=30)
            if os.path.exists(filepath) and os.path.getsize(filepath) > 0:
                return True
            else:
                if os.path.exists(filepath):
                    os.remove(filepath)
        except asyncio.TimeoutError:
            print(f"TTS 超时 [{text}] (尝试 {attempt + 1}/{max_retries})")
        except Exception as e:
            error_msg = str(e)
            if "403" in error_msg or "Invalid response status" in error_msg:
                wait_time = 10 * (attempt + 1)
                print(f"TTS 被服务端拒绝(403) [{text}]，等待 {wait_time} 秒后重试 (尝试 {attempt + 1}/{max_retries})")
                await asyncio.sleep(wait_time)
                continue
            if "503" in error_msg or "Cannot connect" in error_msg:
                wait_time = 4 * (attempt + 1)
                print(f"TTS 服务暂时不可用 [{text}]，等待 {wait_time} 秒后重试 (尝试 {attempt + 1}/{max_retries})")
                await asyncio.sleep(wait_time)
                continue
            print(f"TTS 生成失败 [{text}] (尝试 {attempt + 1}/{max_retries}): {e}")

        if attempt < max_retries - 1:
            await asyncio.sleep(1 * (attempt + 1))

    print(f"TTS 生成失败 [{text}]，已放弃")
    return False
def render_audio_player(filepath):
    if not filepath or not os.path.exists(filepath):
        return "<span style='color:gray; font-size:12px;'>无 音频</span>"
    try:
        with open(filepath, "rb") as f:
            audio_bytes = f.read()
        if len(audio_bytes) == 0:
            return "<span style='color:red; font-size:12px;'>❌ 音频损坏</span>"
        b64_audio = base64.b64encode(audio_bytes).decode()
        return f'<audio controls preload="none" style="height: 35px; width: 140px;"><source src="data:audio/mp3;base64,{b64_audio}" type="audio/mpeg"></audio>'
    except Exception as e:
        return "<span style='color:red; font-size:12px;'>❌ 错误</span>"

def render_vocab_audio_rows(vocab_items):
    if not vocab_items:
        return
    h1, h2, h3, h4, h5 = st.columns([2.2, 1.6, 2.8, 1.7, 1.7])
    h1.markdown("**词条**")
    h2.markdown("**音标/释义**")
    h3.markdown("**例句**")
    h4.markdown("**词条音频**")
    h5.markdown("**例句音频**")

    for idx, row in enumerate(vocab_items, start=1):
        c1, c2, c3, c4, c5 = st.columns([2.2, 1.6, 2.8, 1.7, 1.7])
        c1.write(f"{idx}. {row.get('word', '')}")
        c2.write(f"{row.get('phonetic', '')}\n\n{row.get('meaning', '')}")
        c3.write(f"{row.get('example', '')}\n\n{row.get('example_zh', '')}")

        word_audio_abs = to_abs_audio_path(row.get("word_audio", ""))
        if word_audio_abs and os.path.exists(word_audio_abs) and os.path.getsize(word_audio_abs) > 0:
            with open(word_audio_abs, "rb") as af:
                c4.audio(af.read(), format="audio/mp3")
        else:
            c4.caption("无音频")

        ex_audio_abs = to_abs_audio_path(row.get("example_audio", ""))
        if ex_audio_abs and os.path.exists(ex_audio_abs) and os.path.getsize(ex_audio_abs) > 0:
            with open(ex_audio_abs, "rb") as af:
                c5.audio(af.read(), format="audio/mp3")
        else:
            c5.caption("无音频")

def generate_html_table(data_list):
    html_content = (
        "<div style='max-height: 600px; overflow-y: auto; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 20px;'>"
        "<table style='width:100%; border-collapse: collapse; font-size: 14px; text-align: left; background-color: white;'>"
        "<thead style='position: sticky; top: 0; background-color: #f0f2f6; z-index: 1;'>"
        "<tr>"
        "<th style='padding: 10px; border-bottom: 1px solid #ccc; width: 20%;'>单词/短语发音</th>"
        "<th style='padding: 10px; border-bottom: 1px solid #ccc; width: 20%;'>音标</th>"
        "<th style='padding: 10px; border-bottom: 1px solid #ccc; width: 40%;'>释义</th>"
        "<th style='padding: 10px; border-bottom: 1px solid #ccc; width: 20%;'>例句音频</th>"
        "</tr>"
        "</thead>"
        "<tbody>"
    )
    for row in reversed(data_list):
        s_word = html.escape(str(row.get('word', '')))
        s_phonetic = html.escape(str(row.get('phonetic', '')))
        s_meaning = html.escape(str(row.get('meaning', '')))
        s_example = html.escape(str(row.get('example', '')))
        s_example_zh = html.escape(str(row.get('example_zh', '')))
        w_player = render_audio_player(row.get('word_audio'))
        e_player = render_audio_player(row.get('example_audio'))
        html_content += "<tr style='border-bottom: 1px solid #eee;'>"
        html_content += "<td style='padding: 10px;'>"
        html_content += f"<strong style='font-size: 16px; color: #1f77b4;'>{s_word}</strong><br>"
        html_content += f"<span style='color:gray; font-size:13px;'>{s_phonetic}</span><br>"
        html_content += f"<span style='font-size:13px;'>{s_meaning}</span>"
        html_content += "</td>"
        html_content += f"<td style='padding: 10px;'>{w_player}</td>"
        html_content += "<td style='padding: 10px; font-size:13px;'>"
        html_content += f"<em>{s_example}</em><br>"
        html_content += f"<span style='color:gray;'>{s_example_zh}</span>"
        html_content += "</td>"
        html_content += f"<td style='padding: 10px;'>{e_player}</td>"
        html_content += "</tr>"
    html_content += "</tbody></table></div>"
    return html_content


def extract_vocab_with_context(base64_image, api_key, base_url, model_name, last_unit, grade_level):
    client = get_openai_client(api_key, base_url)
    use_zh_prompt = is_chinese_prompt_model(model_name)

    if use_zh_prompt:
        context_info = f"已知上一页结尾的单元是：{last_unit}。" if last_unit else "这是提取的第一页。"
        prompt = f"""
你是一个专业的英语教材教研专家，正在处理【{grade_level}】级别的词汇数据。
背景信息：{context_info}

任务：识别图片中的英语单词表和短语表，按从上到下的视觉顺序提取为 JSON 数组。
本阶段一次性完成提取，不进行第二轮补全。

视觉与切换规则（非常重要）：
1. 页面已经是单列，词条按从上到下连续排列。
2. 普通单词/短语通常是黑色字体；单元标识符（Unit N / Starter Unit N）通常是蓝色字体。
3. 只有当你识别到蓝色单元标识符时，才允许切换当前 unit。
4. 若本段没有新的蓝色单元标识符，则该段词条必须继承上一个 unit。
5. 不要因为猜测连续编号而主动切换 unit。

输出结构（按 type 分支）：
- type=word：
  {{
    "word": "英文单词",
    "type": "word",
    "unit": "Unit X 或 Starter Unit X",
    "phonetic": "/.../",
    "meanings": [
      {{
        "pos": "n.|v.|adj.|adv.|prep.|pron.|conj.|interj.|num.|art.|phr.",
        "meaning": "中文释义",
        "example": "英文例句",
        "example_zh": "中文例句"
      }}
    ],
    "unit_source": "header_detected|carried"
  }}
- type=phrase：
  {{
    "word": "英文短语",
    "type": "phrase",
    "unit": "Unit X 或 Starter Unit X",
    "meanings": [
      {{
        "meaning": "中文释义",
        "example": "英文例句",
        "example_zh": "中文例句"
      }}
    ],
    "unit_source": "header_detected|carried"
  }}

规则：
1. 只保留页面中的真实英文单词/短语。
2. type=word 必须输出 phonetic，且格式为 /.../。
3. type=phrase 不要输出 phonetic 和 pos。
4. meaning 必须中文；example 必须符合【{grade_level}】水平；example_zh 必须是中文译文。
5. type=word 时，每个 meanings 元素只能对应一个词性；不要使用 "adj. & pron." 这类合并词性写法。
6. 若同一单词有多个词性，请拆分为多个 meanings 元素，并确保每个词性都有自己对应的中文释义、英文例句和中文例句。
7. meanings 必须是非空数组。
8. last_unit 仅作弱参考：如果本页第一个单元看起来跳号，请优先复核蓝色单元标题；若仍不确定，保留视觉识别结果，不要强行改成 +1。
9. 只输出 JSON 数组，不要输出 Markdown 代码块。
"""
    else:
        context_info = f"Current best unit context: {last_unit}." if last_unit else "No prior unit context."
        prompt = f"""
You are extracting textbook vocabulary from one page image (grade context: {grade_level}).
{context_info}

This pass must finish extraction completely in one shot (no second completion pass).
Return a JSON array only (no markdown), using schema by type:

Visual + unit-switch rules (critical):
1. The page is already single-column; entries flow top-to-bottom.
2. Regular word/phrase entries are usually black text; unit headers (Unit N / Starter Unit N) are usually blue text.
3. Switch unit ONLY when a blue unit header is actually detected.
4. If no new blue unit header appears, entries must inherit the current unit.
5. Never switch unit only by guessed numbering continuity.

- type=word:
  {{
    "word": "...",
    "type": "word",
    "unit": "Unit X or Starter Unit X",
    "phonetic": "/.../",
    "meanings": [
      {{
        "pos": "n.|v.|adj.|adv.|prep.|pron.|conj.|interj.|num.|art.|phr.",
        "meaning": "Chinese meaning",
        "example": "English example sentence",
        "example_zh": "Chinese translation"
      }}
    ],
    "unit_source": "header_detected|carried"
  }}

- type=phrase:
  {{
    "word": "...",
    "type": "phrase",
    "unit": "Unit X or Starter Unit X",
    "meanings": [
      {{
        "meaning": "Chinese meaning",
        "example": "English example sentence",
        "example_zh": "Chinese translation"
      }}
    ],
    "unit_source": "header_detected|carried"
  }}

Rules:
- Keep only real English words/phrases from the page.
- For type=word, phonetic is required in /.../ format.
- For type=phrase, do not output phonetic or POS.
- meaning must be Chinese.
- example must be grade-appropriate for {grade_level} learners.
- example_zh must be the Chinese translation of the example.
- For type=word, each meanings item must map to exactly one POS. Do not merge POS like "adj. & pron." in one item.
- If a word has multiple POS, split them into separate meanings items, and each POS must have its own aligned meaning/example/example_zh.
- meanings must be a non-empty array.
- Use last_unit as a weak reference only: if first unit seems to jump, re-check blue headers first; if still uncertain, keep visual evidence result instead of forcing +1.
- Do not output audio fields.
"""

    request_kwargs = {
        "model": model_name,
        "messages": [
            {"role": "user", "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{base64_image}", "detail": "high"}}
            ]}
        ],
        "temperature": 0.1,
    }

    parsed, error = call_chat_json_with_retry(client, request_kwargs, expect_list=True)
    if error:
        st.warning(f"页面解析失败，已重试 {LLM_MAX_RETRIES} 次: {error}")
        return []

    return postprocess_extracted_items(parsed, last_unit)
def append_to_jsonl(file_path, item):
    with open(file_path, 'a', encoding='utf-8') as f:
        f.write(json.dumps(_sanitize_item_for_jsonl(item), ensure_ascii=False) + '\n')


def flatten_meanings_for_display(item):
    if "meanings" in item and isinstance(item["meanings"], list) and item["meanings"]:
        meanings = item["meanings"]
        if len(meanings) == 1:
            m = meanings[0]
            return {
                "word": item.get("word", ""),
                "phonetic": item.get("phonetic", ""),
                "pos": m.get("pos", ""),
                "meaning": m.get("meaning", ""),
                "example": m.get("example", ""),
                "example_zh": m.get("example_zh", ""),
                "id": item.get("id", ""),
                "unit": item.get("unit", ""),
                "type": item.get("type", "word")
            }
        else:
            all_pos = "; ".join([m.get("pos", "") for m in meanings])
            all_meanings = "; ".join([m.get("meaning", "") for m in meanings])
            first_example = meanings[0].get("example", "") if meanings else ""
            first_example_zh = meanings[0].get("example_zh", "") if meanings else ""
            return {
                "word": item.get("word", ""),
                "phonetic": item.get("phonetic", ""),
                "pos": all_pos,
                "meaning": all_meanings,
                "example": first_example,
                "example_zh": first_example_zh,
                "id": item.get("id", ""),
                "unit": item.get("unit", ""),
                "type": item.get("type", "word"),
                "has_multiple_meanings": True
            }
    else:
        return {
            "word": item.get("word", ""),
            "phonetic": item.get("phonetic", ""),
            "pos": item.get("pos", ""),
            "meaning": item.get("meaning", ""),
            "example": item.get("example", ""),
            "example_zh": item.get("example_zh", ""),
            "id": item.get("id", ""),
            "unit": item.get("unit", ""),
            "type": item.get("type", "word")
        }


st.title("🐅 Tiger English 词汇提取与音频生成工具")

with st.sidebar:
    st.header("🔧 提取 API 配置")
    extract_api_key = st.text_input("提取 API Key", type="password", key="extract_api_key")
    extract_base_url = st.text_input("提取 Base URL", value="https://openrouter.ai/api/v1", key="extract_base_url")
    extract_model_name = render_model_selector(
        "提取模型（下拉勾选，单选）",
        st.session_state.get("extract_model_name", "openai/gpt-4o-mini"),
        "extract_model_picker",
    )
    st.session_state.extract_model_name = extract_model_name
    st.caption(f"提取模型ID：`{extract_model_name}`")
    extract_api_keys_text = st.text_area(
        "提取 API Key 列表（可选，每行一个）",
        value=st.session_state.get("extract_api_keys_text", ""),
        key="extract_api_keys_text",
        help="批量提取时可以配置多个 Key。若多个教材同时提取，将按任务轮询使用。",
    )
    extract_api_keys = parse_api_keys(extract_api_key, extract_api_keys_text)
    st.caption(f"当前可用提取 Key 数量：{len(extract_api_keys)}")

    st.header("音频并发配置")
    audio_max_concurrent = st.slider(
        "TTS 并发数",
        min_value=1,
        max_value=20,
        value=int(st.session_state.get("audio_max_concurrent", MAX_CONCURRENT_TTS)),
        step=1,
        key="audio_max_concurrent",
        help="仅用于音频生成/修复；数值越大速度越快，但失败风险也可能上升。",
    )

tab0, tab1, tab2, tab3, tab4, tab5 = st.tabs([
    "模式零：PDF 预处理",
    "模式一：PDF 提取与校对",
    "模式二：JSONL 导入与音频生成",
    "模式三：JSONL 转 PDF 导出",
    "模式四：单元名称提取",
    "模式五：课文提取"
])

with tab0:
    st.header("PDF 预处理 - 分割左右双列")
    st.info("使用此模式预先分割双列页面，可提高提取准确性。")
    
    preprocess_uploaded_pdf = st.file_uploader("上传教材 PDF（模式零）", type=["pdf"], key="preprocess_pdf_uploader")
    if not preprocess_uploaded_pdf:
        st.warning("请在本页上传 PDF 文件")
    else:
        pre_pdf_bytes = preprocess_uploaded_pdf.getvalue()
        pre_doc = PDFCache.get_doc(pre_pdf_bytes)
        pre_total_p = len(pre_doc)
        col_pre_start, col_pre_end = st.columns(2)
        with col_pre_start:
            pre_start_p = st.number_input("起始页（模式零）", min_value=1, max_value=pre_total_p, value=1, key="preprocess_start_page")
        with col_pre_end:
            pre_end_p = st.number_input("结束页（模式零）", min_value=1, max_value=pre_total_p, value=pre_total_p, key="preprocess_end_page")
        st.subheader("预处理教材标识")
        col_book1, col_book2, col_book3 = st.columns(3)
        with col_book1:
            preprocess_book_version = st.text_input("教材版本（预处理）", "人教版", key="preprocess_book_version")
        with col_book2:
            preprocess_grade = st.selectbox("年级（预处理）", ["七年级", "八年级", "九年级", "高一", "高二", "高三"], key="preprocess_grade")
        with col_book3:
            preprocess_semester = st.selectbox("上下册（预处理）", ["上册", "下册", "全一册"], key="preprocess_semester")

        preprocess_pdf_name = preprocess_uploaded_pdf.name if preprocess_uploaded_pdf else "unknown.pdf"
        preprocess_book_key = build_book_key(preprocess_book_version, preprocess_grade, preprocess_semester, preprocess_pdf_name)
        st.caption(f"预处理匹配键：`{preprocess_book_key}`")

        st.write(f"当前处理范围：第 **{pre_start_p}** 页 到 第 **{pre_end_p}** 页")
        
        col_odd, col_even = st.columns(2)
        with col_odd:
            odd_default_split = st.checkbox("奇数页默认分割", value=False, key="odd_default_split")
            odd_left_ratio = st.slider("奇数页左列比例", 0.3, 0.7, 0.5, 0.05, key="odd_left_ratio")
        with col_even:
            even_default_split = st.checkbox("偶数页默认分割", value=False, key="even_default_split")
            even_left_ratio = st.slider("偶数页左列比例", 0.3, 0.7, 0.5, 0.05, key="even_left_ratio")
        
        st.info(
            f"当前设置：奇数页{'分割' if odd_default_split else '不分割'}（比例 {odd_left_ratio:.2f}），"
            f"偶数页{'分割' if even_default_split else '不分割'}（比例 {even_left_ratio:.2f}）"
        )
        
        col_btn1, col_btn2, col_btn3 = st.columns(3)
        with col_btn1:
            if st.button("🔄 应用默认设置", type="primary", key="btn_apply_defaults"):
                st.session_state.split_mode = {}
                st.session_state.preprocessed_pages = {}
                
                applied_count = 0
                for p_num in range(pre_start_p, pre_end_p + 1):
                    page = pre_doc.load_page(p_num - 1)
                    mat = fitz.Matrix(1.5, 1.5)
                    pix = page.get_pixmap(matrix=mat)
                    img_bytes = pix.tobytes("png")
                    
                    should_split = False
                    left_ratio = 0.5
                    
                    if p_num % 2 == 1 and odd_default_split:
                        should_split = True
                        left_ratio = odd_left_ratio
                    elif p_num % 2 == 0 and even_default_split:
                        should_split = True
                        left_ratio = even_left_ratio
                    
                    if should_split:
                        page_width = pix.width
                        page_height = pix.height
                        left_width = int(page_width * left_ratio)
                        
                        left_rect = fitz.Rect(0, 0, left_width, page_height)
                        right_rect = fitz.Rect(left_width, 0, page_width, page_height)
                        
                        left_pix = page.get_pixmap(matrix=mat, clip=left_rect)
                        right_pix = page.get_pixmap(matrix=mat, clip=right_rect)
                        
                        st.session_state.preprocessed_pages[p_num] = {
                            "mode": "split",
                            "left_ratio": left_ratio,
                            "left_bytes": left_pix.tobytes("png"),
                            "right_bytes": right_pix.tobytes("png")
                        }
                        st.session_state.split_mode[p_num] = "split"
                        st.session_state[f"split_option_{p_num}"] = "分割为左右两列"
                        applied_count += 1
                    else:
                        st.session_state.preprocessed_pages[p_num] = {
                            "mode": "none",
                            "original_bytes": img_bytes
                        }
                        st.session_state.split_mode[p_num] = "none"
                        st.session_state[f"split_option_{p_num}"] = "不分割"
                
                st.success(f"已应用设置：分割 {applied_count} 页，未分割 {pre_end_p - pre_start_p + 1 - applied_count} 页")
                st.rerun()
        
        with col_btn2:
            if st.button("保存预处理结果", key="btn_save_preprocess"):
                saved_preprocess_path = save_preprocess_profile_by_pdf(preprocess_uploaded_pdf.name, pre_start_p, pre_end_p, st.session_state.preprocessed_pages, odd_default_split, odd_left_ratio, even_default_split, even_left_ratio)
                st.success(f"已保存预处理结果，共 {len(st.session_state.preprocessed_pages)} 页\n保存路径：{saved_preprocess_path}")
                st.session_state.split_mode = {}
                st.session_state.preprocessed_pages = {}
                for key in list(st.session_state.keys()):
                    if key.startswith("split_option_"):
                        del st.session_state[key]
                st.rerun()
        
        st.divider()
        
        for p_num in range(pre_start_p, pre_end_p + 1):
            st.subheader(f"第 {p_num} 页（{'奇数页' if p_num % 2 == 1 else '偶数页'}）")
            
            page = pre_doc.load_page(p_num - 1)
            mat = fitz.Matrix(1.5, 1.5)
            pix = page.get_pixmap(matrix=mat)
            img_bytes = pix.tobytes("png")
            
            col_img, col_ctrl = st.columns([2, 1])
            
            with col_img:
                st.image(img_bytes, width="stretch")
            
            with col_ctrl:
                existing_info = st.session_state.preprocessed_pages.get(p_num, {})
                existing_mode = existing_info.get("mode", "none")
                
                split_option = st.radio(
                    "处理方式",
                    ["不分割", "分割为左右两列"],
                    index=0 if existing_mode == "none" else 1,
                    key=f"split_option_{p_num}"
                )
                
                new_mode = "split" if split_option == "分割为左右两列" else "none"
                
                if new_mode != existing_mode:
                    if split_option == "分割为左右两列":
                        st.session_state.split_mode[p_num] = "split"
                        
                        default_ratio = existing_info.get("left_ratio", 0.5)
                        
                        col_ratio1, col_ratio2 = st.columns(2)
                        with col_ratio1:
                            left_ratio = st.slider("左列宽度比例", 0.3, 0.7, default_ratio, 0.05, key=f"left_ratio_{p_num}")
                        with col_ratio2:
                            st.write(f"右列宽度比例: {1-left_ratio:.2f}")
                        
                        page_width = pix.width
                        page_height = pix.height
                        
                        left_width = int(page_width * left_ratio)
                        right_width = page_width - left_width
                        
                        left_rect = fitz.Rect(0, 0, left_width, page_height)
                        right_rect = fitz.Rect(left_width, 0, page_width, page_height)
                        
                        left_pix = page.get_pixmap(matrix=mat, clip=left_rect)
                        right_pix = page.get_pixmap(matrix=mat, clip=right_rect)
                        
                        st.session_state.preprocessed_pages[p_num] = {
                            "mode": "split",
                            "left_ratio": left_ratio,
                            "left_bytes": left_pix.tobytes("png"),
                            "right_bytes": right_pix.tobytes("png")
                        }
                    else:
                        st.session_state.split_mode[p_num] = "none"
                        st.session_state.preprocessed_pages[p_num] = {
                            "mode": "none",
                            "original_bytes": img_bytes
                        }
                    existing_info = st.session_state.preprocessed_pages.get(p_num, {})
                
                if split_option == "分割为左右两列":
                    info = st.session_state.preprocessed_pages.get(p_num, {})
                    if info.get("mode") == "split":
                        st.info(f"已分割（左列比例: {info.get('left_ratio', 0.5):.2f}）")
                        st.markdown("**左列预览：**")
                        st.image(info.get("left_bytes"), width="stretch")
                        st.markdown("**右列预览：**")
                        st.image(info.get("right_bytes"), width="stretch")
                else:
                    st.info("已设置为不分割")
            
            st.divider()
        
        if st.button("完成预处理并进入提取", type="primary", key="btn_finish_preprocess"):
            saved_preprocess_path = save_preprocess_profile_by_pdf(preprocess_uploaded_pdf.name, pre_start_p, pre_end_p, st.session_state.preprocessed_pages, odd_default_split, odd_left_ratio, even_default_split, even_left_ratio)
            st.session_state.preprocessed_range = (pre_start_p, pre_end_p)
            st.success(f"预处理完成！共处理 {len(st.session_state.preprocessed_pages)} 页，已保存配置：{saved_preprocess_path}，请切换到【模式一】进行提取。")
with tab1:
    st.subheader("模式一：PDF 提取（自动匹配预处理 + 边提取边写入）")
    st.caption("上传一个或多个教材 PDF，系统会自动匹配 `教材预处理文档` 下同名 `.预处理.jsonl`，并实时提取写入 `word_data/未录音`。")

    uploaded_pdfs_mode1 = st.file_uploader(
        "上传教材 PDF（可多文件）",
        type=["pdf"],
        accept_multiple_files=True,
        key="mode1_pdf_uploader_multi"
    )

    st.subheader("输出结果命名（按教材）")
    mode1_output_meta = {}
    if uploaded_pdfs_mode1:
        for idx, uf in enumerate(uploaded_pdfs_mode1):
            guessed_bv, guessed_grade, guessed_sem = _parse_book_meta_from_filename(uf.name)
            guessed_bv = (guessed_bv or "人教版").strip()
            guessed_grade = (guessed_grade or "八年级").strip()
            guessed_sem = (guessed_sem or "上册").strip()

            key_suffix = hashlib.md5(f"{idx}_{uf.name}".encode("utf-8")).hexdigest()[:8]
            with st.expander(f"{uf.name} 的输出命名", expanded=False):
                c1, c2, c3 = st.columns(3)
                with c1:
                    meta_bv = st.text_input("教材版本", value=guessed_bv, key=f"mode1_meta_bv_{key_suffix}")
                with c2:
                    meta_grade = st.selectbox("年级", ["七年级", "八年级", "九年级", "高一", "高二", "高三"], index=["七年级", "八年级", "九年级", "高一", "高二", "高三"].index(guessed_grade) if guessed_grade in ["七年级", "八年级", "九年级", "高一", "高二", "高三"] else 1, key=f"mode1_meta_grade_{key_suffix}")
                with c3:
                    meta_sem = st.selectbox("上下册", ["上册", "下册", "全一册"], index=["上册", "下册", "全一册"].index(guessed_sem) if guessed_sem in ["上册", "下册", "全一册"] else 0, key=f"mode1_meta_sem_{key_suffix}")

                mode1_output_meta[uf.name] = {
                    "book_version": (meta_bv or guessed_bv).strip(),
                    "grade": (meta_grade or guessed_grade).strip(),
                    "semester": (meta_sem or guessed_sem).strip(),
                }
    else:
        st.info("上传教材后会自动生成每本教材的输出命名配置。")

    matched_jobs = []
    unmatched_names = []
    if uploaded_pdfs_mode1:
        for uf in uploaded_pdfs_mode1:
            profile = get_preprocess_profile_for_pdf(uf.name)
            if profile:
                matched_jobs.append((uf, profile))
            else:
                unmatched_names.append(uf.name)

        if matched_jobs:
            st.success(f"匹配成功：{len(matched_jobs)} 个教材")
            for uf, profile in matched_jobs:
                st.write(f"- ✅ {uf.name} -> {preprocess_filename_for_pdf(uf.name)}（页码 {profile.get('start_page', '?')}-{profile.get('end_page', '?')}）")
        if unmatched_names:
            st.warning("以下教材未匹配到预处理结果（请先在模式零生成同名预处理文件）：")
            for name in unmatched_names:
                st.write(f"- ❌ {name}")
    else:
        st.info("请先上传一个或多个教材 PDF。")

    btn_mode1_extract = st.button("开始提取并写入（模式一）", type="primary", key="btn_mode1_extract_stream")

    if btn_mode1_extract:
        if not extract_api_keys:
            st.error("请先填入提取 API Key")
        elif not uploaded_pdfs_mode1:
            st.error("请先上传教材 PDF")
        elif not matched_jobs:
            st.error("没有可执行任务：所有上传教材都未匹配到预处理文件。")
        else:
            st.session_state.stop_extraction = False
            ensure_runtime_dirs()
            mode1_progress = st.progress(0)
            mode1_status = st.empty()
            mode1_table_placeholder = st.empty()
            mode1_detail_placeholder = st.empty()

            live_rows = []
            live_recent = {}
            live_unit_stats = {}
            outputs = []

            total_steps = 0
            prepared_jobs = []
            for uf, profile in matched_jobs:
                pdf_bytes = uf.getvalue()
                doc = PDFCache.get_doc(pdf_bytes)
                total_pages = len(doc)
                s_page = max(1, min(int(profile.get("start_page", 1)), total_pages))
                e_page = max(s_page, min(int(profile.get("end_page", total_pages)), total_pages))
                preprocessed_pages = build_preprocessed_pages_from_profile(doc, s_page, e_page, profile)

                tasks = []
                for p_num in range(s_page, e_page + 1):
                    pre_info = preprocessed_pages.get(p_num, {})
                    if pre_info.get("mode") == "split":
                        tasks.append((p_num, "left", pre_info))
                        tasks.append((p_num, "right", pre_info))
                    else:
                        tasks.append((p_num, "full", pre_info))

                if not tasks:
                    continue

                file_meta = mode1_output_meta.get(uf.name, {"book_version": "人教版", "grade": "八年级", "semester": "上册"})
                prepared_jobs.append((uf, pdf_bytes, doc, tasks, file_meta))
                total_steps += len(tasks)

            if not prepared_jobs:
                st.error("没有可执行任务（匹配存在但任务为空）。")
                st.stop()

            done_steps = 0

            def render_mode1_live():
                if not live_rows:
                    return
                with mode1_table_placeholder.container():
                    st.markdown("**提取进度（按教材）**")
                    st.dataframe(pd.DataFrame(live_rows), width="stretch", hide_index=True)
                with mode1_detail_placeholder.container():
                    st.markdown("**实时提取结果（最近词条）**")
                    for pdf_name, rows in live_recent.items():
                        with st.expander(f"{pdf_name}（最近 {len(rows)} 条）", expanded=False):
                            if rows:
                                st.dataframe(pd.DataFrame(rows), width="stretch", hide_index=True)
                            else:
                                st.info("暂无提取结果")

            for job_idx, (uf, pdf_bytes, doc, tasks, file_meta) in enumerate(prepared_jobs):
                job_api_key = pick_api_key_for_job(extract_api_keys, job_idx)
                task_id = f"{make_task_id()}_{job_idx + 1}"
                words_filename = build_result_filename(file_meta["book_version"], file_meta["grade"], file_meta["semester"], "单词表", task_id)
                phrases_filename = build_result_filename(file_meta["book_version"], file_meta["grade"], file_meta["semester"], "短语表", task_id)
                words_file_path = os.path.join(UNRECORDED_DIR, words_filename)
                phrases_file_path = os.path.join(UNRECORDED_DIR, phrases_filename)

                with open(words_file_path, "w", encoding="utf-8") as _wf_init:
                    _wf_init.write("")
                with open(phrases_file_path, "w", encoding="utf-8") as _pf_init:
                    _pf_init.write("")

                live_rows.append({
                    "教材": uf.name,
                    "状态": "running",
                    "总任务": len(tasks),
                    "已完成": 0,
                    "单词": 0,
                    "短语": 0,
                    "单词文件": words_file_path,
                    "短语文件": phrases_file_path,
                })
                live_recent[uf.name] = []
                live_unit_stats[uf.name] = {}
                render_mode1_live()

                last_unit_context = ""
                for step_idx, (p_num, part, pre_info) in enumerate(tasks, start=1):
                    if st.session_state.get("stop_extraction", False):
                        mode1_status.warning("检测到停止信号，已停止。")
                        break

                    part_name = f"第{p_num}页" if part == "full" else f"第{p_num}页-{'左列' if part == 'left' else '右列'}"
                    mode1_status.info(f"[{job_idx + 1}/{len(prepared_jobs)}] {uf.name} -> {part_name}")

                    if pre_info.get("mode") == "split" and part in ["left", "right"]:
                        img_bytes = pre_info.get("left_bytes") if part == "left" else pre_info.get("right_bytes")
                        b64_img = base64.b64encode(img_bytes).decode("utf-8")
                    else:
                        b64_img = pdf_page_to_base64_cached(doc, p_num)

                    page_results = extract_vocab_with_context(
                        b64_img,
                        job_api_key,
                        extract_base_url,
                        extract_model_name,
                        last_unit_context,
                        file_meta["grade"],
                    )

                    if page_results:
                        for item in page_results:
                            item["book_version"] = file_meta["book_version"]
                            item["grade"] = file_meta["grade"]
                            item["semester"] = file_meta["semester"]

                            if "type" not in item:
                                word_text = item.get("word", "")
                                item["type"] = "phrase" if " " in word_text.strip() else "word"

                            last_unit_context = item.get("unit", last_unit_context)

                            if not item.get("meanings") or len(item.get("meanings", [])) == 0:
                                item["meanings"] = [{
                                    "pos": item.get("pos", ""),
                                    "meaning": item.get("meaning", ""),
                                    "example": item.get("example", ""),
                                    "example_zh": item.get("example_zh", "")
                                }]

                            word_clean = "".join([c for c in item.get("word", "") if c.isalpha() or c.isspace() or c == "'"]).strip().replace(" ", "_")
                            item["id"] = get_unique_id(
                                word_clean,
                                last_unit_context,
                                file_meta["grade"],
                                file_meta.get("semester", ""),
                                file_meta.get("book_version", ""),
                                item.get("source_tag", "current_book"),
                            )

                            unit_name = item.get("unit", "Unit ?")
                            if unit_name not in live_unit_stats[uf.name]:
                                live_unit_stats[uf.name][unit_name] = {"word": 0, "phrase": 0}

                            row_ref = live_rows[-1]
                            if item["type"] == "word":
                                item["word_audio"] = ""
                                append_to_jsonl(words_file_path, item)
                                row_ref["单词"] += 1
                                live_unit_stats[uf.name][unit_name]["word"] += 1
                            else:
                                item["phrase_audio"] = ""
                                append_to_jsonl(phrases_file_path, item)
                                row_ref["短语"] += 1
                                live_unit_stats[uf.name][unit_name]["phrase"] += 1

                            meaning_text = ""
                            if isinstance(item.get("meanings"), list) and item.get("meanings"):
                                meaning_text = item.get("meanings")[0].get("meaning", "")
                            live_recent[uf.name].append({
                                "unit": item.get("unit", ""),
                                "type": item.get("type", ""),
                                "word": item.get("word", ""),
                                "meaning": meaning_text,
                            })
                            if len(live_recent[uf.name]) > 120:
                                live_recent[uf.name] = live_recent[uf.name][-120:]

                    live_rows[-1]["已完成"] = step_idx
                    done_steps += 1
                    mode1_progress.progress(done_steps / max(1, total_steps))
                    render_mode1_live()

                live_rows[-1]["状态"] = "done"
                outputs.append({
                    "pdf": uf.name,
                    "words": words_file_path,
                    "phrases": phrases_file_path,
                })
                render_mode1_live()

            mode1_status.success("提取完成（已边提取边写入）。")
            st.subheader("提取完成统计（按教材 -> 单元）")
            for pdf_name, unit_map in live_unit_stats.items():
                st.markdown(f"**{pdf_name}**")
                for unit_name in sorted(unit_map.keys(), key=lambda x: int(re.search(r"(\d+)", x).group(1)) if re.search(r"(\d+)", x) else 9999):
                    wc = unit_map[unit_name].get("word", 0)
                    pc = unit_map[unit_name].get("phrase", 0)
                    st.write(f"- {unit_name}: 单词 {wc}，短语 {pc}")
            st.subheader("输出文件")
            for out in outputs:
                st.write(f"- {out.get('pdf','')} | 单词: {out.get('words','')} | 短语: {out.get('phrases','')}")

with tab2:
    st.info("在此模式下，您可以导入已保存的 JSONL 文件来生成或修复音频。")

    col_upload1, col_upload2, col_upload3 = st.columns(3)
    with col_upload1:
        uploaded_words = st.file_uploader("上传单词 JSONL 文件（未录音版，可批量）", type=["jsonl"], accept_multiple_files=True, key="words_uploader")
    with col_upload2:
        uploaded_phrases = st.file_uploader("上传短语 JSONL 文件（未录音版，可批量）", type=["jsonl"], accept_multiple_files=True, key="phrases_uploader")
    with col_upload3:
        uploaded_passages = st.file_uploader("上传课文 JSONL 文件（可批量）", type=["jsonl"], accept_multiple_files=True, key="passages_uploader")

    upload_tasks = []
    for wf in (uploaded_words or []):
        upload_tasks.append((wf, "word"))
    for pf in (uploaded_phrases or []):
        upload_tasks.append((pf, "phrase"))
    for tf in (uploaded_passages or []):
        upload_tasks.append((tf, "passage"))

    overwrite_mode = "保留历史"
    btn_jsonl = False
    if upload_tasks:
        st.info('📁 单词/短语写入 word_data/已录音；课文句子音频写入 passage_audio（支持批量顺序处理）')
        if uploaded_words:
            st.write(f"单词文件数量：{len(uploaded_words)}")
        if uploaded_phrases:
            st.write(f"短语文件数量：{len(uploaded_phrases)}")
        if uploaded_passages:
            st.write(f"课文文件数量：{len(uploaded_passages)}")

        existing_by_source = {}
        for uploaded_file, source_type in upload_tasks:
            base_name = build_recorded_output_base(uploaded_file.name, source_type)
            existing_by_source[uploaded_file.name] = list_existing_recorded_versions(base_name)

        conflict_count = sum(1 for _, existing in existing_by_source.items() if existing)
        if conflict_count > 0:
            st.warning(f"检测到 {conflict_count} 个来源文件在“已录音”目录已有历史版本。")
            with st.expander("查看同源历史文件", expanded=False):
                for source_name, files in existing_by_source.items():
                    if not files:
                        continue
                    st.markdown(f"**{source_name}**")
                    for p in files:
                        st.write(f"- {os.path.basename(p)}")
            overwrite_mode = st.radio(
                "同源文件处理策略",
                options=["保留历史", "覆盖同源历史"],
                index=0,
                horizontal=True,
                help="保留历史：新建时间戳文件；覆盖同源历史：先删除同源旧文件再写入新文件。",
                key="mode2_overwrite_strategy",
            )
        else:
            st.caption("未检测到同源历史文件，将直接按“来源文件名 + 时间戳”写入。")

        btn_jsonl = st.button("🎵 开始生成音频", type="primary", width="stretch", key="btn_jsonl_record")

    if btn_jsonl:
        st.session_state.jsonl_audio_data = []
        st.session_state.is_generating_audio = True
        
        main_progress = st.progress(0)
        main_status = st.empty()
        table_placeholder_2 = st.empty()
        detail_placeholder_2 = st.empty()
        
        start_time_2 = time.time()
        ensure_runtime_dirs()
        os.makedirs(AUDIO_DIR, exist_ok=True)
        os.makedirs(PASSAGE_AUDIO_DIR, exist_ok=True)

        def load_existing_items_map(file_path):
            items_map = {}
            if not os.path.exists(file_path):
                return items_map
            try:
                with open(file_path, 'r', encoding='utf-8-sig') as f:
                    for line in f:
                        if not line.strip():
                            continue
                        try:
                            row = _load_json_line(line)
                            rid = row.get("id")
                            if rid:
                                items_map[rid] = row
                        except Exception:
                            continue
            except Exception:
                pass
            return items_map

        def is_valid_audio_file(audio_path):
            return bool(audio_path and os.path.exists(audio_path) and os.path.getsize(audio_path) > 0)

        def find_audio_filename_by_rule(uid, expected_filename, audio_dir=AUDIO_DIR, example_idx=None):
            expected_abs = os.path.join(audio_dir, expected_filename)
            if is_valid_audio_file(expected_abs):
                return expected_filename

            if not os.path.exists(audio_dir):
                return ""

            try:
                files = [f for f in os.listdir(audio_dir) if f.endswith('.mp3') and f.startswith(f"{uid}_")]
            except Exception:
                files = []

            if example_idx is None:
                candidates = [f for f in files if '_ex_' not in f and '_sent_' not in f]
            else:
                suffix_a = f"_ex_{example_idx}.mp3"
                suffix_b = f"_sent_{example_idx}.mp3"
                candidates = [f for f in files if f.endswith(suffix_a) or f.endswith(suffix_b)]

            for name in sorted(candidates):
                abs_path = os.path.join(audio_dir, name)
                if is_valid_audio_file(abs_path):
                    return name
            return ""

        def resolve_audio_rel(current_rel_path, uid, expected_filename, audio_dir=AUDIO_DIR, rel_prefix="audio", example_idx=None):
            if current_rel_path:
                abs_from_rel = to_abs_audio_path(current_rel_path)
                if is_valid_audio_file(abs_from_rel):
                    return current_rel_path, True

            found_name = find_audio_filename_by_rule(uid, expected_filename, audio_dir=audio_dir, example_idx=example_idx)
            if found_name:
                return f"./{rel_prefix}/{found_name}", True

            return f"./{rel_prefix}/{expected_filename}", False

        def load_items_from_uploaded(uploaded_file, source_type):
            parsed = []
            inferred_source_tag = infer_source_tag_from_filename(uploaded_file.name)
            for line in uploaded_file.getvalue().decode("utf-8-sig", errors="replace").splitlines():
                if not line.strip():
                    continue
                item = _load_json_line(line)
                if inferred_source_tag and not str(item.get("source_tag", "") or "").strip():
                    item["source_tag"] = inferred_source_tag
                item["_source_type"] = source_type
                item["_source_file"] = uploaded_file.name
                parsed.append(item)
            return parsed

        def pick_meta(items):
            for row in items:
                bv = (row.get("book_version", "") or "").strip()
                gg = (row.get("grade", "") or "").strip()
                ss = (row.get("semester", "") or "").strip()
                if bv or gg or ss:
                    return (
                        bv or st.session_state.get("book_version", "未知版本"),
                        gg or st.session_state.get("grade_select", "未知年级"),
                        ss or st.session_state.get("semester_select", "未知册别"),
                    )
            return (
                st.session_state.get("book_version", "未知版本"),
                st.session_state.get("grade_select", "未知年级"),
                st.session_state.get("semester_select", "未知册别"),
            )

        main_status.text("📋 正在顺序处理批量音频任务...")

        global_success_total = 0
        global_fail_total = 0
        global_skipped_total = 0
        global_already_processed = 0
        aggregated_items = []
        generated_files = []
        live_rows_mode2 = []
        live_items_mode2 = {}

        def render_mode2_live_table(rows):
            if not rows:
                return
            with table_placeholder_2.container():
                st.markdown("**音频任务实时进度（按文件）**")
                st.dataframe(pd.DataFrame(rows), width="stretch", hide_index=True)

        st.markdown("**实时回传（按文件，增量追加）**")
        detail_area = detail_placeholder_2.container()
        file_detail_slots = {}
        file_detail_seen_ids = {}

        def ensure_mode2_file_panel(src_file):
            if src_file in file_detail_slots:
                return
            with detail_area:
                with st.expander(f"{src_file}（实时）", expanded=False):
                    slot = st.empty()
            file_detail_slots[src_file] = slot
            file_detail_seen_ids[src_file] = set()

        def render_mode2_file_detail(src_file):
            slot = file_detail_slots.get(src_file)
            src_items = live_items_mode2.get(src_file, [])
            if not slot:
                return
            with slot.container():
                st.caption(f"已回传 {len(src_items)} 条（新条目自动追加到末尾）")
                vocab_items = []
                passage_rows = []
                for item in src_items:
                    if item.get("type") == "passage":
                        target_id = item.get("target_id", "")
                        for s_idx, s in enumerate(item.get("sentences", []), start=1):
                            if not isinstance(s, dict):
                                continue
                            passage_rows.append({
                                "target_id": target_id,
                                "句序": s_idx,
                                "英文": s.get("en", ""),
                                "中文": s.get("zh", ""),
                                "audio": s.get("audio", ""),
                            })
                        continue

                    flat = flatten_meanings_for_display(item)
                    if item.get("type") == "word":
                        flat["word_audio"] = item.get("word_audio", "")
                    else:
                        flat["word_audio"] = item.get("phrase_audio", "")
                    meanings = item.get("meanings", [])
                    if meanings:
                        flat["example_audio"] = meanings[0].get("example_audio", "") if meanings else ""
                    vocab_items.append(flat)

                if vocab_items:
                    render_vocab_audio_rows(vocab_items)

                if passage_rows:
                    st.markdown("**课文句子音频（实时行内试听）**")
                    h1, h2, h3, h4 = st.columns([2, 3, 3, 2])
                    h1.markdown("**目标**")
                    h2.markdown("**英文**")
                    h3.markdown("**中文**")
                    h4.markdown("**试听**")
                    for row in passage_rows:
                        c1, c2, c3, c4 = st.columns([2, 3, 3, 2])
                        c1.write(f"{row.get('target_id', '')} | 第{row.get('句序', '')}句")
                        c2.write(row.get("英文", ""))
                        c3.write(row.get("中文", ""))
                        audio_abs = to_abs_audio_path((row.get("audio", "") or "").strip())
                        if audio_abs and os.path.exists(audio_abs) and os.path.getsize(audio_abs) > 0:
                            with open(audio_abs, "rb") as af:
                                c4.audio(af.read(), format="audio/mp3")
                        else:
                            c4.caption("无音频")

        def append_mode2_live_item(src_file, item):
            ensure_mode2_file_panel(src_file)
            rid = (item.get("id", "") or "").strip()
            if rid and rid in file_detail_seen_ids.get(src_file, set()):
                return
            live_items_mode2.setdefault(src_file, []).append(dict(item))
            if rid:
                file_detail_seen_ids[src_file].add(rid)
            render_mode2_file_detail(src_file)

        for file_idx, (uploaded_file, source_type) in enumerate(upload_tasks):
            all_items = load_items_from_uploaded(uploaded_file, source_type)
            if not all_items:
                main_progress.progress((file_idx + 1) / len(upload_tasks))
                continue

            _ = pick_meta(all_items)
            base_name = build_recorded_output_base(uploaded_file.name, source_type)
            existing_versions = list_existing_recorded_versions(base_name)
            if overwrite_mode == "覆盖同源历史" and existing_versions:
                for old_file in existing_versions:
                    try:
                        os.remove(old_file)
                    except Exception:
                        pass
            file_name = f"{base_name}_{make_task_id()}.jsonl"
            name_try = 1
            while os.path.exists(os.path.join(RECORDED_DIR, file_name)):
                file_name = f"{base_name}_{make_task_id()}_{name_try:02d}.jsonl"
                name_try += 1
            save_path = os.path.join(RECORDED_DIR, file_name)

            live_row = {
                "文件": uploaded_file.name,
                "类型": source_type,
                "状态": "running",
                "总条数": len(all_items),
                "已处理": 0,
                "新生成音频": 0,
                "跳过": 0,
                "失败": 0,
                "输出": save_path,
            }
            live_rows_mode2.append(live_row)
            live_items_mode2[uploaded_file.name] = []
            ensure_mode2_file_panel(uploaded_file.name)
            render_mode2_live_table(live_rows_mode2)

            existing_items_map = load_existing_items_map(save_path)

            for i, uploaded_item in enumerate(all_items):
                item_type = (uploaded_item.get("type", "") or uploaded_item.get("item_type", "") or source_type)
                audio_tasks_for_item = []
                item_success = 0
                item_fail = 0

                if item_type == "passage":
                    target_id = (uploaded_item.get("target_id", "") or "").strip()
                    if not target_id:
                        target_id = f"{uploaded_item.get('unit','Unit ?')} Section {uploaded_item.get('section','')} {uploaded_item.get('label','')}".strip()

                    uid_seed = f"{target_id}|{uploaded_item.get('book_version','')}|{uploaded_item.get('grade','')}|{uploaded_item.get('semester','')}|{uploaded_item.get('source_tag','')}"
                    uid = hashlib.md5(uid_seed.encode("utf-8")).hexdigest()[:12]
                    uploaded_item["id"] = uid

                    item = existing_items_map.get(uid, uploaded_item)
                    if uid in existing_items_map:
                        global_already_processed += 1

                    for core_key in ["unit", "section", "label", "target_id", "title", "passage_text", "source_pages", "book_version", "grade", "semester", "type", "id", "_source_file"]:
                        if core_key in uploaded_item:
                            item[core_key] = uploaded_item.get(core_key)

                    if not isinstance(item.get("sentences"), list):
                        item["sentences"] = uploaded_item.get("sentences", []) if isinstance(uploaded_item.get("sentences"), list) else []

                    sentences = item.get("sentences", [])
                    for sent_idx, s_item in enumerate(sentences):
                        if not isinstance(s_item, dict):
                            continue
                        sent_en = (s_item.get("en", "") or "").strip()
                        if not sent_en:
                            continue
                        sent_filename = f"{uid}_sent_{sent_idx}.mp3"
                        current_sent_rel = s_item.get("audio", "")
                        resolved_sent_rel, sent_exists = resolve_audio_rel(
                            current_sent_rel,
                            uid,
                            sent_filename,
                            audio_dir=PASSAGE_AUDIO_DIR,
                            rel_prefix="passage_audio",
                            example_idx=sent_idx,
                        )
                        s_item["audio"] = resolved_sent_rel
                        if sent_exists:
                            global_skipped_total += 1
                        else:
                            audio_tasks_for_item.append((sent_en, os.path.join(PASSAGE_AUDIO_DIR, sent_filename)))

                    display_name = target_id[:20] if target_id else "passage"
                else:
                    word = uploaded_item.get("word", "")
                    if not word:
                        continue

                    word_clean = "".join([c for c in word if c.isalpha() or c.isspace() or c == "'"]).strip().replace(" ", "_")
                    uid = uploaded_item.get(
                        "id",
                        get_unique_id(
                            word_clean,
                            uploaded_item.get("unit", "unk"),
                            uploaded_item.get("grade", "unk"),
                            uploaded_item.get("semester", ""),
                            uploaded_item.get("book_version", ""),
                            uploaded_item.get("source_tag", ""),
                        ),
                    )
                    uploaded_item["id"] = uid

                    item = existing_items_map.get(uid, uploaded_item)
                    if uid in existing_items_map:
                        global_already_processed += 1

                    for core_key in ["word", "unit", "type", "book_version", "grade", "semester", "phonetic", "_source_file"]:
                        if core_key in uploaded_item:
                            item[core_key] = uploaded_item.get(core_key)

                    if not isinstance(item.get("meanings"), list) or not item.get("meanings"):
                        item["meanings"] = uploaded_item.get("meanings", []) if isinstance(uploaded_item.get("meanings"), list) else []

                    main_field = "word_audio" if item_type == "word" else "phrase_audio"
                    main_filename = f"{uid}_{word_clean}.mp3"
                    current_main_rel = item.get(main_field, "")
                    resolved_main_rel, main_exists = resolve_audio_rel(
                        current_main_rel,
                        uid,
                        main_filename,
                        audio_dir=AUDIO_DIR,
                        rel_prefix="audio",
                        example_idx=None,
                    )
                    item[main_field] = resolved_main_rel

                    if main_exists:
                        global_skipped_total += 1
                    else:
                        audio_tasks_for_item.append((word, os.path.join(AUDIO_DIR, main_filename)))

                    meanings = item.get("meanings", [])
                    if isinstance(meanings, list):
                        for meaning_idx, m in enumerate(meanings):
                            if not isinstance(m, dict):
                                continue
                            example = (m.get("example", "") or "").strip()
                            if not example:
                                continue

                            ex_filename = f"{uid}_{word_clean}_ex_{meaning_idx}.mp3"
                            current_ex_rel = m.get("example_audio", "")
                            resolved_ex_rel, ex_exists = resolve_audio_rel(
                                current_ex_rel,
                                uid,
                                ex_filename,
                                audio_dir=AUDIO_DIR,
                                rel_prefix="audio",
                                example_idx=meaning_idx,
                            )
                            m["example_audio"] = resolved_ex_rel

                            if ex_exists:
                                global_skipped_total += 1
                            else:
                                audio_tasks_for_item.append((example, os.path.join(AUDIO_DIR, ex_filename)))

                    display_name = word[:20]

                if "_source_type" in item:
                    del item["_source_type"]

                if audio_tasks_for_item:
                    main_status.text(f"🎵 [{file_idx + 1}/{len(upload_tasks)}] {uploaded_file.name} -> {display_name}")
                    s, f = generate_audios_in_batch(audio_tasks_for_item, None, None, max_concurrent=audio_max_concurrent)
                    global_success_total += s
                    global_fail_total += f
                    item_success = s
                    item_fail = f

                existing_items_map[uid] = item

                live_row["已处理"] = i + 1
                live_row["新生成音频"] += item_success
                live_row["失败"] += item_fail
                live_row["跳过"] = max(0, global_skipped_total)

                with open(save_path, 'w', encoding='utf-8') as wf_snap:
                    for row in existing_items_map.values():
                        clean_row = _sanitize_item_for_jsonl(row)
                        wf_snap.write(json.dumps(clean_row, ensure_ascii=False) + '\n')

                append_mode2_live_item(uploaded_file.name, item)
                render_mode2_live_table(live_rows_mode2)

                main_status.text(
                    f"📋 文件进度: {i + 1}/{len(all_items)} | 批次: {file_idx + 1}/{len(upload_tasks)} | "
                    f"新生成: {global_success_total}, 跳过: {global_skipped_total}, 已处理: {global_already_processed}"
                )

            for row in existing_items_map.values():
                aggregated_items.append(dict(row))

            live_row["状态"] = "done"

            render_mode2_live_table(live_rows_mode2)
            generated_files.append(save_path)
            main_progress.progress((file_idx + 1) / len(upload_tasks))

        st.session_state.jsonl_audio_data = aggregated_items

        file_summary = "\n".join([f"- `{p}`" for p in generated_files]) if generated_files else "- 无输出文件"
        main_status.success(
            f"✅ 批量处理完成！新生成: {global_success_total}, 跳过已存在音频: {global_skipped_total}, "
            f"已处理过: {global_already_processed}, 失败: {global_fail_total}\n输出文件：\n{file_summary}"
        )
        
        elapsed = int(time.time() - start_time_2)
        st.session_state.task_duration = f"{elapsed}秒"
        
        main_progress.empty()
        st.session_state.is_generating_audio = False
        st.rerun()
with tab2:
    if not st.session_state.is_generating_audio and st.session_state.jsonl_audio_data:
        st.success(f"🎉 音频生成完成！耗时：**{st.session_state.task_duration}**")
        st.balloons()
        
        st.subheader("📊 音频结果")
    
        display_items = []
        passage_items_all = []
        for item in st.session_state.jsonl_audio_data:
            item_type = item.get("type")
            if item_type == "passage":
                passage_items_all.append(item)
                continue
    
            flat = flatten_meanings_for_display(item)
            if item_type == "word":
                flat["word_audio"] = item.get("word_audio", "")
            else:
                flat["word_audio"] = item.get("phrase_audio", "")
            meanings = item.get("meanings", [])
            if meanings:
                flat["example_audio"] = meanings[0].get("example_audio", "") if meanings else ""
            display_items.append(flat)
    
        grouped_audio = {}
        for src_item in st.session_state.jsonl_audio_data:
            src_file = (src_item.get("_source_file", "未标注来源") or "未标注来源").strip()
            grouped_audio.setdefault(src_file, []).append(src_item)
    
        st.subheader("按文件查看（动态汇总）")
        for src_file, src_items in grouped_audio.items():
            with st.expander(f"{src_file}（{len(src_items)} 条）", expanded=False):
                file_vocab_items = []
                file_passage_rows = []
                for item in src_items:
                    if item.get("type") == "passage":
                        target_id = item.get("target_id", "")
                        for s_idx, s in enumerate(item.get("sentences", []), start=1):
                            if not isinstance(s, dict):
                                continue
                            file_passage_rows.append({
                                "target_id": target_id,
                                "句序": s_idx,
                                "英文": s.get("en", ""),
                                "中文": s.get("zh", ""),
                                "audio": s.get("audio", ""),
                            })
                        continue
    
                    flat = flatten_meanings_for_display(item)
                    if item.get("type") == "word":
                        flat["word_audio"] = item.get("word_audio", "")
                    else:
                        flat["word_audio"] = item.get("phrase_audio", "")
                    meanings = item.get("meanings", [])
                    if meanings:
                        flat["example_audio"] = meanings[0].get("example_audio", "") if meanings else ""
                    file_vocab_items.append(flat)
    
                if file_vocab_items:
                    render_vocab_audio_rows(file_vocab_items)
    
                if file_passage_rows:
                    st.markdown("**课文句子音频（行内试听）**")
                    h1, h2, h3, h4 = st.columns([2, 3, 3, 2])
                    h1.markdown("**目标**")
                    h2.markdown("**英文**")
                    h3.markdown("**中文**")
                    h4.markdown("**试听**")
                    for row in file_passage_rows:
                        c1, c2, c3, c4 = st.columns([2, 3, 3, 2])
                        c1.write(f"{row.get('target_id', '')} | 第{row.get('句序', '')}句")
                        c2.write(row.get("英文", ""))
                        c3.write(row.get("中文", ""))
                        audio_rel = (row.get("audio", "") or "").strip()
                        audio_abs = to_abs_audio_path(audio_rel)
                        if audio_abs and os.path.exists(audio_abs) and os.path.getsize(audio_abs) > 0:
                            with open(audio_abs, "rb") as af:
                                c4.audio(af.read(), format="audio/mp3")
                        else:
                            c4.caption("无音频")

        if display_items:
            render_vocab_audio_rows(display_items)
    
        if passage_items_all:
            article_ids = set()
            audio_count = 0
            for rec in passage_items_all:
                article_key = rec.get("id") or rec.get("target_id") or f"passage_{len(article_ids)+1}"
                article_ids.add(article_key)
                for s in rec.get("sentences", []):
                    if not isinstance(s, dict):
                        continue
                    audio_rel = (s.get("audio", "") or "").strip()
                    audio_abs = to_abs_audio_path(audio_rel)
                    if audio_abs and os.path.exists(audio_abs) and os.path.getsize(audio_abs) > 0:
                        audio_count += 1
            st.subheader("课文句子音频总览")
            st.info(f"共为 **{len(article_ids)}** 篇文章生成了 **{audio_count}** 条句子音频。")

        st.divider()
        st.subheader("🔧 音频修复工具")
        
        def check_audio_status(audio_path):
            if not audio_path:
                return "missing"

            full_path = to_abs_audio_path(audio_path)
            if not os.path.exists(full_path):
                return "missing"
            if os.path.getsize(full_path) == 0:
                return "empty"
            return "ok"
    
        damaged_items = []
        for item in st.session_state.jsonl_audio_data:
            item_type = item.get("type", "word")
            word = item.get("word", "") or item.get("target_id", "")
            item_id = item.get("id", "")
    
            if item_type == "word":
                word_audio = item.get("word_audio", "")
                status = check_audio_status(word_audio)
                if status in ["missing", "empty"]:
                    damaged_items.append({
                        "id": item_id,
                        "word": word,
                        "type": "word",
                        "audio_type": "单词发音",
                        "audio_path": word_audio,
                        "status": "缺失" if status == "missing" else "空文件"
                    })
            elif item_type == "phrase":
                phrase_audio = item.get("phrase_audio", "")
                status = check_audio_status(phrase_audio)
                if status in ["missing", "empty"]:
                    damaged_items.append({
                        "id": item_id,
                        "word": word,
                        "type": "phrase",
                        "audio_type": "短语发音",
                        "audio_path": phrase_audio,
                        "status": "缺失" if status == "missing" else "空文件"
                    })
            elif item_type == "passage":
                for s in item.get("sentences", []):
                    if not isinstance(s, dict):
                        continue
                    sent_en = (s.get("en", "") or "").strip()
                    sent_audio = s.get("audio", "")
                    status = check_audio_status(sent_audio)
                    if status in ["missing", "empty"] and sent_en:
                        damaged_items.append({
                            "id": item_id,
                            "word": word,
                            "type": "passage",
                            "audio_type": "课文句子发音",
                            "audio_path": sent_audio,
                            "text_to_generate": sent_en,
                            "status": "缺失" if status == "missing" else "空文件"
                        })
    
            meanings = item.get("meanings", [])
            if meanings:
                example = meanings[0].get("example", "")
                example_audio = meanings[0].get("example_audio", "")
                status = check_audio_status(example_audio)
                if status in ["missing", "empty"] and example:
                    damaged_items.append({
                        "id": item_id,
                        "word": word,
                        "type": item_type,
                        "audio_type": "例句发音",
                        "audio_path": example_audio,
                        "text_to_generate": example,
                        "status": "缺失" if status == "missing" else "空文件"
                    })
    
        if damaged_items:
            st.warning(f"发现 {len(damaged_items)} 个音频文件缺失或损坏")
            
            damaged_df = pd.DataFrame(damaged_items)
            st.dataframe(damaged_df[["word", "type", "audio_type", "status"]], width="stretch")
            
            col_regen1, col_regen2 = st.columns(2)
            with col_regen1:
                if st.button("🔄 修复全部音频", type="primary", key="btn_repair_all_audio"):
                    repair_tasks = []
                    for d_item in damaged_items:
                        if d_item.get("text_to_generate"):
                            text = d_item["text_to_generate"]
                        else:
                            text = d_item["word"]
                        
                        audio_path = d_item["audio_path"]
                        if audio_path:
                            full_path = to_abs_audio_path(audio_path)
                            repair_tasks.append((text, full_path))
                    
                    if repair_tasks:
                        repair_progress = st.progress(0)
                        repair_status = st.empty()
                        success, fail = generate_audios_in_batch(repair_tasks, repair_progress, repair_status, max_concurrent=audio_max_concurrent)
                        st.success(f"修复完成：成功 {success} 个，失败 {fail} 个")
                        st.rerun()
            
            with col_regen2:
                selected_word = st.selectbox("选择要修复的单词/短语", 
                                             options=[d["word"] for d in damaged_items],
                                             key="select_damaged_word")
                
                if st.button("🔧 修复选中项", key="btn_repair_selected"):
                    selected_items = [d for d in damaged_items if d["word"] == selected_word]
                    repair_tasks = []
                    for d_item in selected_items:
                        if d_item.get("text_to_generate"):
                            text = d_item["text_to_generate"]
                        else:
                            text = d_item["word"]
                        
                        audio_path = d_item["audio_path"]
                        if audio_path:
                            full_path = to_abs_audio_path(audio_path)
                            repair_tasks.append((text, full_path))
                    
                    if repair_tasks:
                        repair_progress = st.progress(0)
                        repair_status = st.empty()
                        success, fail = generate_audios_in_batch(repair_tasks, repair_progress, repair_status, max_concurrent=audio_max_concurrent)
                        if success > 0:
                            st.success(f"修复成功 {success} 个")
                        if fail > 0:
                            st.warning(f"修复失败 {fail} 个")
                        st.rerun()
        else:
            st.success("✅ 所有音频文件正常")
    
    class PDFVocabGenerator:
        def __init__(self, page_width=595, page_height=842, margin=35):
            self.page_width = page_width
            self.page_height = page_height
            self.margin = margin
            self.y_position = margin
            self.line_height = 16
            self.doc = fitz.open()
            self.page = None
            self.chinese_font = "china-s"
            self.english_font = "helv"
            self.content_width = page_width - 2 * margin
        
        def add_new_page(self):
            self.page = self.doc.new_page(width=self.page_width, height=self.page_height)
            self.y_position = self.margin
            return self.page
        
        def check_page_break(self, needed_height):
            if self.y_position + needed_height > self.page_height - self.margin:
                self.add_new_page()
                return True
            return False
        
        def draw_text(self, text, fontsize=9, color=(0, 0, 0), x_offset=0, fontname=None):
            x = self.margin + x_offset
            y = self.y_position + fontsize
            use_font = fontname if fontname else self.chinese_font
            self.page.insert_text((x, y), text, fontsize=fontsize, fontname=use_font, color=color)
        
        def draw_english_text(self, text, fontsize=9, color=(0, 0, 0), x_offset=0):
            self.draw_text(text, fontsize=fontsize, color=color, x_offset=x_offset, fontname=self.english_font)
        
        def draw_unit_header(self, unit_name):
            self.y_position += 5
            self.page.draw_rect(
                fitz.Rect(self.margin - 5, self.y_position - 5,
                          self.page_width - self.margin + 5, self.y_position + 28),
                color=(0.95, 0.95, 0.95), fill=True, width=1.5
            )
            self.draw_text(unit_name, fontsize=14, color=(0, 0, 0), x_offset=10, fontname="helv")
            self.y_position += 38
        
        def draw_section_header(self, section_name):
            self.y_position += 3
            self.page.draw_rect(
                fitz.Rect(self.margin, self.y_position - 2,
                          self.margin + 60, self.y_position + 14),
                color=(0.85, 0.85, 0.85), fill=True, width=0
            )
            self.draw_text(section_name, fontsize=9, color=(0.2, 0.2, 0.2), x_offset=5)
            self.y_position += 18
        
        def draw_table_header(self, headers, widths):
            self.page.draw_rect(
                fitz.Rect(self.margin, self.y_position - 2,
                          self.page_width - self.margin, self.y_position + 16),
                color=(0.92, 0.92, 0.92), fill=True, width=0
            )
            x_pos = 0
            for header, width in zip(headers, widths):
                self.draw_text(header, fontsize=8, color=(0.2, 0.2, 0.2), x_offset=x_pos + 3)
                x_pos += width
            self.y_position += 20
        
        def get_pdf_bytes(self):
            return self.doc.tobytes()
        
        def close(self):
            self.doc.close()
    
    
with tab3:
    st.header("📄 JSONL 转 PDF 导出")
    st.info("在此模式下，您可以将 JSONL 文件转换为格式规范的 PDF 词汇表。")
    
    col_upload1, col_upload2 = st.columns(2)
    with col_upload1:
        st.subheader("上传单词表")
        words_jsonl_file = st.file_uploader("单词 JSONL 文件", type=["jsonl"], key="words_jsonl_for_pdf")
        if words_jsonl_file:
            st.success(f"已加载: {words_jsonl_file.name}")
    
    with col_upload2:
        st.subheader("上传短语表")
        phrases_jsonl_file = st.file_uploader("短语 JSONL 文件", type=["jsonl"], key="phrases_jsonl_for_pdf")
        if phrases_jsonl_file:
            st.success(f"已加载: {phrases_jsonl_file.name}")
    
    st.divider()
    
    def extract_title_from_filename(filename):
        name = filename.replace(".jsonl", "")
        parts = name.split("_")
        if len(parts) >= 3:
            return f"{parts[0]}{parts[1]}{parts[2]}单词短语表"
        return "单词短语表"
    
    default_title = "单词短语表"
    if words_jsonl_file:
        default_title = extract_title_from_filename(words_jsonl_file.name)
    elif phrases_jsonl_file:
        default_title = extract_title_from_filename(phrases_jsonl_file.name)
    
    pdf_title = st.text_input("PDF 标题", value=default_title, key="pdf_title_input")
    
    if st.button("📄 生成 PDF", type="primary", key="btn_generate_pdf"):
        if not words_jsonl_file and not phrases_jsonl_file:
            st.error("请先上传至少一个 JSONL 文件")
        else:
            words_data = []
            phrases_data = []
            
            if words_jsonl_file:
                try:
                    for line in words_jsonl_file.getvalue().decode("utf-8-sig").splitlines():
                        if line.strip():
                            item = _load_json_line(line)
                            item_type = item.get("type", "")
                            if item_type == "word":
                                words_data.append(item)
                            elif item_type == "phrase":
                                phrases_data.append(item)
                            else:
                                word_text = item.get("word", "")
                                if " " in word_text.strip():
                                    phrases_data.append(item)
                                else:
                                    words_data.append(item)
                except Exception as e:
                    st.error(f"单词文件解析错误: {e}")
            
            if phrases_jsonl_file:
                try:
                    for line in phrases_jsonl_file.getvalue().decode("utf-8-sig").splitlines():
                        if line.strip():
                            item = _load_json_line(line)
                            item_type = item.get("type", "")
                            if item_type == "phrase":
                                phrases_data.append(item)
                            elif item_type == "word":
                                words_data.append(item)
                            else:
                                word_text = item.get("word", "")
                                if " " in word_text.strip():
                                    phrases_data.append(item)
                                else:
                                    words_data.append(item)
                except Exception as e:
                    st.error(f"短语文件解析错误: {e}")
            
            if not words_data and not phrases_data:
                st.error("未找到有效数据")
            else:
                units_dict = {}
                
                for item in words_data:
                    unit = item.get("unit", "Unit 0")
                    if unit not in units_dict:
                        units_dict[unit] = {"words": [], "phrases": []}
                    units_dict[unit]["words"].append(item)
                
                for item in phrases_data:
                    unit = item.get("unit", "Unit 0")
                    if unit not in units_dict:
                        units_dict[unit] = {"words": [], "phrases": []}
                    units_dict[unit]["phrases"].append(item)
                
                def sort_unit_key(unit_name):
                    match = re.search(r'(\d+)', unit_name)
                    if match:
                        return int(match.group(1))
                    return 0
                
                sorted_units = sorted(units_dict.keys(), key=sort_unit_key)
                
                pdf_gen = PDFVocabGenerator()
                pdf_gen.add_new_page()
                
                title_x = pdf_gen.page_width / 2
                pdf_gen.page.insert_text(
                    (title_x - 80, pdf_gen.y_position + 20),
                    pdf_title,
                    fontsize=18,
                    fontname="china-s",
                    color=(0.1, 0.2, 0.4)
                )
                pdf_gen.y_position += 35
                
                pdf_gen.page.draw_line(
                    (pdf_gen.margin, pdf_gen.y_position),
                    (pdf_gen.page_width - pdf_gen.margin, pdf_gen.y_position),
                    color=(0.8, 0.8, 0.8),
                    width=0.8
                )
                pdf_gen.y_position += 12
                
                word_col_widths = [80, 55, 25, 65, 150, 150]
                word_headers = ["单词", "音标", "词性", "释义", "英文例句", "中文例句"]
                
                phrase_col_widths = [95, 80, 175, 175]
                phrase_headers = ["短语", "释义", "英文例句", "中文例句"]
                
                for unit_name in sorted_units:
                    unit_data = units_dict[unit_name]
                    words_list = unit_data["words"]
                    phrases_list = unit_data["phrases"]
                    
                    pdf_gen.check_page_break(100)
                    
                    pdf_gen.draw_unit_header(unit_name)
                    
                    if words_list:
                        pdf_gen.draw_section_header("单词")
                        pdf_gen.draw_table_header(word_headers, word_col_widths)
                        
                        for word_item in words_list:
                            word = word_item.get("word", "")
                            phonetic = word_item.get("phonetic", "")
                            
                            meanings = word_item.get("meanings", [])
                            if not meanings:
                                meanings = [{"pos": word_item.get("pos", ""), 
                                            "meaning": word_item.get("meaning", ""),
                                            "example": word_item.get("example", ""),
                                            "example_zh": word_item.get("example_zh", "")}]
                            
                            for m in meanings:
                                pdf_gen.check_page_break(26)
                                
                                pos = m.get("pos", "")
                                meaning = m.get("meaning", "")
                                example = m.get("example", "")
                                example_zh = m.get("example_zh", "")
                                
                                if len(example) > 38:
                                    example = example[:35] + "..."
                                if len(example_zh) > 32:
                                    example_zh = example_zh[:29] + "..."
                                
                                x_pos = 0
                                pdf_gen.draw_english_text(word, fontsize=8, x_offset=x_pos + 3)
                                x_pos += word_col_widths[0]
                                pdf_gen.draw_english_text(phonetic, fontsize=7, color=(0.3, 0.3, 0.3), x_offset=x_pos + 3)
                                x_pos += word_col_widths[1]
                                pdf_gen.draw_text(pos, fontsize=8, color=(0.2, 0.5, 0.2), x_offset=x_pos + 3)
                                x_pos += word_col_widths[2]
                                pdf_gen.draw_text(meaning, fontsize=8, x_offset=x_pos + 3)
                                x_pos += word_col_widths[3]
                                pdf_gen.draw_english_text(example, fontsize=7, color=(0.3, 0.3, 0.3), x_offset=x_pos + 3)
                                x_pos += word_col_widths[4]
                                pdf_gen.draw_text(example_zh, fontsize=7, color=(0.5, 0.5, 0.5), x_offset=x_pos + 3)
                                
                                pdf_gen.y_position += 18
                    
                    if phrases_list:
                        pdf_gen.y_position += 12
                        pdf_gen.draw_section_header("短语")
                        pdf_gen.draw_table_header(phrase_headers, phrase_col_widths)
                        
                        for phrase_item in phrases_list:
                            phrase = phrase_item.get("word", "")
                            
                            meanings = phrase_item.get("meanings", [])
                            if not meanings:
                                meanings = [{"meaning": phrase_item.get("meaning", ""),
                                            "example": phrase_item.get("example", ""),
                                            "example_zh": phrase_item.get("example_zh", "")}]
                            
                            for m in meanings:
                                pdf_gen.check_page_break(26)
                                
                                meaning = m.get("meaning", "")
                                example = m.get("example", "")
                                example_zh = m.get("example_zh", "")
                                
                                if len(example) > 45:
                                    example = example[:42] + "..."
                                if len(example_zh) > 38:
                                    example_zh = example_zh[:35] + "..."
                                
                                x_pos = 0
                                pdf_gen.draw_english_text(phrase, fontsize=8, x_offset=x_pos + 3)
                                x_pos += phrase_col_widths[0]
                                pdf_gen.draw_text(meaning, fontsize=8, x_offset=x_pos + 3)
                                x_pos += phrase_col_widths[1]
                                pdf_gen.draw_english_text(example, fontsize=7, color=(0.3, 0.3, 0.3), x_offset=x_pos + 3)
                                x_pos += phrase_col_widths[2]
                                pdf_gen.draw_text(example_zh, fontsize=7, color=(0.5, 0.5, 0.5), x_offset=x_pos + 3)
                                
                                pdf_gen.y_position += 18
                    
                    pdf_gen.y_position += 15
                
                pdf_bytes = pdf_gen.get_pdf_bytes()
                pdf_gen.close()
                
                st.success(f"✅ PDF 生成完成！共 {len(sorted_units)} 个单元")
                
                total_words = sum(len(units_dict[u]["words"]) for u in sorted_units)
                total_phrases = sum(len(units_dict[u]["phrases"]) for u in sorted_units)
                st.info(f"📊 单词: {total_words} 个，短语: {total_phrases} 个")
                
                st.download_button(
                    label="📥 下载 PDF",
                    data=pdf_bytes,
                    file_name=f"{pdf_title}.pdf",
                    mime="application/pdf",
                    key="download_pdf_btn"
                )























with tab4:
    st.header("单元名称提取（目录页）")
    st.info("输入教材 PDF 和目录页码范围，提取 Unit、单元标题和标题下简短问句描述。")

    if "unit_meta_results" not in st.session_state:
        st.session_state.unit_meta_results = []
    if "unit_meta_source_pdf" not in st.session_state:
        st.session_state.unit_meta_source_pdf = ""

    source_mode = st.radio(
        "PDF 来源",
        ["待处理教材目录", "手动上传 PDF"],
        horizontal=True,
        key="unit_meta_source_mode"
    )

    selected_pdf_bytes = None
    selected_pdf_name = ""

    if source_mode == "待处理教材目录":
        if os.path.isdir(TARGET_TEXTBOOK_DIR):
            pdf_files = sorted([f for f in os.listdir(TARGET_TEXTBOOK_DIR) if f.lower().endswith(".pdf")])
            if pdf_files:
                picked = st.selectbox("选择教材文件", pdf_files, key="unit_meta_pdf_picker")
                selected_pdf_name = picked
                picked_path = os.path.join(TARGET_TEXTBOOK_DIR, picked)
                with open(picked_path, "rb") as rf:
                    selected_pdf_bytes = rf.read()
                st.caption(f"来源目录：{TARGET_TEXTBOOK_DIR}")
            else:
                st.warning(f"目录中没有 PDF：{TARGET_TEXTBOOK_DIR}")
        else:
            st.warning(f"目录不存在或不可访问：{TARGET_TEXTBOOK_DIR}")
    else:
        uploaded = st.file_uploader("上传教材 PDF", type=["pdf"], key="unit_meta_uploader")
        if uploaded is not None:
            selected_pdf_name = uploaded.name
            selected_pdf_bytes = uploaded.getvalue()

    meta_col1, meta_col2, meta_col3 = st.columns(3)
    with meta_col1:
        unit_meta_book_version = st.text_input("教材版本", value="", key="unit_meta_book_version")
    with meta_col2:
        unit_meta_grade = st.text_input("年级", value="", key="unit_meta_grade")
    with meta_col3:
        unit_meta_semester = st.text_input("学期", value="", key="unit_meta_semester")

    page_range_text = st.text_input(
        "目录页码范围（例如：2-5,8,10-11）",
        value="1-3",
        key="unit_meta_page_range"
    )

    if st.button("开始提取单元名称", type="primary", key="btn_extract_unit_meta"):
        if not extract_api_keys:
            st.error("请先在左侧填写提取 API Key。")
        elif not selected_pdf_bytes:
            st.error("请先选择或上传教材 PDF。")
        else:
            doc = PDFCache.get_doc(selected_pdf_bytes)
            total_pages = len(doc)
            pages = parse_page_range_input(page_range_text, 1, total_pages)
            if not pages:
                st.error("页码范围无效，请重新输入。")
            else:
                progress = st.progress(0)
                status = st.empty()
                all_items = []
                max_workers = max(1, min(len(extract_api_keys), len(pages)))
                with ThreadPoolExecutor(max_workers=max_workers) as executor:
                    future_map = {}
                    for idx, pno in enumerate(pages):
                        page_api_key = pick_api_key_for_job(extract_api_keys, idx)
                        b64_img = pdf_page_to_base64_cached(doc, pno)
                        fut = executor.submit(
                            extract_unit_meta_from_page,
                            b64_img,
                            pno,
                            page_api_key,
                            extract_base_url,
                            extract_model_name,
                        )
                        future_map[fut] = pno

                    done_count = 0
                    for fut in as_completed(future_map):
                        pno = future_map[fut]
                        try:
                            page_items = fut.result() or []
                        except Exception:
                            page_items = []
                        all_items.extend(page_items)
                        done_count += 1
                        status.info(f"正在提取目录页：{pno} ({done_count}/{len(pages)})")
                        progress.progress(done_count / len(pages))

                merged = {}
                for item in all_items:
                    unit_key = (item.get("unit", "") or "").strip()
                    if not unit_key:
                        continue
                    if unit_key not in merged:
                        merged[unit_key] = {
                            "unit": unit_key,
                            "unit_title": item.get("unit_title", ""),
                            "unit_desc_short": item.get("unit_desc_short", ""),
                            "source_pages": [item.get("source_page")],
                        }
                    else:
                        current = merged[unit_key]
                        if not current.get("unit_title") and item.get("unit_title"):
                            current["unit_title"] = item.get("unit_title", "")
                        if not current.get("unit_desc_short") and item.get("unit_desc_short"):
                            current["unit_desc_short"] = item.get("unit_desc_short", "")
                        current["source_pages"].append(item.get("source_page"))

                final_rows = []
                for _, v in merged.items():
                    pages_sorted = sorted(set([p for p in v.get("source_pages", []) if isinstance(p, int)]))
                    v["source_pages"] = pages_sorted
                    final_rows.append(v)

                final_rows = sorted(final_rows, key=lambda x: int(re.search(r"\d+", x["unit"]).group(0)) if re.search(r"\d+", x["unit"]) else 9999)
                st.session_state.unit_meta_results = final_rows
                st.session_state.unit_meta_source_pdf = selected_pdf_name

                status.success(f"提取完成：共识别 {len(final_rows)} 个单元。")

    if st.session_state.unit_meta_results:
        st.subheader("提取结果（可编辑）")
        display_rows = []
        for r in st.session_state.unit_meta_results:
            row = dict(r)
            row["source_pages"] = ",".join([str(p) for p in r.get("source_pages", [])])
            display_rows.append(row)

        df_units = pd.DataFrame(display_rows)
        edited_df = st.data_editor(
            df_units,
            use_container_width=True,
            num_rows="dynamic",
            key="unit_meta_editor",
            hide_index=True
        )

        default_name = "unit_meta.jsonl"
        if st.session_state.unit_meta_source_pdf:
            stem = os.path.splitext(st.session_state.unit_meta_source_pdf)[0]
            default_name = f"{stem}_unit_meta.jsonl"
        save_name = st.text_input("保存文件名", value=default_name, key="unit_meta_save_name")

        if st.button("保存到 structure_data", key="btn_save_unit_meta"):
            os.makedirs(STRUCTURE_DIR, exist_ok=True)
            save_path = os.path.join(STRUCTURE_DIR, save_name)
            records = edited_df.to_dict(orient="records")
            with open(save_path, "w", encoding="utf-8") as wf:
                for rec in records:
                    raw_pages = str(rec.get("source_pages", "") or "").strip()
                    pages = [int(x.strip()) for x in raw_pages.split(",") if x.strip().isdigit()]
                    out = {
                        "unit": (rec.get("unit", "") or "").strip(),
                        "unit_title": (rec.get("unit_title", "") or "").strip(),
                        "unit_desc_short": (rec.get("unit_desc_short", "") or "").strip(),
                        "source_pages": pages,
                        "book_version": (unit_meta_book_version or "").strip(),
                        "grade": (unit_meta_grade or "").strip(),
                        "semester": (unit_meta_semester or "").strip(),
                    }
                    wf.write(json.dumps(out, ensure_ascii=False) + "\n")
            st.success(f"已保存：{save_path}")


with tab5:
    st.header("课文提取（批量TXT/PDF匹配 + 实时回传）")
    st.info("支持多TXT与多PDF匹配；每个提取目标返回后立即写入JSONL并实时更新前端展示。")

    if "passage_results" not in st.session_state:
        st.session_state.passage_results = []
    if "passage_live_by_file" not in st.session_state:
        st.session_state.passage_live_by_file = {}
    if "passage_output_files" not in st.session_state:
        st.session_state.passage_output_files = []

    source_mode_p = st.radio(
        "PDF 来源",
        ["待处理教材目录", "手动上传 PDF（可多文件）"],
        horizontal=True,
        key="passage_source_mode"
    )

    available_pdfs = []
    if source_mode_p == "待处理教材目录":
        if os.path.isdir(TARGET_TEXTBOOK_DIR):
            pdf_files_all = sorted([f for f in os.listdir(TARGET_TEXTBOOK_DIR) if f.lower().endswith(".pdf")])
            if pdf_files_all:
                selected_pdf_names = st.multiselect(
                    "选择参与匹配的PDF（可多选）",
                    options=pdf_files_all,
                    default=pdf_files_all,
                    key="passage_pdf_picker_multi"
                )
                for name in selected_pdf_names:
                    p = os.path.join(TARGET_TEXTBOOK_DIR, name)
                    with open(p, "rb") as rf:
                        available_pdfs.append({"name": name, "bytes": rf.read()})
                st.caption(f"来源目录：{TARGET_TEXTBOOK_DIR}")
            else:
                st.warning(f"目录中没有 PDF：{TARGET_TEXTBOOK_DIR}")
        else:
            st.warning(f"目录不存在或不可访问：{TARGET_TEXTBOOK_DIR}")
    else:
        uploaded_pdf_list = st.file_uploader(
            "上传教材 PDF（可多文件）",
            type=["pdf"],
            accept_multiple_files=True,
            key="passage_uploader_multi"
        )
        for uf in (uploaded_pdf_list or []):
            available_pdfs.append({"name": uf.name, "bytes": uf.getvalue()})

    st.divider()
    target_mode = st.radio(
        "提取目标来源",
        ["导入TXT范围（可多文件）", "前端手动输入（单文件）"],
        horizontal=True,
        key="passage_target_mode"
    )

    txt_files = []
    detected_book = ""
    detected_grade = ""
    detected_semester = ""

    if target_mode == "导入TXT范围（可多文件）":
        txt_uploads = st.file_uploader(
            "上传课文提取范围 TXT（可多文件）",
            type=["txt"],
            accept_multiple_files=True,
            key="passage_scope_txt_multi"
        )
        txt_files = list(txt_uploads or [])

        if txt_files:
            sample_book, sample_grade, sample_semester = _parse_book_meta_from_filename(txt_files[0].name)
            detected_book, detected_grade, detected_semester = sample_book, sample_grade, sample_semester
            st.write(f"TXT 文件数量：{len(txt_files)}")

            auto_matches, unmatched_txt = _build_txt_pdf_matches(txt_files, available_pdfs)
            st.caption(f"自动匹配成功：{len(auto_matches)}，未匹配：{len(unmatched_txt)}")

            if unmatched_txt and available_pdfs:
                st.warning("以下TXT未自动匹配，请手动指定PDF：")
                pdf_name_options = [p["name"] for p in available_pdfs]
                for tf in unmatched_txt:
                    st.selectbox(
                        f"{tf.name} -> 选择匹配PDF",
                        options=["（跳过）"] + pdf_name_options,
                        key=f"manual_map_{tf.name}"
                    )
            elif unmatched_txt and not available_pdfs:
                st.warning("存在未匹配TXT，但当前没有可用PDF。")
    else:
        unit_count = st.number_input("单元数量", min_value=1, max_value=30, value=8, step=1, key="passage_unit_count")
        st.caption("每个输入框可包含多个目标，使用 + 连接，例如：15-16 1b + 18 3a")
        for i in range(1, int(unit_count) + 1):
            col_a, col_b = st.columns(2)
            with col_a:
                st.text_input(f"Unit {i} Section A 目标", value="", placeholder="13 3a + 14 1b", key=f"passage_unit_{i}_A_targets")
            with col_b:
                st.text_input(f"Unit {i} Section B 目标", value="", placeholder="15-16 1b + 18 3a", key=f"passage_unit_{i}_B_targets")

    st.divider()
    meta_col_p1, meta_col_p2, meta_col_p3 = st.columns(3)
    with meta_col_p1:
        passage_book_version = st.text_input("教材版本（默认）", value=detected_book, key="passage_book_version")
    with meta_col_p2:
        passage_grade = st.text_input("年级（默认）", value=detected_grade, key="passage_grade")
    with meta_col_p3:
        passage_semester = st.text_input("学期（默认）", value=detected_semester, key="passage_semester")

    summary_placeholder = st.empty()
    detail_placeholder = st.empty()

    def render_passage_live_view():
        live = st.session_state.get("passage_live_by_file", {})
        if not live:
            return

        summary_rows = []
        for fname, info in live.items():
            summary_rows.append({
                "文件": fname,
                "状态": info.get("status", "pending"),
                "目标总数": info.get("total", 0),
                "已完成": info.get("done", 0),
                "输出": info.get("output", ""),
            })

        with summary_placeholder.container():
            st.subheader("批量进度（按文件）")
            st.dataframe(pd.DataFrame(summary_rows), width="stretch", hide_index=True)

        with detail_placeholder.container():
            st.subheader("提取结果（按文件 -> 单元）")
            for fname, info in live.items():
                records = info.get("records", [])
                with st.expander(f"{fname}（{len(records)} 条）", expanded=False):
                    grouped = {}
                    for rec in records:
                        grouped.setdefault(rec.get("unit", "Unit ?"), []).append(rec)
                    for unit_name in sorted(grouped.keys(), key=lambda x: int(re.search(r"(\d+)", x).group(1)) if re.search(r"(\d+)", x) else 9999):
                        st.markdown(f"**{unit_name}**")
                        for rec in grouped[unit_name]:
                            st.caption(f"{rec.get('target_id','')} | 页码: {','.join([str(p) for p in rec.get('source_pages',[])])}")
                            srows = [{"序号": i+1, "英文": s.get("en",""), "中文": s.get("zh",""), "audio": s.get("audio","")} for i, s in enumerate(rec.get("sentences", []))]
                            if srows:
                                st.dataframe(pd.DataFrame(srows), width="stretch", hide_index=True)
                            else:
                                st.info("该目标暂无句子")

    if st.button("开始提取课文（批量）", type="primary", key="btn_extract_passages"):
        if not extract_api_keys:
            st.error("请先在左侧填写提取 API Key。")
        elif not available_pdfs:
            st.error("请至少提供一个PDF文件。")
        else:
            pairs = []
            if target_mode == "导入TXT范围（可多文件）":
                if not txt_files:
                    st.error("请至少上传一个TXT范围文件。")
                    st.stop()

                auto_matches, unmatched_txt = _build_txt_pdf_matches(txt_files, available_pdfs)
                pairs.extend(auto_matches)

                pdf_map_name = {p["name"]: p for p in available_pdfs}
                for tf in unmatched_txt:
                    picked_name = st.session_state.get(f"manual_map_{tf.name}", "（跳过）")
                    if picked_name and picked_name != "（跳过）" and picked_name in pdf_map_name:
                        pairs.append((tf, pdf_map_name[picked_name]))
                    else:
                        st.warning(f"未匹配TXT已跳过：{tf.name}")

                if not pairs:
                    st.error("没有可执行的TXT-PDF匹配对。")
                    st.stop()
            else:
                if not available_pdfs:
                    st.error("手动模式至少要有一个PDF。")
                    st.stop()
                picked_pdf_name = st.selectbox(
                    "手动模式选择PDF",
                    options=[p["name"] for p in available_pdfs],
                    key="passage_manual_pdf_picker"
                )
                chosen_pdf = None
                for p in available_pdfs:
                    if p["name"] == picked_pdf_name:
                        chosen_pdf = p
                        break
                pairs.append((None, chosen_pdf))

            st.session_state.passage_live_by_file = {}
            st.session_state.passage_results = []
            st.session_state.passage_output_files = []

            # 先预解析任务，得到总进度
            job_plans = []
            total_targets = 0

            for txt_obj, pdf_obj in pairs:
                pdf_bytes = pdf_obj["bytes"]
                doc_tmp = PDFCache.get_doc(pdf_bytes)
                total_pages_tmp = len(doc_tmp)

                if txt_obj is not None:
                    scope_text = txt_obj.getvalue().decode("utf-8-sig", errors="replace")
                    tasks, parse_errors = _parse_passage_scope_text(scope_text, 1, total_pages_tmp)
                    if parse_errors:
                        st.warning(f"{txt_obj.name} 存在格式问题，异常项已跳过：")
                        for e in parse_errors:
                            st.write(f"- {e}")
                    txt_name = txt_obj.name
                    book_v, grade_v, sem_v = _parse_book_meta_from_filename(txt_name)
                    book_v = (book_v or passage_book_version or "未知版本").strip()
                    grade_v = (grade_v or passage_grade or "未知年级").strip()
                    sem_v = (sem_v or passage_semester or "未知学期").strip()
                    output_name = build_result_filename(book_v, grade_v, sem_v, "课文", make_task_id())
                    display_name = txt_name
                else:
                    tasks = []
                    for i in range(1, int(unit_count) + 1):
                        raw_a = st.session_state.get(f"passage_unit_{i}_A_targets", "")
                        raw_b = st.session_state.get(f"passage_unit_{i}_B_targets", "")
                        ta, _ = _parse_manual_targets(raw_a, i, "A", 1, total_pages_tmp)
                        tb, _ = _parse_manual_targets(raw_b, i, "B", 1, total_pages_tmp)
                        tasks.extend(ta)
                        tasks.extend(tb)
                    book_v = (passage_book_version or "未知版本").strip()
                    grade_v = (passage_grade or "未知年级").strip()
                    sem_v = (passage_semester or "未知学期").strip()
                    output_name = build_result_filename(book_v, grade_v, sem_v, "课文", make_task_id())
                    display_name = f"手动输入@{pdf_obj['name']}"

                if not tasks:
                    st.warning(f"{display_name} 没有有效提取目标，已跳过。")
                    continue

                job_plans.append({
                    "txt": txt_obj,
                    "pdf": pdf_obj,
                    "tasks": tasks,
                    "book_version": book_v,
                    "grade": grade_v,
                    "semester": sem_v,
                    "display_name": display_name,
                    "output_name": output_name,
                })
                total_targets += len(tasks)

            if not job_plans:
                st.error("没有可执行任务。")
                st.stop()

            os.makedirs(PASSAGE_OUTPUT_DIR, exist_ok=True)
            overall_progress = st.progress(0)
            overall_status = st.empty()
            done_targets = 0

            for job_idx, job in enumerate(job_plans):
                job_api_key = pick_api_key_for_job(extract_api_keys, job_idx)
                pdf_obj = job["pdf"]
                tasks = job["tasks"]
                display_name = job["display_name"]
                output_path = os.path.join(PASSAGE_OUTPUT_DIR, job["output_name"])

                # 每个文件先清空输出，再做增量append
                with open(output_path, "w", encoding="utf-8") as _wf_init:
                    _wf_init.write("")

                st.session_state.passage_output_files.append(output_path)
                st.session_state.passage_live_by_file[display_name] = {
                    "status": "running",
                    "total": len(tasks),
                    "done": 0,
                    "output": output_path,
                    "records": [],
                }
                render_passage_live_view()

                doc_p = PDFCache.get_doc(pdf_obj["bytes"])

                for task in tasks:
                    unit_label = task["unit"]
                    sec_label = task["section"]
                    label = task.get("label", "")
                    pages = task["pages"]
                    target_id = f"{unit_label} Section {sec_label} {label}".strip()
                    overall_status.info(f"正在提取 {display_name} -> {target_id}")

                    title = ""
                    text_chunks = []
                    for pno in pages:
                        b64_img = pdf_page_to_base64_cached(doc_p, pno)
                        page_data = extract_passage_from_page(
                            b64_img,
                            job_api_key,
                            extract_base_url,
                            extract_model_name,
                            unit_label,
                            sec_label,
                            label,
                        )
                        if (not title) and page_data.get("title"):
                            title = page_data.get("title", "")
                        if page_data.get("passage_text"):
                            text_chunks.append(page_data.get("passage_text", ""))

                    merged_text = _normalize_passage_text("\n\n".join([c for c in text_chunks if c.strip()]))
                    sentence_en = _split_passage_sentences(merged_text)
                    sentence_zh = _translate_sentences_to_zh(
                        sentence_en,
                        job_api_key,
                        extract_base_url,
                        extract_model_name,
                    ) if sentence_en else []

                    sentence_items = []
                    for s_idx, en_text in enumerate(sentence_en):
                        zh_text = sentence_zh[s_idx] if s_idx < len(sentence_zh) else ""
                        sentence_items.append({"en": en_text, "zh": zh_text, "audio": ""})

                    rec_id_seed = f"{target_id}|{job['book_version']}|{job['grade']}|{job['semester']}"
                    rec = {
                        "id": hashlib.md5(rec_id_seed.encode("utf-8")).hexdigest()[:12],
                        "type": "passage",
                        "unit": unit_label,
                        "section": sec_label,
                        "label": label,
                        "target_id": target_id,
                        "title": title,
                        "passage_text": merged_text,
                        "sentences": sentence_items,
                        "source_pages": pages,
                        "book_version": job["book_version"],
                        "grade": job["grade"],
                        "semester": job["semester"],
                    }

                    # 增量写入本地
                    with open(output_path, "a", encoding="utf-8") as wf:
                        wf.write(json.dumps(rec, ensure_ascii=False) + "\n")

                    # 增量更新前端
                    st.session_state.passage_results.append(rec)
                    live_obj = st.session_state.passage_live_by_file[display_name]
                    live_obj["records"].append(rec)
                    live_obj["done"] += 1
                    done_targets += 1
                    overall_progress.progress(done_targets / max(1, total_targets))
                    render_passage_live_view()

                st.session_state.passage_live_by_file[display_name]["status"] = "done"
                render_passage_live_view()

            overall_status.success(f"提取完成：共处理 {len(job_plans)} 个文件任务，目标数 {done_targets}。")

    if st.session_state.get("passage_output_files"):
        st.subheader("输出文件")
        for p in st.session_state.get("passage_output_files", []):
            st.write(f"- {p}")


