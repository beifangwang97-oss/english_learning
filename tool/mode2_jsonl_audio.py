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
if "mode2_pause_requested" not in st.session_state:
    st.session_state.mode2_pause_requested = False

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
AUDIO_DIR = os.path.join(BASE_DIR, "audio")
DATA_DIR = os.path.join(BASE_DIR, "data")
LEGACY_DATA_DIR = os.path.join(BASE_DIR, "word_data")
LEGACY_UNRECORDED_DIR = os.path.join(LEGACY_DATA_DIR, "未录音")
LEGACY_RECORDED_DIR = os.path.join(LEGACY_DATA_DIR, "已录音")
RECORDED_DIR = LEGACY_RECORDED_DIR
RUNS_DIR = os.path.join(BASE_DIR, "runs")
PREPROCESS_DOC_DIR = os.path.join(BASE_DIR, "教材预处理文档")
STRUCTURE_DIR = os.path.join(BASE_DIR, "structure_data")
TARGET_TEXTBOOK_DIR = os.path.join(BASE_DIR, "待处理教材")
MAX_CONCURRENT_TTS = 2
LLM_TIMEOUT_SECONDS = 90
LLM_MAX_RETRIES = 4
LLM_CLIENT_CACHE = {}
STAGE1_ITEM_RETRY_LIMIT = 2
BRITISH_MALE_VOICE = "en-GB-RyanNeural"
BRITISH_FEMALE_VOICE = "en-GB-SoniaNeural"
VOICE_OPTIONS = [
    "en-GB-RyanNeural",
    "en-GB-SoniaNeural",
    "en-GB-ThomasNeural",
    "en-GB-LibbyNeural",
    "en-GB-MaisieNeural",
    "en-US-GuyNeural",
    "en-US-JennyNeural",
    "en-US-AndrewNeural",
    "en-US-EmmaNeural",
    "en-US-AriaNeural",
    "en-AU-WilliamNeural",
    "en-AU-NatashaNeural",
    "en-CA-LiamNeural",
    "en-CA-ClaraNeural",
    "en-IE-ConnorNeural",
    "en-IE-EmilyNeural",
    "en-IN-PrabhatNeural",
    "en-IN-NeerjaNeural",
]
VOICE_LABELS = {
    "en-GB-RyanNeural": "英式男声",
    "en-GB-SoniaNeural": "英式女声",
    "en-GB-ThomasNeural": "英式男声（沉稳）",
    "en-GB-LibbyNeural": "英式女声（清晰）",
    "en-GB-MaisieNeural": "英式女声（年轻）",
    "en-US-GuyNeural": "美式男声",
    "en-US-JennyNeural": "美式女声",
    "en-US-AndrewNeural": "美式男声（温和）",
    "en-US-EmmaNeural": "美式女声（自然）",
    "en-US-AriaNeural": "美式女声（明亮）",
    "en-AU-WilliamNeural": "澳式男声",
    "en-AU-NatashaNeural": "澳式女声",
    "en-CA-LiamNeural": "加式男声",
    "en-CA-ClaraNeural": "加式女声",
    "en-IE-ConnorNeural": "爱尔兰男声",
    "en-IE-EmilyNeural": "爱尔兰女声",
    "en-IN-PrabhatNeural": "印度男声",
    "en-IN-NeerjaNeural": "印度女声",
}

if "audio_max_concurrent_input" not in st.session_state:
    st.session_state.audio_max_concurrent_input = MAX_CONCURRENT_TTS
if "audio_max_concurrent_applied" not in st.session_state:
    st.session_state.audio_max_concurrent_applied = MAX_CONCURRENT_TTS
if "mode2_word_voice" not in st.session_state:
    st.session_state.mode2_word_voice = BRITISH_MALE_VOICE
if "mode2_phrase_voice" not in st.session_state:
    st.session_state.mode2_phrase_voice = BRITISH_MALE_VOICE
if "mode2_passage_sentence_voice" not in st.session_state:
    st.session_state.mode2_passage_sentence_voice = BRITISH_FEMALE_VOICE


def unpack_audio_task(task):
    if isinstance(task, (list, tuple)):
        if len(task) >= 3:
            return task[0], task[1], task[2]
        if len(task) == 2:
            return task[0], task[1], BRITISH_MALE_VOICE
    raise ValueError(f"不支持的音频任务格式: {task}")


def choose_voice_for_audio_type(audio_type_label):
    label = str(audio_type_label or "").strip()
    if label in {"例句发音", "课文句子发音"}:
        return st.session_state.get("mode2_passage_sentence_voice", BRITISH_FEMALE_VOICE)
    if label == "短语发音":
        return st.session_state.get("mode2_phrase_voice", BRITISH_MALE_VOICE)
    return st.session_state.get("mode2_word_voice", BRITISH_MALE_VOICE)


def get_word_voice():
    return st.session_state.get("mode2_word_voice", BRITISH_MALE_VOICE)


def get_phrase_voice():
    return st.session_state.get("mode2_phrase_voice", BRITISH_MALE_VOICE)


def get_passage_sentence_voice():
    return st.session_state.get("mode2_passage_sentence_voice", BRITISH_FEMALE_VOICE)


def normalize_phrase_text_for_tts(text):
    phrase = re.sub(r"\s+", " ", str(text or "").strip())
    if not phrase:
        return ""

    replacements = [
        (r"(?<![A-Za-z])sb\.'?s(?![A-Za-z])", "somebody's"),
        (r"(?<![A-Za-z])sth\.'?s(?![A-Za-z])", "something's"),
        (r"(?<![A-Za-z])sb\.(?![A-Za-z])", "somebody"),
        (r"(?<![A-Za-z])sth\.(?![A-Za-z])", "something"),
        (r"\bsp\b", "someplace"),
        (r"(?<![A-Za-z])sb's(?![A-Za-z])", "somebody's"),
        (r"\bone's\b", "someone's"),
    ]
    for pattern, repl in replacements:
        phrase = re.sub(pattern, repl, phrase, flags=re.IGNORECASE)

    phrase = re.sub(r"(?i)\b(How|What)\s+about\s+\.\.\.\s*\?", lambda m: f"{m.group(1)} about?", phrase)
    phrase = re.sub(r"\(\s*\.\.\.\s*\)", ",", phrase)
    phrase = re.sub(r"\.\.\.", ",", phrase)
    phrase = phrase.replace("/", " or ")
    phrase = re.sub(r"[()\[\]{}]", " ", phrase)
    phrase = re.sub(r"\s+", " ", phrase).strip(" ,;")
    phrase = re.sub(r"\s*,\s*", ", ", phrase)
    phrase = re.sub(r",\s*,+", ", ", phrase)
    phrase = re.sub(r"\s+([?.!,;:])", r"\1", phrase)
    phrase = re.sub(r",\s*([?.!])", r"\1", phrase)
    return phrase


def get_tts_text_for_item(word, item_type):
    text = str(word or "").strip()
    if str(item_type or "").strip().lower() == "phrase":
        normalized = normalize_phrase_text_for_tts(text)
        return normalized or text
    return text


def get_voice_option_index(selected_voice, default_voice):
    voice = selected_voice if selected_voice in VOICE_OPTIONS else default_voice
    return VOICE_OPTIONS.index(voice)


def format_voice_option(voice_id):
    return f"{voice_id} | {VOICE_LABELS.get(voice_id, '英语语音')}"

def ensure_runtime_dirs():
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(AUDIO_DIR, exist_ok=True)
    os.makedirs(RUNS_DIR, exist_ok=True)
    os.makedirs(PREPROCESS_DOC_DIR, exist_ok=True)


def make_task_id():
    return time.strftime("%Y%m%d_%H%M%S")


def sanitize_filename(text):
    safe = re.sub(r'[\\/:*?"<>|]+', "_", str(text or "").strip())
    safe = re.sub(r"\s+", "", safe)
    return safe or "unknown"


def normalize_catalog_name(text, fallback="未分类"):
    value = sanitize_filename(text)
    return value if value != "unknown" else fallback


def normalize_content_type_name(content_type):
    raw = str(content_type or "").strip().lower()
    mapping = {
        "word": "单词",
        "words": "单词",
        "单词": "单词",
        "单词表": "单词",
        "phrase": "短语",
        "phrases": "短语",
        "短语": "短语",
        "短语表": "短语",
        "passage": "课文",
        "passages": "课文",
        "课文": "课文",
    }
    return mapping.get(raw, str(content_type or "").strip() or "未分类")


def build_grade_semester_label(grade, semester):
    return f"{normalize_catalog_name(grade, '未知年级')}_{normalize_catalog_name(semester, '未知册别')}"


def get_data_output_dir(book_version, content_type):
    return os.path.join(
        DATA_DIR,
        normalize_catalog_name(book_version, "未知版本"),
        normalize_content_type_name(content_type),
    )


def get_source_tag_file_suffix(source_tag):
    source = str(source_tag or "").strip().lower()
    mapping = {
        "current_book": "current",
        "primary_school_review": "primary",
    }
    return mapping.get(source, sanitize_filename(source) if source else "")


def get_data_output_path(book_version, grade, semester, content_type, source_tag=""):
    filename = build_grade_semester_label(grade, semester)
    short_tag = get_source_tag_file_suffix(source_tag)
    if short_tag:
        filename = f"{filename}_{short_tag}"
    return os.path.join(
        get_data_output_dir(book_version, content_type),
        f"{filename}.jsonl",
    )


def build_mode2_copy_output_path(source_path):
    root, ext = os.path.splitext(source_path)
    candidate = f"{root}_mode2{ext}"
    if not os.path.exists(candidate):
        return candidate

    index = 2
    while True:
        candidate = f"{root}_mode2_{index}{ext}"
        if not os.path.exists(candidate):
            return candidate
        index += 1


def find_latest_mode2_copy_output_path(source_path):
    root, ext = os.path.splitext(source_path)
    base_dir = os.path.dirname(source_path)
    base_name = os.path.basename(root)
    pattern = re.compile(rf"^{re.escape(base_name)}_mode2(?:_(\d+))?{re.escape(ext)}$")
    candidates = []
    if not os.path.isdir(base_dir):
        return ""
    for name in os.listdir(base_dir):
        if not pattern.match(name):
            continue
        abs_path = os.path.join(base_dir, name)
        if os.path.isfile(abs_path):
            candidates.append(abs_path)
    if not candidates:
        return ""
    return max(candidates, key=lambda path: os.path.getmtime(path))


def choose_mode2_save_path(base_save_path, output_mode):
    if output_mode == "原文件写回":
        return base_save_path
    latest_copy = find_latest_mode2_copy_output_path(base_save_path)
    if latest_copy:
        return latest_copy
    return build_mode2_copy_output_path(base_save_path)


class LocalJsonlInput:
    def __init__(self, abs_path, display_name=None):
        self.abs_path = abs_path
        self.name = os.path.basename(abs_path)
        self.display_name = display_name or rel_path(abs_path)

    def getvalue(self):
        with open(self.abs_path, "rb") as rf:
            return rf.read()


def get_audio_output_dir(book_version, grade, semester, content_type):
    return os.path.join(
        AUDIO_DIR,
        normalize_catalog_name(book_version, "未知版本"),
        normalize_content_type_name(content_type),
        build_grade_semester_label(grade, semester),
    )


def ensure_parent_dir(path):
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)


def discover_local_jsonl_files_by_type(content_type_folder):
    results = []
    if not os.path.isdir(DATA_DIR):
        return results

    for root, _, files in os.walk(DATA_DIR):
        if os.path.basename(root) != content_type_folder:
            continue
        for name in files:
            if not name.lower().endswith(".jsonl"):
                continue
            abs_path = os.path.join(root, name)
            results.append(
                {
                    "abs_path": abs_path,
                    "raw_name": name,
                    "display_name": os.path.relpath(abs_path, BASE_DIR).replace("\\", "/"),
                }
            )
    return sorted(results, key=lambda item: item["display_name"])


def get_source_file_label(file_obj):
    return getattr(file_obj, "display_name", getattr(file_obj, "name", ""))


def load_items_from_uploaded(uploaded_file, source_type):
    parsed = []
    inferred_source_tag = infer_source_tag_from_filename(uploaded_file.name)
    source_label = get_source_file_label(uploaded_file)
    for line in uploaded_file.getvalue().decode("utf-8-sig", errors="replace").splitlines():
        if not line.strip():
            continue
        item = _load_json_line(line)
        if inferred_source_tag and not str(item.get("source_tag", "") or "").strip():
            item["source_tag"] = inferred_source_tag
        item["_source_type"] = source_type
        item["_source_file"] = source_label
        parsed.append(item)
    return parsed


def rel_path_from_base(abs_path):
    rel_path = os.path.relpath(abs_path, BASE_DIR).replace("\\", "/")
    return f"./{rel_path}"


def to_abs_audio_path(audio_rel_path):
    if not audio_rel_path:
        return ""
    cleaned = str(audio_rel_path).strip()
    if cleaned.startswith("./audio/"):
        return os.path.join(AUDIO_DIR, cleaned.replace("./audio/", ""))
    if cleaned.startswith("audio/"):
        return os.path.join(AUDIO_DIR, cleaned.replace("audio/", ""))
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


def resolve_audio_rel(current_rel_path, uid, expected_filename, audio_dir=AUDIO_DIR, rel_dir="audio", example_idx=None):
    if current_rel_path:
        abs_from_rel = to_abs_audio_path(current_rel_path)
        if is_valid_audio_file(abs_from_rel):
            return current_rel_path, True

    found_name = find_audio_filename_by_rule(uid, expected_filename, audio_dir=audio_dir, example_idx=example_idx)
    if found_name:
        return f"./{str(rel_dir).strip('./')}/{found_name}", True

    return f"./{str(rel_dir).strip('./')}/{expected_filename}", False


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


def infer_meta_from_items(items, fallback_name=""):
    book_version = ""
    grade = ""
    semester = ""
    content_type = ""

    for row in items or []:
        if not isinstance(row, dict):
            continue
        book_version = book_version or str(row.get("book_version", "") or "").strip()
        grade = grade or str(row.get("grade", "") or "").strip()
        semester = semester or str(row.get("semester", "") or "").strip()
        row_type = str(row.get("type", "") or row.get("item_type", "") or "").strip()
        if row_type:
            content_type = content_type or normalize_content_type_name(row_type)
        if book_version and grade and semester and content_type:
            break

    fallback_lower = str(fallback_name or "").lower()
    if not content_type:
        if "phrase" in fallback_lower or "短语" in fallback_lower:
            content_type = "短语"
        elif "passage" in fallback_lower or "课文" in fallback_lower:
            content_type = "课文"
        else:
            content_type = "单词"

    return (
        book_version or "未知版本",
        grade or "未知年级",
        semester or "未知册别",
        content_type,
    )


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


def _is_tts_service_unavailable(error_msg: str) -> bool:
    normalized = str(error_msg or "")
    keywords = (
        "503",
        "Cannot connect",
        "Connection timeout",
        "Server disconnected",
        "ClientConnectorError",
        "WSServerHandshakeError",
        "timeout to host",
    )
    return any(keyword in normalized for keyword in keywords)


async def _generate_single_audio_with_retry(text, filepath, semaphore, voice=BRITISH_MALE_VOICE, max_retries=4):
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
                if _is_tts_service_unavailable(error_msg):
                    wait_time = 8 * (attempt + 1)
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
    
    for i, task in enumerate(audio_tasks):
        text, path, voice = unpack_audio_task(task)
        result = await _generate_single_audio_with_retry(text, path, semaphore, voice=voice)
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
        
        async def process_one(text, path, voice, idx):
            async with semaphore:
                await asyncio.sleep(min(0.35 * idx, 1.2))
                result = await _generate_single_audio_concurrent(text, path, voice=voice)
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
        
        tasks = []
        for i, task in enumerate(audio_tasks):
            text, path, voice = unpack_audio_task(task)
            tasks.append(process_one(text, path, voice, i))
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        return success_count[0], fail_count[0]
    
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    
    return loop.run_until_complete(run_all())


async def _generate_single_audio_concurrent(text, filepath, voice=BRITISH_MALE_VOICE, max_retries=4):
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
            if _is_tts_service_unavailable(error_msg):
                wait_time = 8 * (attempt + 1)
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


def repair_recorded_jsonl_file(uploaded_file, audio_max_concurrent, output_mode="原文件写回"):
    ensure_runtime_dirs()
    inferred_source_tag = infer_source_tag_from_filename(uploaded_file.name)
    fixed_rows = []
    repair_tasks = []
    path_fixed_count = 0
    generated_task_count = 0

    for line in uploaded_file.getvalue().decode("utf-8-sig", errors="replace").splitlines():
        if not line.strip():
            continue
        item = _load_json_line(line)
        if inferred_source_tag and not str(item.get("source_tag", "") or "").strip():
            item["source_tag"] = inferred_source_tag

        item_type = (item.get("type", "") or "word").strip().lower()
        item_book_version = (item.get("book_version", "") or "").strip() or "未知版本"
        item_grade = (item.get("grade", "") or "").strip() or "未知年级"
        item_semester = (item.get("semester", "") or "").strip() or "未知册别"

        if item_type == "passage":
            sentence_audio_dir = get_audio_output_dir(item_book_version, item_grade, item_semester, "课文")
            sentence_rel_dir = rel_path_from_base(sentence_audio_dir)[2:]
            os.makedirs(sentence_audio_dir, exist_ok=True)
            target_id = (item.get("target_id", "") or "").strip()
            if not target_id:
                target_id = f"{item.get('unit', 'Unit ?')} Section {item.get('section', '')} {item.get('label', '')}".strip()
            uid_seed = f"{target_id}|{item.get('book_version','')}|{item.get('grade','')}|{item.get('semester','')}|{item.get('source_tag','')}"
            uid = (item.get("id", "") or "").strip() or hashlib.md5(uid_seed.encode("utf-8")).hexdigest()[:12]
            item["id"] = uid

            sentences = item.get("sentences", [])
            if isinstance(sentences, list):
                for sent_idx, s_item in enumerate(sentences):
                    if not isinstance(s_item, dict):
                        continue
                    sent_en = (s_item.get("en", "") or "").strip()
                    if not sent_en:
                        continue
                    current_audio = s_item.get("audio", "")
                    expected_filename = f"{uid}_sent_{sent_idx}.mp3"
                    resolved_rel, exists = resolve_audio_rel(
                        current_audio,
                        uid,
                        expected_filename,
                        audio_dir=sentence_audio_dir,
                        rel_dir=sentence_rel_dir,
                        example_idx=sent_idx,
                    )
                    if resolved_rel != current_audio:
                        path_fixed_count += 1
                    s_item["audio"] = resolved_rel
                    if not exists:
                        repair_tasks.append((sent_en, to_abs_audio_path(resolved_rel), get_passage_sentence_voice()))
                        generated_task_count += 1

            fixed_rows.append(item)
            continue

        word = (item.get("word", "") or "").strip()
        if not word:
            fixed_rows.append(item)
            continue

        content_type = "单词" if item_type == "word" else "短语"
        item_audio_dir = get_audio_output_dir(item_book_version, item_grade, item_semester, content_type)
        item_rel_dir = rel_path_from_base(item_audio_dir)[2:]
        os.makedirs(item_audio_dir, exist_ok=True)
        word_clean = "".join([c for c in word if c.isalpha() or c.isspace() or c == "'"]).strip().replace(" ", "_")
        uid = (item.get("id", "") or "").strip() or get_unique_id(
            word_clean,
            item.get("unit", "unk"),
            item.get("grade", "unk"),
            item.get("semester", ""),
            item.get("book_version", ""),
            item.get("source_tag", ""),
        )
        item["id"] = uid

        main_field = "word_audio" if item_type == "word" else "phrase_audio"
        expected_main_filename = f"{uid}_{word_clean}.mp3"
        current_main_rel = item.get(main_field, "")
        resolved_main_rel, main_exists = resolve_audio_rel(
            current_main_rel,
            uid,
            expected_main_filename,
            audio_dir=item_audio_dir,
            rel_dir=item_rel_dir,
            example_idx=None,
        )
        if resolved_main_rel != current_main_rel:
            path_fixed_count += 1
        item[main_field] = resolved_main_rel
        if not main_exists:
            repair_tasks.append((
                get_tts_text_for_item(word, item_type),
                to_abs_audio_path(resolved_main_rel),
                get_word_voice() if item_type == "word" else get_phrase_voice(),
            ))
            generated_task_count += 1

        meanings = item.get("meanings", [])
        if isinstance(meanings, list):
            for meaning_idx, meaning in enumerate(meanings):
                if not isinstance(meaning, dict):
                    continue
                example = (meaning.get("example", "") or "").strip()
                if not example:
                    continue
                current_ex_rel = meaning.get("example_audio", "")
                expected_ex_filename = f"{uid}_{word_clean}_ex_{meaning_idx}.mp3"
                resolved_ex_rel, ex_exists = resolve_audio_rel(
                    current_ex_rel,
                    uid,
                    expected_ex_filename,
                    audio_dir=item_audio_dir,
                    rel_dir=item_rel_dir,
                    example_idx=meaning_idx,
                )
                if resolved_ex_rel != current_ex_rel:
                    path_fixed_count += 1
                meaning["example_audio"] = resolved_ex_rel
                if not ex_exists:
                    repair_tasks.append((example, to_abs_audio_path(resolved_ex_rel), get_passage_sentence_voice()))
                    generated_task_count += 1

        fixed_rows.append(item)

    success = 0
    fail = 0
    if repair_tasks:
        success, fail = generate_audios_in_batch(repair_tasks, None, None, max_concurrent=audio_max_concurrent)

    book_version, grade, semester, content_type = infer_meta_from_items(fixed_rows, uploaded_file.name)
    source_tag = ""
    for row in fixed_rows:
        if not isinstance(row, dict):
            continue
        source_tag = str(row.get("source_tag", "") or "").strip()
        if source_tag:
            break
    base_save_path = get_data_output_path(book_version, grade, semester, content_type, source_tag)
    save_path = choose_mode2_save_path(base_save_path, output_mode)
    ensure_parent_dir(save_path)
    with open(save_path, "w", encoding="utf-8") as wf:
        for row in fixed_rows:
            wf.write(json.dumps(_sanitize_item_for_jsonl(row), ensure_ascii=False) + "\n")

    return {
        "save_path": save_path,
        "row_count": len(fixed_rows),
        "path_fixed_count": path_fixed_count,
        "generated_task_count": generated_task_count,
        "success": success,
        "fail": fail,
    }


st.title("Tiger English - 模式二：JSONL导入与音频生成")

with st.sidebar:
    st.header("音频并发配置")
    st.number_input(
        "TTS 并发数",
        min_value=1,
        max_value=20,
        step=1,
        key="audio_max_concurrent_input",
        disabled=st.session_state.is_generating_audio,
        help="输入本次音频生成使用的并发数。建议 1-2 更稳，值越大速度越快，但失败风险也会提高。",
    )
    if st.button("确定并发数", disabled=st.session_state.is_generating_audio, use_container_width=True):
        st.session_state.audio_max_concurrent_applied = int(st.session_state.audio_max_concurrent_input)
        st.success(f"本次已锁定 TTS 并发数：{st.session_state.audio_max_concurrent_applied}")
    audio_max_concurrent = int(st.session_state.get("audio_max_concurrent_applied", MAX_CONCURRENT_TTS))
    st.caption(f"当前已确认并发数：{audio_max_concurrent}")
    if st.session_state.is_generating_audio:
        st.info(f"生成进行中，本次任务固定使用并发数：{audio_max_concurrent}")
    else:
        st.caption("当前模式不做续跑；如果中断，本次任务结束。下次重新开始时会重新检查现有音频与路径。")
    st.divider()
    st.header("模型配置")
    st.selectbox(
        "单词：英式男声",
        options=VOICE_OPTIONS,
        index=get_voice_option_index(st.session_state.get("mode2_word_voice", BRITISH_MALE_VOICE), BRITISH_MALE_VOICE),
        format_func=format_voice_option,
        key="mode2_word_voice",
        disabled=st.session_state.is_generating_audio,
        help="用于单词主音频生成。默认英式男声。",
    )
    st.selectbox(
        "短语：英式男声",
        options=VOICE_OPTIONS,
        index=get_voice_option_index(st.session_state.get("mode2_phrase_voice", BRITISH_MALE_VOICE), BRITISH_MALE_VOICE),
        format_func=format_voice_option,
        key="mode2_phrase_voice",
        disabled=st.session_state.is_generating_audio,
        help="用于短语主音频生成。默认英式男声。",
    )
    st.selectbox(
        "课文句子：英式女声",
        options=VOICE_OPTIONS,
        index=get_voice_option_index(st.session_state.get("mode2_passage_sentence_voice", BRITISH_FEMALE_VOICE), BRITISH_FEMALE_VOICE),
        format_func=format_voice_option,
        key="mode2_passage_sentence_voice",
        disabled=st.session_state.is_generating_audio,
        help="用于例句和课文逐句音频生成。默认英式女声。",
    )
    st.caption("以上下拉选项提供常用 Edge TTS 英语声音类型，后续生成与修复音频都会按当前选择执行。")

tab2 = st.tabs(["模式二：JSONL 导入与音频生成"])[0]

with tab2:
    st.info("上传单词、短语或课文 JSONL，系统会自动补齐音频路径、生成缺失音频，并按当前语音配置写回结果。")

    col_upload1, col_upload2, col_upload3 = st.columns(3)
    with col_upload1:
        uploaded_words = st.file_uploader("上传单词 JSONL 文件（可多选）", type=["jsonl"], accept_multiple_files=True, key="words_uploader")
    with col_upload2:
        uploaded_phrases = st.file_uploader("上传短语 JSONL 文件（可多选）", type=["jsonl"], accept_multiple_files=True, key="phrases_uploader")
    with col_upload3:
        uploaded_passages = st.file_uploader("上传课文 JSONL 文件（可多选）", type=["jsonl"], accept_multiple_files=True, key="passages_uploader")

    local_word_items = discover_local_jsonl_files_by_type("单词")
    local_phrase_items = discover_local_jsonl_files_by_type("短语")
    local_passage_items = discover_local_jsonl_files_by_type("课文")
    local_word_map = {item["display_name"]: item for item in local_word_items}
    local_phrase_map = {item["display_name"]: item for item in local_phrase_items}
    local_passage_map = {item["display_name"]: item for item in local_passage_items}

    st.markdown("**从本地目录选择 JSONL**")
    col_local1, col_local2, col_local3 = st.columns(3)
    with col_local1:
        selected_local_word_labels = st.multiselect(
            "从本地目录选择单词 JSONL（data/版本/单词/*.jsonl）",
            options=list(local_word_map.keys()),
            default=[],
            key="mode2_local_word_selector",
        )
    with col_local2:
        selected_local_phrase_labels = st.multiselect(
            "从本地目录选择短语 JSONL（data/版本/短语/*.jsonl）",
            options=list(local_phrase_map.keys()),
            default=[],
            key="mode2_local_phrase_selector",
        )
    with col_local3:
        selected_local_passage_labels = st.multiselect(
            "从本地目录选择课文 JSONL（data/版本/课文/*.jsonl）",
            options=list(local_passage_map.keys()),
            default=[],
            key="mode2_local_passage_selector",
        )

    upload_tasks = []
    for wf in (uploaded_words or []):
        upload_tasks.append((wf, "word"))
    for pf in (uploaded_phrases or []):
        upload_tasks.append((pf, "phrase"))
    for tf in (uploaded_passages or []):
        upload_tasks.append((tf, "passage"))
    for label in selected_local_word_labels:
        item = local_word_map[label]
        upload_tasks.append((LocalJsonlInput(item["abs_path"], item["display_name"]), "word"))
    for label in selected_local_phrase_labels:
        item = local_phrase_map[label]
        upload_tasks.append((LocalJsonlInput(item["abs_path"], item["display_name"]), "phrase"))
    for label in selected_local_passage_labels:
        item = local_passage_map[label]
        upload_tasks.append((LocalJsonlInput(item["abs_path"], item["display_name"]), "passage"))

    output_mode = st.radio(
        "JSONL 输出方式",
        options=["原文件写回", "同目录新建副本"],
        index=0,
        horizontal=True,
        key="mode2_output_mode",
        disabled=st.session_state.is_generating_audio,
        help="原文件写回会直接写入目标结果文件；同目录新建副本会在同一目录生成 `_mode2.jsonl`，如重名则自动顺延为 `_mode2_2.jsonl`、`_mode2_3.jsonl`。",
    )

    with st.expander("已录音 JSONL 修复", expanded=False):
        st.caption("如果已有 JSONL 中的音频路径缺失、旧路径失效或音频文件损坏，可以在这里自动修复并补生成缺失音频。")
        recorded_repair_file = st.file_uploader(
            "选择要修复的 JSONL 文件",
            type=["jsonl"],
            accept_multiple_files=False,
            key="recorded_jsonl_repair_uploader",
        )
        if recorded_repair_file is not None:
            st.write(f"当前文件：{recorded_repair_file.name}")
        if st.button("开始修复", disabled=st.session_state.is_generating_audio or recorded_repair_file is None, key="btn_repair_recorded_jsonl"):
            with st.spinner("正在修复 JSONL 音频路径与缺失音频..."):
                repair_summary = repair_recorded_jsonl_file(
                    recorded_repair_file,
                    audio_max_concurrent,
                    output_mode=output_mode,
                )
            st.success(
                f"修复完成：共处理 {repair_summary['row_count']} 条，修正路径 {repair_summary['path_fixed_count']} 处，"
                f"补生成任务 {repair_summary['generated_task_count']} 个，成功 {repair_summary['success']} 个，失败 {repair_summary['fail']} 个。"
            )
            st.code(repair_summary["save_path"])

    mode2_dynamic_updates = st.checkbox(
        "Enable live updates",
        value=True,
        key="mode2_dynamic_updates",
        disabled=st.session_state.is_generating_audio,
        help="Disable this for large batches to reduce Streamlit rerender pressure during processing.",
    )
    if not mode2_dynamic_updates:
        st.caption("Live updates are disabled for this run. The page will only keep essential progress and will show results after completion.")

    btn_jsonl = False
    if upload_tasks:
        st.info("系统会根据 JSONL 内容自动推断输出路径，并写入 `data/版本/单词|短语|课文/年级_册数.jsonl` 与对应的 `audio/版本/类型/年级_册数/` 目录。原文件写回时不修改文件名；副本输出时会在当前文件名后追加 `_mode2`，并自动避让重名。")
        if uploaded_words:
            st.write(f"单词文件数：{len(uploaded_words)}")
        if uploaded_phrases:
            st.write(f"短语文件数：{len(uploaded_phrases)}")
        if uploaded_passages:
            st.write(f"课文文件数：{len(uploaded_passages)}")
        if selected_local_word_labels:
            st.write(f"本地单词文件数：{len(selected_local_word_labels)}")
        if selected_local_phrase_labels:
            st.write(f"本地短语文件数：{len(selected_local_phrase_labels)}")
        if selected_local_passage_labels:
            st.write(f"本地课文文件数：{len(selected_local_passage_labels)}")

        existing_by_source = {}
        for uploaded_file, source_type in upload_tasks:
            source_label = get_source_file_label(uploaded_file)
            preview_items = load_items_from_uploaded(uploaded_file, source_type)
            bv, gg, ss, content_type = infer_meta_from_items(preview_items, uploaded_file.name)
            source_tag = ""
            for row in preview_items:
                if not isinstance(row, dict):
                    continue
                source_tag = str(row.get("source_tag", "") or "").strip()
                if source_tag:
                    break
            base_expected_path = get_data_output_path(bv, gg, ss, content_type, source_tag)
            expected_files = []
            if os.path.exists(base_expected_path):
                expected_files.append(base_expected_path)
            latest_copy = find_latest_mode2_copy_output_path(base_expected_path)
            if latest_copy and latest_copy not in expected_files:
                expected_files.append(latest_copy)
            existing_by_source[source_label] = expected_files

        conflict_count = sum(1 for _, existing in existing_by_source.items() if existing)
        if conflict_count > 0:
            st.warning(f"发现 {conflict_count} 个输入文件对应的目标结果已存在。")
            with st.expander("查看冲突文件", expanded=False):
                for source_name, files in existing_by_source.items():
                    if not files:
                        continue
                    st.markdown(f"**{source_name}**")
                    for p in files:
                        st.write(f"- {os.path.basename(p)}")
            st.caption("当前输出方式已在上方统一设置；如果选择副本输出，会自动生成 `_mode2` 后缀文件。")
        else:
            st.caption("当前未发现同名目标文件，可直接生成。")

        btn_jsonl = st.button("开始生成音频", type="primary", width="stretch", key="btn_jsonl_record")

    if btn_jsonl:
        st.session_state.jsonl_audio_data = []
        st.session_state.is_generating_audio = True
        
        main_progress = st.progress(0)
        main_status = st.empty()
        table_placeholder_2 = st.empty()
        detail_placeholder_2 = st.empty()

        class _Mode2StatusProxy:
            def __init__(self, target, enable_text_updates):
                self.target = target
                self.enable_text_updates = enable_text_updates

            def text(self, message):
                if self.enable_text_updates:
                    self.target.text(message)

            def success(self, message):
                self.target.success(message)

        main_status = _Mode2StatusProxy(main_status, bool(mode2_dynamic_updates))
        
        start_time_2 = time.time()
        ensure_runtime_dirs()
        os.makedirs(AUDIO_DIR, exist_ok=True)

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

        def resolve_audio_rel(current_rel_path, uid, expected_filename, audio_dir=AUDIO_DIR, rel_dir="audio", example_idx=None):
            if current_rel_path:
                abs_from_rel = to_abs_audio_path(current_rel_path)
                if is_valid_audio_file(abs_from_rel):
                    return current_rel_path, True

            found_name = find_audio_filename_by_rule(uid, expected_filename, audio_dir=audio_dir, example_idx=example_idx)
            if found_name:
                return f"./{str(rel_dir).strip('./')}/{found_name}", True

            return f"./{str(rel_dir).strip('./')}/{expected_filename}", False

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

        enable_live_updates = bool(mode2_dynamic_updates)

        def refresh_mode2_status(message, force=False):
            if force or enable_live_updates:
                main_status.text(message)

        refresh_mode2_status("Preparing batch JSONL audio generation...", force=True)

        global_success_total = 0
        global_fail_total = 0
        global_skipped_total = 0
        global_already_processed = 0
        aggregated_items = []
        generated_files = []
        live_rows_mode2 = []
        live_items_mode2 = {}

        def render_mode2_live_table(rows):
            if not enable_live_updates or not rows:
                return
            with table_placeholder_2.container():
                st.markdown("**音频任务实时进度（按文件）**")
                st.dataframe(pd.DataFrame(rows), width="stretch", hide_index=True)

        st.markdown("**实时回传（按文件，增量追加）**")
        if enable_live_updates:
            st.markdown("**Live Batch Details**")
        else:
            detail_placeholder_2.info("Live updates are disabled for this batch. Detailed results will be shown after processing finishes.")
        detail_area = detail_placeholder_2.container()
        file_detail_slots = {}
        file_detail_seen_ids = {}

        def ensure_mode2_file_panel(src_file):
            if not enable_live_updates:
                return
            if src_file in file_detail_slots:
                return
            with detail_area:
                with st.expander(f"{src_file}（实时）", expanded=False):
                    slot = st.empty()
            file_detail_slots[src_file] = slot
            file_detail_seen_ids[src_file] = set()

        def render_mode2_file_detail(src_file):
            if not enable_live_updates:
                return
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
                    st.markdown("**课文句子音频回传**")
                    h1, h2, h3, h4 = st.columns([2, 3, 3, 2])
                    h1.markdown("**课文标识**")
                    h2.markdown("**英文**")
                    h3.markdown("**中文**")
                    h4.markdown("**音频**")
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
            if not enable_live_updates:
                return
            ensure_mode2_file_panel(src_file)
            rid = (item.get("id", "") or "").strip()
            if rid and rid in file_detail_seen_ids.get(src_file, set()):
                return
            live_items_mode2.setdefault(src_file, []).append(dict(item))
            if rid:
                file_detail_seen_ids[src_file].add(rid)
            render_mode2_file_detail(src_file)

        for file_idx, (uploaded_file, source_type) in enumerate(upload_tasks):
            file_label = get_source_file_label(uploaded_file)
            all_items = load_items_from_uploaded(uploaded_file, source_type)
            if not all_items:
                main_progress.progress((file_idx + 1) / len(upload_tasks))
                continue

            book_version, grade, semester, content_type = infer_meta_from_items(all_items, uploaded_file.name)
            source_tag = ""
            for row in all_items:
                if not isinstance(row, dict):
                    continue
                source_tag = str(row.get("source_tag", "") or "").strip()
                if source_tag:
                    break
            base_save_path = get_data_output_path(book_version, grade, semester, content_type, source_tag)
            save_path = choose_mode2_save_path(base_save_path, output_mode)
            ensure_parent_dir(save_path)

            live_row = {
                "文件": file_label,
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
            live_items_mode2[file_label] = []
            ensure_mode2_file_panel(file_label)
            render_mode2_live_table(live_rows_mode2)

            existing_items_map = load_existing_items_map(save_path)

            for i, uploaded_item in enumerate(all_items):
                item_type = (uploaded_item.get("type", "") or uploaded_item.get("item_type", "") or source_type)
                audio_tasks_for_item = []
                item_success = 0
                item_fail = 0

                if item_type == "passage":
                    sentence_audio_dir = get_audio_output_dir(
                        uploaded_item.get("book_version", "") or book_version,
                        uploaded_item.get("grade", "") or grade,
                        uploaded_item.get("semester", "") or semester,
                        "课文",
                    )
                    sentence_rel_dir = rel_path_from_base(sentence_audio_dir)[2:]
                    os.makedirs(sentence_audio_dir, exist_ok=True)
                    target_id = (uploaded_item.get("target_id", "") or "").strip()
                    if not target_id:
                        target_id = f"{uploaded_item.get('unit','Unit ?')} Section {uploaded_item.get('section','')} {uploaded_item.get('label','')}".strip()

                    uid_seed = f"{target_id}|{uploaded_item.get('book_version','')}|{uploaded_item.get('grade','')}|{uploaded_item.get('semester','')}|{uploaded_item.get('source_tag','')}"
                    uid = hashlib.md5(uid_seed.encode("utf-8")).hexdigest()[:12]
                    uploaded_item["id"] = uid

                    item = existing_items_map.get(uid, uploaded_item)
                    if uid in existing_items_map:
                        global_already_processed += 1

                    for core_key in ["unit", "unit_no", "is_starter", "section", "label", "labels", "display_label", "task_kind", "target_id", "title", "passage_text", "matched_labels", "source_pages", "source_line", "raw_scope_line", "book_version", "grade", "semester", "type", "id", "_source_file"]:
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
                            audio_dir=sentence_audio_dir,
                            rel_dir=sentence_rel_dir,
                            example_idx=sent_idx,
                        )
                        s_item["audio"] = resolved_sent_rel
                        if sent_exists:
                            global_skipped_total += 1
                        else:
                            audio_tasks_for_item.append((sent_en, os.path.join(sentence_audio_dir, sent_filename), get_passage_sentence_voice()))

                    display_name = target_id[:20] if target_id else "passage"
                else:
                    word = uploaded_item.get("word", "")
                    if not word:
                        continue

                    item_content_type = "单词" if item_type == "word" else "短语"
                    item_audio_dir = get_audio_output_dir(
                        uploaded_item.get("book_version", "") or book_version,
                        uploaded_item.get("grade", "") or grade,
                        uploaded_item.get("semester", "") or semester,
                        item_content_type,
                    )
                    item_rel_dir = rel_path_from_base(item_audio_dir)[2:]
                    os.makedirs(item_audio_dir, exist_ok=True)
                    word_clean = "".join([c for c in word if c.isalpha() or c.isspace() or c == "'"]).strip().replace(" ", "_")
                    uid = get_unique_id(
                        word_clean,
                        uploaded_item.get("unit", "unk"),
                        uploaded_item.get("grade", "unk"),
                        uploaded_item.get("semester", ""),
                        uploaded_item.get("book_version", ""),
                        uploaded_item.get("source_tag", ""),
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
                        audio_dir=item_audio_dir,
                        rel_dir=item_rel_dir,
                        example_idx=None,
                    )
                    item[main_field] = resolved_main_rel

                    if main_exists:
                        global_skipped_total += 1
                    else:
                        audio_tasks_for_item.append((
                            get_tts_text_for_item(word, item_type),
                            os.path.join(item_audio_dir, main_filename),
                            get_word_voice() if item_type == "word" else get_phrase_voice(),
                        ))

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
                                audio_dir=item_audio_dir,
                                rel_dir=item_rel_dir,
                                example_idx=meaning_idx,
                            )
                            m["example_audio"] = resolved_ex_rel

                            if ex_exists:
                                global_skipped_total += 1
                            else:
                                audio_tasks_for_item.append((example, os.path.join(item_audio_dir, ex_filename), get_passage_sentence_voice()))

                    display_name = word[:20]

                if "_source_type" in item:
                    del item["_source_type"]

                if audio_tasks_for_item:
                    main_status.text(f"🎵 [{file_idx + 1}/{len(upload_tasks)}] {file_label} -> {display_name}")
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

                append_mode2_live_item(file_label, item)
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
                    st.markdown("**课文句子音频**")
                    h1, h2, h3, h4 = st.columns([2, 3, 3, 2])
                    h1.markdown("**课文标识**")
                    h2.markdown("**英文**")
                    h3.markdown("**中文**")
                    h4.markdown("**音频**")
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
            st.subheader("课文音频统计")
            st.info(f"共检测到 **{len(article_ids)}** 篇课文，已生成 **{audio_count}** 条句子音频。")

        st.divider()
        st.subheader("损坏音频检查")
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
                        "text_to_generate": get_tts_text_for_item(word, item_type),
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
                            repair_tasks.append((text, full_path, choose_voice_for_audio_type(d_item.get("audio_type", ""))))
                    
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
                            repair_tasks.append((text, full_path, choose_voice_for_audio_type(d_item.get("audio_type", ""))))
                    
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
    
    
