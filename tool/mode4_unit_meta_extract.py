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
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from queue import Empty, Queue

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
DATA_DIR = os.path.join(BASE_DIR, "data")
LEGACY_DATA_DIR = os.path.join(BASE_DIR, "word_data")
UNRECORDED_DIR = os.path.join(LEGACY_DATA_DIR, "未录音")
RECORDED_DIR = os.path.join(LEGACY_DATA_DIR, "已录音")
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
    os.makedirs(LEGACY_DATA_DIR, exist_ok=True)
    os.makedirs(UNRECORDED_DIR, exist_ok=True)
    os.makedirs(RECORDED_DIR, exist_ok=True)
    os.makedirs(AUDIO_DIR, exist_ok=True)
    os.makedirs(PASSAGE_AUDIO_DIR, exist_ok=True)
    os.makedirs(RUNS_DIR, exist_ok=True)
    os.makedirs(PREPROCESS_DOC_DIR, exist_ok=True)


def discover_local_textbook_pdfs():
    items = []
    if not os.path.isdir(TARGET_TEXTBOOK_DIR):
        return items
    for abs_path in sorted(
        os.path.join(root, name)
        for root, _, files in os.walk(TARGET_TEXTBOOK_DIR)
        for name in files
        if name.lower().endswith(".pdf")
    ):
        rel_path = os.path.relpath(abs_path, TARGET_TEXTBOOK_DIR).replace("\\", "/")
        book_version, grade, semester = _parse_book_meta_from_filename(abs_path)
        items.append({
            "abs_path": abs_path,
            "rel_path": rel_path,
            "raw_name": os.path.basename(abs_path),
            "display_name": rel_path,
            "meta": {
                "book_version": book_version,
                "grade": grade,
                "semester": semester,
            },
        })
    return items


def make_task_id():
    return time.strftime("%Y%m%d_%H%M%S")


def sanitize_filename(text):
    safe = re.sub(r'[\\/:*?"<>|]+', "_", str(text or "").strip())
    safe = re.sub(r"\s+", "", safe)
    return safe or "unknown"


def normalize_catalog_name(text, fallback="未分类"):
    value = sanitize_filename(text)
    return value if value != "unknown" else fallback


def build_grade_semester_label(grade, semester):
    return f"{normalize_catalog_name(grade, '未知年级')}_{normalize_catalog_name(semester, '未知册别')}"


def get_mode4_output_path(book_version, grade, semester):
    return os.path.join(
        DATA_DIR,
        normalize_catalog_name(book_version, "未知版本"),
        "单元",
        f"{build_grade_semester_label(grade, semester)}.jsonl",
    )


def ensure_parent_dir(path):
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)


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
    text = (content_bytes or b"").decode("utf-8-sig", 异常s="replace")
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
        line = line.decode("utf-8-sig", 异常s="replace")
    cleaned = (line or "").lstrip("\ufeff").strip()
    return json.loads(cleaned)

def call_chat_json_with_retry(client, request_kwargs, expect_list=False):
    last_异常 = None
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
            last_异常 = e
            if attempt < LLM_MAX_RETRIES:
                backoff_seconds = min(2 ** (attempt - 1) + random.uniform(0, 1), 8)
                time.sleep(backoff_seconds)
    return None, str(last_异常)


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
    match = re.search(r"(Starter\s+Unit|Unit)\s*\d+", unit_text, flags=re.IGNORECASE)
    if match:
        compact = re.sub(r"\s+", " ", match.group(0)).strip()
        compact_lower = compact.lower()
        if compact_lower.startswith("starter unit"):
            number_match = re.search(r"(\d+)", compact)
            return f"Starter Unit {number_match.group(1)}" if number_match else "Starter Unit ?"
        number_match = re.search(r"(\d+)", compact)
        return f"Unit {number_match.group(1)}" if number_match else "Unit ?"
    return unit_text


def _is_supported_unit_text(unit):
    unit_text = (unit or "").strip()
    return bool(re.match(r"^(Starter\s+Unit|Unit)\s*\d+$", unit_text, flags=re.IGNORECASE))


def _unit_sort_key(unit):
    unit_text = (unit or "").strip()
    number_match = re.search(r"(\d+)", unit_text)
    number_value = int(number_match.group(1)) if number_match else 9999
    is_starter = bool(re.match(r"^Starter\s+Unit\s*\d+$", unit_text, flags=re.IGNORECASE))
    return (0 if is_starter else 1, number_value, unit_text.lower())


def _normalize_单元信息_item(raw_item, page_number):
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


def _validate_单元信息_item(item, require_unit_title=True):
    if not isinstance(item, dict):
        return False
    unit = (item.get("unit", "") or "").strip()
    if not _is_supported_unit_text(unit):
        return False
    title = (item.get("unit_title", "") or "").strip()
    if require_unit_title and not title:
        return False
    desc = (item.get("unit_desc_short", "") or "").strip()
    if require_unit_title and not desc:
        return False
    return True


def _looks_like_pep_primary_directory_page(items):
    if not isinstance(items, list) or not items:
        return False
    valid_units = 0
    empty_desc_units = 0
    for item in items:
        if not isinstance(item, dict):
            continue
        unit = (item.get("unit", "") or "").strip()
        title = (item.get("unit_title", "") or "").strip()
        desc = (item.get("unit_desc_short", "") or "").strip()
        if not _is_supported_unit_text(unit):
            continue
        if not title:
            continue
        valid_units += 1
        if not desc:
            empty_desc_units += 1
    return valid_units > 0 and valid_units == empty_desc_units


def _dedupe_unit_records(items):
    cleaned = []
    seen = set()
    for item in items:
        if not isinstance(item, dict):
            continue
        key = (
            (item.get("unit", "") or "").strip().lower(),
            (item.get("unit_title", "") or "").strip().lower(),
        )
        if not key[0] or key in seen:
            continue
        seen.add(key)
        cleaned.append(item)
    return cleaned


def _repair_单元信息_item_with_retry(raw_item, page_number, api_key, base_url, model_name):
    if not isinstance(raw_item, dict):
        return None
    client = get_openai_client(api_key, base_url)
    raw_payload = json.dumps(raw_item, ensure_ascii=False)
    prompt = f"""
Fix one unit-index JSON item from a textbook directory page.
Return ONE JSON object only:
{{
  "unit": "Unit X or Starter Unit X",
  "unit_title": "....",
  "unit_desc_short": "One short question under the unit title"
}}
Rules:
- unit must match Unit + number, or Starter Unit + number.
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
        parsed, 异常 = call_chat_json_with_retry(client, request_kwargs, expect_list=False)
        if 异常 or not isinstance(parsed, dict):
            continue
        normalized = _normalize_单元信息_item(parsed, page_number)
        if _validate_单元信息_item(normalized, require_unit_title=True):
            return normalized
    return None


def extract_单元信息_from_page(base64_image, page_number, api_key, base_url, model_name):
    client = get_openai_client(api_key, base_url)
    prompt = """
You are extracting unit metadata from a textbook directory/contents page image.
Return JSON array only (no markdown).
Each item schema:
{
  "unit": "Unit X or Starter Unit X",
  "unit_title": "Unit title",
  "unit_desc_short": "Short question under unit title"
}
Rules:
- Only include real units visible on this page.
- unit must use Unit + number, or Starter Unit + number.
- Keep original language text; do not translate.
- unit_title and unit_desc_short should both be non-empty.
"""
    pep_primary_prompt = """
You are extracting unit metadata from a primary-school English textbook contents page.
Return JSON array only (no markdown).
Each item schema:
{
  "unit": "Unit X or Starter Unit X",
  "unit_title": "Unit title",
  "unit_desc_short": ""
}
Rules:
- Only include real units visible on this page.
- unit must use Unit + number, or Starter Unit + number.
- Keep original language text; do not translate.
- This page type may only show unit number + unit title. In that case, set unit_desc_short to empty string.
- Do not invent question lines or descriptions that are not visible.
"""

    def run_prompt(prompt_text):
        request_kwargs = {
            "model": model_name,
            "messages": [
                {"role": "user", "content": [
                    {"type": "text", "text": prompt_text},
                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{base64_image}", "detail": "high"}}
                ]}
            ],
            "temperature": 0.0,
        }
        parsed, error = call_chat_json_with_retry(client, request_kwargs, expect_list=True)
        if error or not isinstance(parsed, list):
            return []
        return parsed

    parsed = run_prompt(prompt)
    cleaned = []
    for raw in parsed:
        normalized = _normalize_单元信息_item(raw, page_number)
        if not _validate_单元信息_item(normalized, require_unit_title=True):
            normalized = _repair_单元信息_item_with_retry(raw, page_number, api_key, base_url, model_name)
        if _validate_单元信息_item(normalized, require_unit_title=True):
            cleaned.append(normalized)
    cleaned = _dedupe_unit_records(cleaned)
    if cleaned:
        return cleaned

    pep_parsed = run_prompt(pep_primary_prompt)
    pep_cleaned = []
    for raw in pep_parsed:
        normalized = _normalize_单元信息_item(raw, page_number)
        if _validate_单元信息_item(normalized, require_unit_title=False):
            pep_cleaned.append(normalized)
    pep_cleaned = _dedupe_unit_records(pep_cleaned)
    if _looks_like_pep_primary_directory_page(pep_cleaned):
        return pep_cleaned
    return pep_cleaned if pep_cleaned else []


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
    parsed, 异常 = call_chat_json_with_retry(client, request_kwargs, expect_list=True)
    if 异常 or not isinstance(parsed, list):
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
    parsed, 异常 = call_chat_json_with_retry(client, request_kwargs, expect_list=False)
    if 异常 or not isinstance(parsed, dict):
        return {"title": "", "passage_text": ""}
    return {
        "title": (parsed.get("title", "") or "").strip(),
        "passage_text": _normalize_passage_text(parsed.get("passage_text", ""))
    }


def _parse_book_meta_from_filename(filename):
    raw_path = str(filename or "").strip()
    stem = os.path.splitext(raw_path)[0].strip()
    parts = [p.strip() for p in stem.split("_") if p.strip()]
    if len(parts) >= 3:
        return parts[0], parts[1], parts[2]

    norm_path = raw_path.replace("\\", "/").strip("/")
    path_parts = [p.strip() for p in norm_path.split("/") if p.strip()]
    if len(path_parts) >= 2:
        book_version = path_parts[-2]
        name_stem = os.path.splitext(path_parts[-1])[0].strip()
        name_parts = [p.strip() for p in name_stem.split("_") if p.strip()]
        if len(name_parts) >= 2:
            return book_version, name_parts[0], name_parts[1]
    return "", "", ""


def _parse_passage_scope_text(scope_text, min_page, max_page):
    tasks = []
    异常s = []
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
            异常s.append(f"第 {idx} 行格式不符合：{raw}")
            continue
        unit_num = int(match.group(1))
        section = match.group(2).upper()
        page_expr = re.sub(r"\s+", "", match.group(3))
        label = match.group(4).lower()
        pages = parse_page_range_input(page_expr, min_page, max_page)
        if not pages:
            异常s.append(f"第 {idx} 行页码无效或超范围：{raw}")
            continue
        tasks.append({
            "unit": f"Unit {unit_num}",
            "section": section,
            "label": label,
            "passage_type": "dialogue" if section == "A" else "reading",
            "pages": pages,
            "source_line": idx,
        })
    return tasks, 异常s


def _parse_manual_targets(raw_text, unit_num, section_label, min_page, max_page):
    tasks = []
    异常s = []
    text = (raw_text or "").strip()
    if not text:
        return tasks, 异常s
    chunks = [c.strip() for c in text.split("+") if c.strip()]
    pattern = re.compile(r"^(?:page\s*)?([0-9\-,\s]+)\s+([0-9]+[a-zA-Z])$", flags=re.IGNORECASE)
    for chunk in chunks:
        m = pattern.match(chunk)
        if not m:
            异常s.append(f"Unit {unit_num} Section {section_label} 格式错误：{chunk}")
            continue
        page_expr = re.sub(r"\s+", "", m.group(1))
        label = m.group(2).lower()
        pages = parse_page_range_input(page_expr, min_page, max_page)
        if not pages:
            异常s.append(f"Unit {unit_num} Section {section_label} 页码无效：{chunk}")
            continue
        tasks.append({
            "unit": f"Unit {unit_num}",
            "section": section_label,
            "label": label,
            "passage_type": "dialogue" if section_label == "A" else "reading",
            "pages": pages,
        })
    return tasks, 异常s


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


class 教材Cache:
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


def get_unique_id(word, unit, grade):
    raw_str = f"{word}_{unit}_{grade}"
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
                异常_msg = str(e)
                if "403" in 异常_msg or "Invalid response status" in 异常_msg:
                    wait_time = 10 * (attempt + 1)
                    print(f"TTS 被服务端拒绝(403) [{text}]，等待 {wait_time} 秒后重试 (尝试 {attempt + 1}/{max_retries})")
                    await asyncio.sleep(wait_time)
                    continue
                if "503" in 异常_msg or "Cannot connect" in 异常_msg:
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
            异常_msg = str(e)
            if "403" in 异常_msg or "Invalid response status" in 异常_msg:
                wait_time = 10 * (attempt + 1)
                print(f"TTS 被服务端拒绝(403) [{text}]，等待 {wait_time} 秒后重试 (尝试 {attempt + 1}/{max_retries})")
                await asyncio.sleep(wait_time)
                continue
            if "503" in 异常_msg or "Cannot connect" in 异常_msg:
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


st.title("Tiger English - 模式四：单元目录提取")
if "mode4_is_running" not in st.session_state:
    st.session_state.mode4_is_running = False
if "mode4_pending_start" not in st.session_state:
    st.session_state.mode4_pending_start = False
if "mode4_stop_requested" not in st.session_state:
    st.session_state.mode4_stop_requested = False
if "mode4_api_key_count" not in st.session_state:
    st.session_state.mode4_api_key_count = 1
if "mode4_results" not in st.session_state:
    st.session_state.mode4_results = []

with st.sidebar:
    st.header("提取 API 配置")
    extract_base_url = st.text_input("提取 Base URL", value="https://openrouter.ai/api/v1", key="mode4_extract_base_url")
    extract_model_name = render_model_selector(
        "提取模型（仅保留一个）",
        st.session_state.get("mode4_extract_model_name", "openai/gpt-4o-mini"),
        "mode4_extract_model_picker",
    )
    st.session_state.mode4_extract_model_name = extract_model_name
    st.caption(f"模型 ID：{extract_model_name}")

    api_col, add_col = st.columns([8, 1])
    with api_col:
        st.text_input("API Key", type="password", key="mode4_extract_api_key_1")
    with add_col:
        if st.button("+", key="btn_mode4_add_api", help="新增一个 API Key 输入框"):
            st.session_state.mode4_api_key_count += 1
            st.rerun()

    for idx in range(2, int(st.session_state.mode4_api_key_count) + 1):
        k_col, del_col = st.columns([8, 1])
        with k_col:
            st.text_input(f"API Key {idx}", type="password", key=f"mode4_extract_api_key_{idx}")
        with del_col:
            if st.button("-", key=f"btn_mode4_del_api_{idx}", help=f"删除 API Key {idx}"):
                total = int(st.session_state.mode4_api_key_count)
                for j in range(idx, total):
                    st.session_state[f"mode4_extract_api_key_{j}"] = st.session_state.get(f"mode4_extract_api_key_{j+1}", "")
                st.session_state.pop(f"mode4_extract_api_key_{total}", None)
                st.session_state.mode4_api_key_count = max(1, total - 1)
                st.rerun()

    extract_api_keys = []
    for idx in range(1, int(st.session_state.mode4_api_key_count) + 1):
        value = str(st.session_state.get(f"mode4_extract_api_key_{idx}", "") or "").strip()
        if value and value not in extract_api_keys:
            extract_api_keys.append(value)
    st.caption(f"当前可用提取 Key 数量：{len(extract_api_keys)}")

    if st.button("一键测试全部 API", key="btn_mode4_test_all_api"):
        if not extract_api_keys:
            st.warning("请先输入至少一个 API Key。")
        else:
            test_msgs = []
            with st.spinner("正在测试全部 API 连通性..."):
                for i, api_key in enumerate(extract_api_keys, start=1):
                    try:
                        client = get_openai_client(api_key, extract_base_url)
                        _ = client.chat.completions.create(
                            model=extract_model_name,
                            messages=[{"role": "user", "content": "reply ok"}],
                            max_tokens=4,
                            timeout=20,
                        )
                        test_msgs.append((True, f"第 {i} 个 API 可用"))
                    except Exception as exc:
                        test_msgs.append((False, f"第 {i} 个 API 不可用：{exc}"))
            for ok, msg in test_msgs:
                if ok:
                    st.success(msg)
                else:
                    st.error(msg)

st.header("模式四：单元目录提取")
st.info("保留原有目录提取规则，同时兼容 PEP 小学这类仅展示“单元号 + 单元标题”的目录页。输出路径为 data/教材版本/单元/年级_册数.jsonl。")
mode4_force_empty_desc = st.checkbox(
    "本次批量提取强制清空 unit_desc_short",
    value=False,
    key="mode4_force_empty_desc",
    help="勾选后，本次任务中所有单元记录的 unit_desc_short 都会统一写为空字符串。",
)

source_mode = st.radio(
    "PDF 来源",
    ["待处理教材目录", "手动上传 PDF（可多文件）"],
    horizontal=True,
    key="mode4_source_mode",
)

candidate_items = []
if source_mode == "待处理教材目录":
    local_pdf_items = discover_local_textbook_pdfs()
    local_pdf_map = {item["display_name"]: item for item in local_pdf_items}
    selected_pdf_labels = st.multiselect(
        "从本地目录选择教材 PDF（待处理教材/教材版本/年级_册别.pdf）",
        options=list(local_pdf_map.keys()),
        default=[],
        key="mode4_local_pdf_selector",
    )
    for idx, label in enumerate(selected_pdf_labels):
        item = local_pdf_map[label]
        with open(item["abs_path"], "rb") as rf:
            candidate_items.append({
                "uid": hashlib.md5(f"local|{idx}|{item['abs_path']}".encode("utf-8")).hexdigest()[:12],
                "name": item["raw_name"],
                "display_name": item["display_name"],
                "meta_source": item["display_name"],
                "bytes": rf.read(),
                "origin": "local",
            })
else:
    uploads = st.file_uploader("手动上传 PDF（可多文件）", type=["pdf"], accept_multiple_files=True, key="mode4_pdf_uploader_multi")
    for idx, uf in enumerate(uploads or []):
        candidate_items.append({
            "uid": hashlib.md5(f"upload|{idx}|{uf.name}".encode("utf-8")).hexdigest()[:12],
            "name": uf.name,
            "display_name": uf.name,
            "meta_source": uf.name,
            "bytes": uf.getvalue(),
            "origin": "upload",
        })

jobs = []
if candidate_items:
    st.subheader("任务配置（添加后逐一填写目录页码）")
    st.caption("页码支持：单个页码 `5`、多个页码 `5,7,9`、范围 `5-8`，也支持混写。")
    for i, item in enumerate(candidate_items, start=1):
        book_v, grade_v, sem_v = _parse_book_meta_from_filename(item.get("meta_source") or item["name"])
        doc_tmp = fitz.open(stream=item["bytes"], filetype="pdf")
        total_pages = len(doc_tmp)
        doc_tmp.close()
        c1, c2 = st.columns([3, 2])
        with c1:
            st.write(f"{i}. {item['display_name']}")
            if book_v and grade_v and sem_v:
                st.caption(f"标签：{book_v} / {grade_v} / {sem_v} | 共 {total_pages} 页")
            else:
                st.caption(f"标签解析失败：文件名需为 版本_年级_册别.pdf | 共 {total_pages} 页")
        with c2:
            page_expr = st.text_input("目录页码", value="", placeholder="如 5 或 5,7 或 5-8", key=f"mode4_page_range_{item['uid']}")
        jobs.append({
            "uid": item["uid"],
            "name": item["name"],
            "display_name": item["display_name"],
            "bytes": item["bytes"],
            "book_version": (book_v or "").strip(),
            "grade": (grade_v or "").strip(),
            "semester": (sem_v or "").strip(),
            "page_range": page_expr,
            "total_pages": total_pages,
        })
else:
    st.info("请先选择至少一个教材 PDF。")

is_mode4_busy = bool(st.session_state.get("mode4_is_running", False) or st.session_state.get("mode4_pending_start", False))
c_start, c_pause = st.columns([3, 2])
with c_start:
    btn_start = st.button("开始提取单元目录（模式四）", type="primary", key="btn_mode4_start", disabled=is_mode4_busy)
with c_pause:
    btn_pause = st.button("暂停提取", key="btn_mode4_pause", disabled=not is_mode4_busy)

if btn_pause:
    st.session_state.mode4_stop_requested = True

if btn_start and not is_mode4_busy:
    st.session_state.mode4_pending_start = True
    st.rerun()

if bool(st.session_state.get("mode4_pending_start", False)):
    if not extract_api_keys:
        st.error("请先输入至少一个 API Key。")
        st.session_state.mode4_pending_start = False
    elif not jobs:
        st.error("没有可执行任务。")
        st.session_state.mode4_pending_start = False
    else:
        valid_jobs = []
        for job in jobs:
            if not (job["book_version"] and job["grade"] and job["semester"]):
                st.warning(f"已跳过（文件名不符合规则）：{job['display_name']}")
                continue
            pages = parse_page_range_input(job["page_range"], 1, job["total_pages"])
            if not pages:
                st.warning(f"已跳过（目录页码无效）：{job['display_name']} -> {job['page_range'] or '空'}")
                continue
            output_path = get_mode4_output_path(job["book_version"], job["grade"], job["semester"])
            valid_jobs.append({
                **job,
                "pages": pages,
                "output_path": output_path,
                "force_empty_desc": bool(mode4_force_empty_desc),
            })

        if not valid_jobs:
            st.error("没有可执行任务：请检查文件名和目录页码。")
            st.session_state.mode4_pending_start = False
            st.stop()

        st.session_state.mode4_pending_start = False
        st.session_state.mode4_is_running = True
        st.session_state.mode4_stop_requested = False
        st.session_state.mode4_results = []
        ensure_runtime_dirs()

        stop_event = threading.Event()
        status_box = st.empty()
        progress = st.progress(0.0)
        table_box = st.empty()
        detail_box = st.empty()
        event_queue = Queue()

        total_jobs = len(valid_jobs)
        max_workers = max(1, min(len(extract_api_keys), total_jobs))
        live_rows = []
        live_recent = {}
        live_errors = {}
        for idx, job in enumerate(valid_jobs):
            live_rows.append({
                "教材": job["display_name"],
                "状态": "排队中",
                "API": f"API-{(idx % len(extract_api_keys)) + 1}",
                "总页数": len(job["pages"]),
                "已完成页数": 0,
                "单元数": 0,
                "输出文件": job["output_path"],
            })
            live_recent[job["uid"]] = []
            live_errors[job["uid"]] = ""

        def render_table():
            table_box.dataframe(pd.DataFrame(live_rows), width="stretch", hide_index=True)

        detail_placeholders = {}
        with detail_box.container():
            st.markdown("**实时提取结果（按教材分组）**")
            for job in valid_jobs:
                st.markdown(f"**{job['display_name']}**")
                detail_placeholders[job["uid"]] = st.empty()

        def push_recent(uid, row):
            rows = live_recent.setdefault(uid, [])
            rows.append(row)
            if len(rows) > 200:
                live_recent[uid] = rows[-200:]
                rows = live_recent[uid]
            ph = detail_placeholders.get(uid)
            if ph:
                ph.dataframe(pd.DataFrame(rows), width="stretch", hide_index=True)

        render_table()
        status_box.info(f"开始并行处理：教材 {total_jobs} 本，API {len(extract_api_keys)} 个，并发 {max_workers}。")

        def worker(job, job_idx):
            if stop_event.is_set():
                return {"name": job["display_name"], "stopped": True}

            api_key = extract_api_keys[job_idx % len(extract_api_keys)]
            all_items = []
            doc = fitz.open(stream=job["bytes"], filetype="pdf")
            try:
                for page_idx, pno in enumerate(job["pages"], start=1):
                    if stop_event.is_set():
                        return {"name": job["display_name"], "stopped": True}
                    event_queue.put({
                        "type": "page_start",
                        "uid": job["uid"],
                        "job_idx": job_idx,
                        "page_idx": page_idx,
                        "page_no": pno,
                    })
                    b64_img = pdf_page_to_base64_cached(doc, pno)
                    items = extract_单元信息_from_page(b64_img, pno, api_key, extract_base_url, extract_model_name) or []
                    all_items.extend(items)
                    for item in items:
                        desc_value = "" if job.get("force_empty_desc", False) else item.get("unit_desc_short", "")
                        event_queue.put({
                            "type": "item",
                            "uid": job["uid"],
                            "job_idx": job_idx,
                            "row": {
                                "source_page": item.get("source_page", pno),
                                "unit": item.get("unit", ""),
                                "unit_title": item.get("unit_title", ""),
                                "unit_desc_short": desc_value,
                            },
                        })
                    event_queue.put({
                        "type": "page_done",
                        "uid": job["uid"],
                        "job_idx": job_idx,
                        "page_idx": page_idx,
                    })
            finally:
                doc.close()

            merged = {}
            for item in all_items:
                unit_key = (item.get("unit", "") or "").strip()
                if not unit_key:
                    continue
                if unit_key not in merged:
                    merged[unit_key] = {
                        "record_type": "unit",
                        "unit": unit_key,
                        "unit_title": item.get("unit_title", ""),
                        "unit_desc_short": "" if job.get("force_empty_desc", False) else item.get("unit_desc_short", ""),
                        "book_version": job["book_version"],
                        "grade": job["grade"],
                        "semester": job["semester"],
                        "source_pages": [item.get("source_page")],
                    }
                else:
                    current = merged[unit_key]
                    if not current.get("unit_title") and item.get("unit_title"):
                        current["unit_title"] = item.get("unit_title", "")
                    if (
                        not job.get("force_empty_desc", False)
                        and not current.get("unit_desc_short")
                        and item.get("unit_desc_short")
                    ):
                        current["unit_desc_short"] = item.get("unit_desc_short", "")
                    current["source_pages"].append(item.get("source_page"))

            rows = []
            for rec in merged.values():
                rec["source_pages"] = sorted(set([p for p in rec.get("source_pages", []) if isinstance(p, int)]))
                rows.append(rec)
            rows = sorted(rows, key=lambda x: _unit_sort_key(x.get("unit", "")))

            ensure_parent_dir(job["output_path"])
            with open(job["output_path"], "w", encoding="utf-8") as wf:
                for rec in rows:
                    wf.write(json.dumps(rec, ensure_ascii=False) + "\n")

            return {
                "name": job["display_name"],
                "rows": rows,
                "output": job["output_path"],
                "ok": True,
            }

        completed = 0
        executor = ThreadPoolExecutor(max_workers=max_workers)
        futures = {executor.submit(worker, job, idx): idx for idx, job in enumerate(valid_jobs)}
        try:
            while True:
                had_event = False
                while True:
                    try:
                        event = event_queue.get_nowait()
                    except Empty:
                        break
                    had_event = True
                    event_type = event.get("type")
                    idx = event.get("job_idx")
                    if idx is None or idx >= len(live_rows):
                        continue
                    row_ref = live_rows[idx]
                    if event_type == "page_start":
                        row_ref["状态"] = f"处理中（第 {event.get('page_no')} 页）"
                        row_ref["已完成页数"] = max(0, int(event.get("page_idx", 1)) - 1)
                    elif event_type == "item":
                        row_ref["单元数"] += 1
                        push_recent(event.get("uid", ""), event.get("row", {}))
                    elif event_type == "page_done":
                        row_ref["状态"] = "处理中"
                        row_ref["已完成页数"] = int(event.get("page_idx", row_ref["已完成页数"]))
                if had_event:
                    render_table()

                if st.session_state.get("mode4_stop_requested", False):
                    stop_event.set()

                done_count = sum(1 for f in futures if f.done())
                if done_count == len(futures):
                    break
                time.sleep(0.08)

            for fut, idx in futures.items():
                try:
                    ret = fut.result()
                except Exception as exc:
                    ret = {"name": valid_jobs[idx]["display_name"], "ok": False, "error": str(exc)}

                if ret.get("stopped"):
                    live_rows[idx]["状态"] = "已暂停"
                elif ret.get("ok"):
                    live_rows[idx]["状态"] = "已完成"
                    live_rows[idx]["已完成页数"] = live_rows[idx]["总页数"]
                    live_rows[idx]["单元数"] = len(ret.get("rows", []))
                    st.session_state.mode4_results.append(ret)
                else:
                    live_rows[idx]["状态"] = "异常"
                    live_errors[valid_jobs[idx]["uid"]] = str(ret.get("error", "") or "未知异常")

                completed += 1
                progress.progress(completed / max(1, total_jobs))
                render_table()
        finally:
            executor.shutdown(wait=True, cancel_futures=False)

        if st.session_state.get("mode4_stop_requested", False):
            status_box.info("提取已暂停，已保留已完成结果。")
        else:
            status_box.success("提取完成。")

        st.session_state.mode4_is_running = False
        st.session_state.mode4_stop_requested = False

        has_errors = any(str(v).strip() for v in live_errors.values())
        if has_errors:
            st.subheader("异常信息")
            uid_to_name = {job["uid"]: job["display_name"] for job in valid_jobs}
            for uid, err in live_errors.items():
                if str(err).strip():
                    st.error(f"{uid_to_name.get(uid, uid)}: {err}")

if st.session_state.get("mode4_results"):
    st.subheader("输出文件")
    for result in st.session_state.get("mode4_results", []):
        if result.get("output"):
            st.write(f"- {result['name']} | {result['output']}")
