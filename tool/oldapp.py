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

AUDIO_DIR = os.path.join(os.getcwd(), "audio")
DATA_DIR = os.path.join(os.getcwd(), "word_data")
STRUCTURE_DIR = os.path.join(os.getcwd(), "structure_data")
TARGET_TEXTBOOK_DIR = r"D:\待处理教材"
MAX_CONCURRENT_TTS = 20
LLM_TIMEOUT_SECONDS = 90
LLM_MAX_RETRIES = 4
LLM_CLIENT_CACHE = {}
STAGE1_ITEM_RETRY_LIMIT = 2
POS_STANDARD_SET = {
    "n.", "v.", "adj.", "adv.", "prep.", "pron.", "conj.", "interj.", "num.", "art.", "phr."
}


def get_openai_client(api_key, base_url):
    cache_key = f"{base_url}|{api_key}"
    if cache_key not in LLM_CLIENT_CACHE:
        LLM_CLIENT_CACHE[cache_key] = OpenAI(api_key=api_key, base_url=base_url)
    return LLM_CLIENT_CACHE[cache_key]


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
        normalized.append({
            "pos": (m.get("pos", "") or "").strip(),
            "meaning": (m.get("meaning", "") or "").strip(),
            "example": (m.get("example", "") or "").strip(),
            "example_zh": (m.get("example_zh", "") or "").strip(),
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


def _normalize_pos_value(pos):
    value = (pos or "").strip().lower()
    if not value:
        return ""
    if value in {"n", "v", "adj", "adv", "prep", "pron", "conj", "interj", "num", "art", "phr"}:
        return f"{value}."
    if value.endswith("."):
        base = value[:-1]
        if base in {"n", "v", "adj", "adv", "prep", "pron", "conj", "interj", "num", "art", "phr"}:
            return value
    return value


def _normalize_stage1_item(raw, fallback_unit):
    if not isinstance(raw, dict):
        return None

    word = (raw.get("word", "") or "").strip()
    word = re.sub(r"\s+", " ", word)
    word = re.sub(r"^[\-\*\d\.\)\s]+", "", word).strip()
    if not word:
        return None

    item_type = (raw.get("type", "") or "").strip().lower()
    if item_type not in {"word", "phrase"}:
        item_type = "phrase" if " " in word else "word"

    unit = _normalize_unit_text(raw.get("unit", ""), fallback_unit)
    source_meanings = raw.get("meanings")
    if not isinstance(source_meanings, list) or not source_meanings:
        source_meanings = [{
            "pos": raw.get("pos", "") or "",
            "meaning": raw.get("meaning", "") or "",
        }]

    meanings = []
    for m in source_meanings:
        if not isinstance(m, dict):
            continue
        pos = _normalize_pos_value(m.get("pos", ""))
        meaning = (m.get("meaning", "") or "").strip()
        if not meaning:
            continue
        meanings.append({
            "pos": pos,
            "meaning": meaning,
            "example": "",
            "example_zh": ""
        })

    dedup_meanings = []
    seen_meaning = set()
    for m in meanings:
        key = (m["pos"], m["meaning"])
        if key in seen_meaning:
            continue
        seen_meaning.add(key)
        dedup_meanings.append(m)

    return {
        "word": word,
        "phonetic": "",
        "meanings": dedup_meanings,
        "unit": unit,
        "type": item_type,
    }


def _validate_stage1_item(item):
    if not isinstance(item, dict):
        return False, "not_object"
    word = (item.get("word", "") or "").strip()
    if not word or not re.search(r"[A-Za-z]", word):
        return False, "invalid_word"
    if re.search(r"[^\w\s\-\']", word):
        return False, "invalid_word_chars"
    item_type = (item.get("type", "") or "").strip().lower()
    if item_type not in {"word", "phrase"}:
        return False, "invalid_type"
    unit = (item.get("unit", "") or "").strip()
    if not unit:
        return False, "missing_unit"
    meanings = item.get("meanings")
    if not isinstance(meanings, list) or not meanings:
        return False, "missing_meanings"

    has_valid_meaning = False
    has_pos_for_word = False
    for m in meanings:
        if not isinstance(m, dict):
            continue
        meaning = (m.get("meaning", "") or "").strip()
        pos = _normalize_pos_value(m.get("pos", ""))
        if meaning:
            has_valid_meaning = True
        if item_type == "word" and pos in POS_STANDARD_SET:
            has_pos_for_word = True
    if not has_valid_meaning:
        return False, "empty_meanings"
    if item_type == "word" and not has_pos_for_word:
        return False, "missing_pos"
    return True, ""


def _repair_stage1_item_with_retry(raw_item, fallback_unit, grade_level, api_key, base_url, model_name):
    if not isinstance(raw_item, dict):
        return None
    client = get_openai_client(api_key, base_url)
    raw_payload = json.dumps(raw_item, ensure_ascii=False)
    prompt = f"""
You are fixing one extracted vocabulary JSON item from a textbook page.
Return ONE valid JSON object only. No markdown.

Required output schema:
{{
  "word": "english word or phrase",
  "type": "word or phrase",
  "unit": "Unit X",
  "meanings": [
    {{
      "pos": "n./v./adj./adv./prep./pron./conj./interj./num./art./phr. (word required, phrase can be empty)",
      "meaning": "Chinese meaning"
    }}
  ]
}}

Rules:
- grade context: {grade_level}
- fallback unit: {fallback_unit}
- word must contain English letters
- type must be word or phrase
- unit must not be empty
- meanings must be non-empty
- For type=word, at least one meaning must include a standard POS above.
- Do not add example/example_zh/audio in this stage.

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
        normalized = _normalize_stage1_item(parsed, fallback_unit)
        ok, _ = _validate_stage1_item(normalized)
        if ok:
            return normalized
    return None


def _merge_stage2_meanings(base_meanings, completed_meanings, item_type):
    base = base_meanings if isinstance(base_meanings, list) else []
    completed = completed_meanings if isinstance(completed_meanings, list) else []
    if not completed:
        return base

    merged = []
    max_len = max(len(base), len(completed))
    for i in range(max_len):
        b = base[i] if i < len(base) and isinstance(base[i], dict) else {}
        c = completed[i] if i < len(completed) and isinstance(completed[i], dict) else {}
        pos = _normalize_pos_value(c.get("pos", "") or b.get("pos", ""))
        if item_type == "word" and not pos:
            pos = _normalize_pos_value(b.get("pos", ""))
        merged.append({
            "pos": pos,
            "meaning": (c.get("meaning", "") or b.get("meaning", "") or "").strip(),
            "example": (c.get("example", "") or "").strip(),
            "example_zh": (c.get("example_zh", "") or "").strip(),
        })

    merged = [m for m in merged if m.get("meaning")]
    return merged if merged else base


def complete_item_stage2(item, api_key, base_url, model_name, grade_level):
    if not isinstance(item, dict):
        return item
    meanings = item.get("meanings") or []
    if not meanings:
        return item

    meaning_seed_parts = []
    for m in meanings:
        if not isinstance(m, dict):
            continue
        pos = (m.get("pos", "") or "").strip()
        meaning = (m.get("meaning", "") or "").strip()
        if not meaning:
            continue
        if pos:
            meaning_seed_parts.append(f"{pos} {meaning}")
        else:
            meaning_seed_parts.append(meaning)
    meaning_seed = "; ".join(meaning_seed_parts)
    if not meaning_seed:
        return item

    completed = complete_word_info(
        item.get("word", ""),
        meaning_seed,
        api_key,
        base_url,
        model_name,
        grade_level,
        item.get("type", "word")
    )
    if not completed:
        return item

    item["phonetic"] = (completed.get("phonetic", "") or "").strip()
    item["meanings"] = _merge_stage2_meanings(meanings, completed.get("meanings", []), item.get("type", "word"))
    return item


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
{{
  "unit": "Unit X",
  "unit_title": "....",
  "unit_desc_short": "One short question under the unit title"
}}
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


def extract_passage_from_page(base64_image, api_key, base_url, model_name, unit_label, section_label):
    client = get_openai_client(api_key, base_url)
    section_hint = "dialogue text in Section A" if section_label == "A" else "reading text in Section B"
    prompt = f"""
You are extracting textbook passage content from one page image.
Target unit: {unit_label}
Target section: {section_label}
Target type: {section_hint}

Return ONE JSON object only:
{{
  "title": "passage title if visible, else empty string",
  "passage_text": "main passage text on this page"
}}

Rules:
- Keep original language, do not translate.
- Focus on the passage body, ignore page numbers, headers, footers, and exercise items.
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
                error_msg = str(e)
                if "503" in error_msg or "Cannot connect" in error_msg:
                    wait_time = 5 * (attempt + 1)
                    print(f"TTS 服务暂时不可用 [{text}]，等待 {wait_time} 秒后重试 (尝试 {attempt + 1}/{max_retries})")
                    await asyncio.sleep(wait_time)
                    continue
                print(f"TTS 生成失败 [{text}] (尝试 {attempt + 1}/{max_retries}): {e}")
            
            if attempt < max_retries - 1:
                await asyncio.sleep(2 * (attempt + 1))
        
        print(f"TTS 生成失败 [{text}]，已放弃")
        return False


async def _generate_audios_with_progress(audio_tasks, progress_callback=None):
    semaphore = asyncio.Semaphore(12)
    results = []
    
    for i, (text, path) in enumerate(audio_tasks):
        result = await _generate_single_audio_with_retry(text, path, semaphore)
        results.append(result)
        if progress_callback:
            progress_callback(i + 1, len(audio_tasks))
        await asyncio.sleep(0.5)
    
    return results


def generate_audios_in_batch(audio_tasks, progress_bar=None, status_text=None):
    async def run_all():
        semaphore = asyncio.Semaphore(12)
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
            if "503" in error_msg or "Cannot connect" in error_msg:
                wait_time = 3 * (attempt + 1)
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
    context_info = f"Current best unit context: {last_unit}." if last_unit else "No prior unit context."

    prompt = f"""
You are extracting textbook vocabulary from one page image (grade context: {grade_level}).
{context_info}

This is stage-1 extraction, so only return:
- word/phrase text
- unit
- type (word or phrase)
- Chinese meanings
- POS for words

Return JSON array only (no markdown), each item:
{{
  "word": "...",
  "type": "word|phrase",
  "unit": "Unit X",
  "meanings": [
    {{
      "pos": "n.|v.|adj.|adv.|prep.|pron.|conj.|interj.|num.|art.|phr.",
      "meaning": "????"
    }}
  ]
}}

Rules:
- Keep only real English words/phrases from the page.
- unit should use "Unit + number" format if visible.
- For type=word, at least one meaning must include a valid POS.
- For type=phrase, POS can be empty.
- Do not output example/example_zh/phonetic/audio fields in this stage.
"""
    request_kwargs = {
        "model": model_name,
        "messages": [
            {"role": "user", "content": [{"type": "text", "text": prompt},
                                         {"type": "image_url",
                                          "image_url": {"url": f"data:image/png;base64,{base64_image}",
                                                        "detail": "high"}}]}
        ],
        "temperature": 0.1,
    }

    parsed, error = call_chat_json_with_retry(client, request_kwargs, expect_list=True)
    if error:
        st.warning(f"??1???????? {LLM_MAX_RETRIES} ?: {error}")
        return []

    if not isinstance(parsed, list):
        return []

    cleaned_items = []
    seen = set()
    repaired_count = 0
    dropped_count = 0

    for raw in parsed:
        normalized = _normalize_stage1_item(raw, last_unit)
        ok, _ = _validate_stage1_item(normalized)
        if not ok:
            repaired = _repair_stage1_item_with_retry(
                raw,
                last_unit,
                grade_level,
                api_key,
                base_url,
                model_name
            )
            if repaired:
                normalized = repaired
                ok, _ = _validate_stage1_item(normalized)
                if ok:
                    repaired_count += 1

        if not ok:
            dropped_count += 1
            continue

        dedup_key = (
            normalized["word"].lower(),
            normalized["unit"].lower(),
            normalized["type"]
        )
        if dedup_key in seen:
            continue
        seen.add(dedup_key)
        cleaned_items.append(normalized)

    if repaired_count:
        st.info(f"??1???????: {repaired_count}")
    if dropped_count:
        st.warning(f"??1?????????????: {dropped_count}")

    return cleaned_items

def complete_word_info(word, meaning, api_key, base_url, model_name, grade_level, item_type="word"):
    client = get_openai_client(api_key, base_url)

    type_desc = "phrase" if item_type == "phrase" else "word"

    prompt = f"""
You are enriching one textbook {type_desc} entry for grade {grade_level}.

Input:
- text: {word}
- known meaning seed: {meaning}

Return ONE JSON object only (no markdown):
{{
  "phonetic": "...",
  "meanings": [
    {{
      "pos": "n.|v.|adj.|adv.|prep.|pron.|conj.|interj.|num.|art.|phr.",
      "meaning": "????",
      "example": "English example sentence",
      "example_zh": "????"
    }}
  ]
}}

Rules:
- Keep meanings in Chinese.
- Provide useful English example and Chinese translation for each meaning.
- For phrase, pos can be empty.
- For word, use standard POS values.
- JSON only.
"""
    request_kwargs = {
        "model": model_name,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.3,
    }

    parsed, error = call_chat_json_with_retry(client, request_kwargs, expect_list=False)
    if error:
        st.warning(f"??2???????? {LLM_MAX_RETRIES} ?: {error}")
        return None

    if not isinstance(parsed, dict):
        return None

    normalized = {
        "phonetic": (parsed.get("phonetic", "") or "").strip(),
        "meanings": _normalize_meanings(parsed)
    }
    return normalized

def append_to_jsonl(file_path, item):
    with open(file_path, 'a', encoding='utf-8') as f:
        f.write(json.dumps(item, ensure_ascii=False) + '\n')


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
    st.header("📄 PDF 文件上传")
    global_uploaded_pdf = st.file_uploader("上传 PDF 文件", type=["pdf"], key="global_pdf_uploader")
    
    if global_uploaded_pdf:
        global_pdf_bytes = global_uploaded_pdf.getvalue()
        st.session_state.global_pdf_bytes = global_pdf_bytes
        global_doc = PDFCache.get_doc(global_pdf_bytes)
        global_total_p = len(global_doc)
        
        st.write(f"PDF 总页数：**{global_total_p}** 页")
        
        col_start, col_end = st.columns(2)
        with col_start:
            global_start_p = st.number_input("起始页", min_value=1, max_value=global_total_p, value=1, key="global_start_page")
        with col_end:
            global_end_p = st.number_input("结束页", min_value=1, max_value=global_total_p, value=global_total_p, key="global_end_page")
        
        st.session_state.global_page_range = (global_start_p, global_end_p)
    
    st.divider()
    
    st.header("🔧 提取 API 配置")
    extract_api_key = st.text_input("提取 API Key", type="password", key="extract_api_key")
    extract_base_url = st.text_input("提取 Base URL", value="https://openrouter.ai/api/v1", key="extract_base_url")
    extract_model_name = st.text_input("提取模型名称", value="openai/gpt-4o-mini", key="extract_model_name")
    
    st.divider()
    st.header("🔧 校对 API 配置")
    proofread_api_key = st.text_input("校对 API Key", type="password", key="proofread_api_key")
    proofread_base_url = st.text_input("校对 Base URL", value="https://openrouter.ai/api/v1", key="proofread_base_url")
    proofread_model_name = st.text_input("校对模型名称", value="openai/gpt-4o-mini", key="proofread_model_name")
    
    st.divider()
    
    if st.session_state.get("preprocessed_pages"):
        st.success("✅ 已检测到预处理数据")
        pre_pages = st.session_state.preprocessed_pages
        split_pages = [p for p, info in pre_pages.items() if info.get("mode") == "split"]
        none_pages = [p for p, info in pre_pages.items() if info.get("mode") == "none"]
        
        st.info(f"预处理页数：{len(pre_pages)} 页")
        st.write(f"- 已分割页数：{len(split_pages)} 页")
        if split_pages:
            st.write(f"  页码: {sorted(split_pages)}")
        st.write(f"- 未分割页数：{len(none_pages)} 页")
        if none_pages:
            st.write(f"  页码: {sorted(none_pages)}")
        
        if st.button("清空预处理数据", key="btn_clear_preprocess"):
            st.session_state.preprocessed_pages = {}
            st.session_state.split_mode = {}
            for key in list(st.session_state.keys()):
                if key.startswith("split_option_"):
                    del st.session_state[key]
            st.rerun()

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
    
    if not st.session_state.get("global_pdf_bytes"):
        st.warning("请先在左侧上传 PDF 文件")
    else:
        pre_pdf_bytes = st.session_state.global_pdf_bytes
        pre_doc = PDFCache.get_doc(pre_pdf_bytes)
        pre_start_p, pre_end_p = st.session_state.get("global_page_range", (1, len(pre_doc)))
        
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
                st.success(f"已保存预处理结果，共 {len(st.session_state.preprocessed_pages)} 页")
            if st.button("清空预处理", key="btn_clear_all_preprocess"):
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
                st.image(img_bytes, use_container_width=True)
            
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
                        st.image(info.get("left_bytes"), use_container_width=True)
                        st.markdown("**右列预览：**")
                        st.image(info.get("right_bytes"), use_container_width=True)
                else:
                    st.info("已设置为不分割")
            
            st.divider()
        
        if st.button("完成预处理并进入提取", type="primary", key="btn_finish_preprocess"):
            st.session_state.preprocessed_range = (pre_start_p, pre_end_p)
            st.success(f"预处理完成！共处理 {len(st.session_state.preprocessed_pages)} 页，请切换到【模式一】进行提取。")

with tab1:
    btn_pdf = False
    if "stop_extraction" not in st.session_state:
        st.session_state.stop_extraction = False
    
    if not st.session_state.get("global_pdf_bytes"):
        st.warning("⚠️ 请先在左侧上传 PDF 文件")
    else:
        pdf_bytes = st.session_state.global_pdf_bytes
        doc = PDFCache.get_doc(pdf_bytes)
        total_p = len(doc)
        
        start_p, end_p = st.session_state.get("global_page_range", (1, total_p))
        
        st.subheader("教材元数据")
        col_meta1, col_meta2, col_meta3 = st.columns(3)
        with col_meta1:
            b_version = st.text_input("教材版本", "人教版", key="book_version")
        with col_meta2:
            b_grade = st.selectbox("年级", ["七年级", "八年级", "九年级", "高一", "高二", "高三"], key="grade_select")
        with col_meta3:
            b_semester = st.selectbox("上下册", ["上册", "下册", "全一册"], key="semester_select")
        
        st.session_state.export_name_tab1 = f"{b_version}_{b_grade}_{b_semester}"
        
        col_btn_extract, col_btn_stop = st.columns(2)
        with col_btn_extract:
            btn_pdf = st.button("🐅 开始解析 PDF", type="primary", key="btn_pdf_extract")
        with col_btn_stop:
            if st.button("🛑 停止解析", type="secondary", key="btn_stop_extraction"):
                st.session_state.stop_extraction = True
                st.warning("正在停止解析...")
        
        use_preprocessed = bool(st.session_state.get("preprocessed_pages", {}))
        if use_preprocessed:
            st.info("检测到预处理结果，将使用分割后的图像进行提取。")
            pre_check = st.session_state.preprocessed_pages
            split_pages = [p for p, info in pre_check.items() if info.get("mode") == "split"]
            st.write(f"预处理数据：共 {len(pre_check)} 页，其中分割 {len(split_pages)} 页")
            
            if len(pre_check) > 0 and len(split_pages) == 0:
                st.write("调试信息：")
                sample_key = list(pre_check.keys())[0]
                sample_val = pre_check[sample_key]
                st.write(f"  - 样本键: {sample_key}, 类型: {type(sample_key)}")
                st.write(f"  - 样本值类型: {type(sample_val)}")
                st.write(f"  - 样本值内容: {sample_val}")
                st.write(f"  - mode 字段: '{sample_val.get('mode')}'")
        else:
            st.warning("未检测到预处理结果")

    if btn_pdf:
        if not extract_api_key:
            st.error("请先填入提取 API Key")
        else:
            start_time = time.time()
            st.session_state.is_extracting_pdf = True
            st.session_state.all_extracted_data = []
            st.session_state.realtime_data = []
            st.session_state.pdf_bytes = st.session_state.global_pdf_bytes
            st.session_state.current_page_images = {}
            st.session_state.items_to_delete = set()
            st.session_state.items_to_move = set()
            
            os.makedirs(DATA_DIR, exist_ok=True)
            
            last_unit_context = ""
            pdf_data = st.session_state.global_pdf_bytes
            doc = PDFCache.get_doc(pdf_data)
            total_p = len(doc)
            
            start_p, end_p = st.session_state.get("global_page_range", (1, total_p))
            
            st.session_state.stop_extraction = False
            
            use_preprocessed = bool(st.session_state.get("preprocessed_pages", {}))
            
            if use_preprocessed:
                st.info("检测到预处理结果，将使用分割后的图像进行提取。")
            
            progress_bar = st.progress(0)
            progress_text = st.empty()
            page_image_placeholder = st.empty()
            data_placeholder = st.empty()
            
            extraction_tasks = []
            preprocessed_pages_keys = list(st.session_state.preprocessed_pages.keys()) if st.session_state.get("preprocessed_pages") else []
            
            split_count = 0
            full_count = 0
            missing_count = 0
            
            for p_num in range(start_p, end_p + 1):
                preprocessed_info = st.session_state.preprocessed_pages.get(p_num, {})
                if preprocessed_info.get("mode") == "split":
                    extraction_tasks.append((p_num, "left", preprocessed_info))
                    extraction_tasks.append((p_num, "right", preprocessed_info))
                    split_count += 1
                elif preprocessed_info.get("mode") == "none":
                    extraction_tasks.append((p_num, "full", preprocessed_info))
                    full_count += 1
                else:
                    extraction_tasks.append((p_num, "full", preprocessed_info))
                    missing_count += 1
            
            st.info(
                f"提取任务统计：分割 {split_count} 页，未分割 {full_count} 页，"
                f"预处理缺失 {missing_count} 页，共 {len(extraction_tasks)} 个任务"
            )
            
            if preprocessed_pages_keys:
                st.info(f"📋 预处理页码范围：{min(preprocessed_pages_keys)} - {max(preprocessed_pages_keys)}，提取页码范围：{start_p} - {end_p}")
            
            st.session_state.extraction_progress = {"current": 0, "total": len(extraction_tasks), "current_page": start_p}
            
            for i, (p_num, part, preprocessed_info) in enumerate(extraction_tasks):
                if st.session_state.stop_extraction:
                    progress_text.warning("解析已停止")
                    break
                
                st.session_state.extraction_progress["current"] = i + 1
                
                part_name = f"第{p_num - start_p + 1}页" if part == "full" else f"第{p_num - start_p + 1}页-{'左列' if part == 'left' else '右列'}"
                
                progress_bar.progress((i + 1) / len(extraction_tasks))
                progress_text.info(f"正在解析: {part_name} ({i + 1}/{len(extraction_tasks)})...")
                
                if preprocessed_info.get("mode") == "split" and part in ["left", "right"]:
                    if part == "left":
                        img_bytes = preprocessed_info.get("left_bytes")
                    else:
                        img_bytes = preprocessed_info.get("right_bytes")
                    b64_img = base64.b64encode(img_bytes).decode('utf-8')
                    
                    st.session_state.current_page_images[f"{p_num}_{part}"] = img_bytes
                else:
                    img_bytes = pdf_page_to_image_bytes_cached(doc, p_num)
                    b64_img = pdf_page_to_base64_cached(doc, p_num)
                    st.session_state.current_page_images[p_num] = img_bytes
                
                page_image_placeholder.subheader(f"📄 当前: {part_name}")
                page_image_placeholder.image(img_bytes, use_container_width=True)
                
                page_results = extract_vocab_with_context(b64_img, extract_api_key, extract_base_url, extract_model_name,
                                                          last_unit_context, b_grade)
                
                if page_results:
                    stage2_api_key = proofread_api_key if proofread_api_key else extract_api_key
                    stage2_base_url = proofread_base_url if proofread_api_key else extract_base_url
                    stage2_model = proofread_model_name if proofread_api_key else extract_model_name
                    for item in page_results:
                        item["book_version"] = b_version
                        item["grade"] = b_grade
                        item["semester"] = b_semester
                        
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

                        item = complete_item_stage2(
                            item,
                            stage2_api_key,
                            stage2_base_url,
                            stage2_model,
                            b_grade
                        )
                        
                        word_clean = "".join([c for c in item.get("word", "") if
                                              c.isalpha() or c.isspace() or c == "'"]).strip().replace(" ", "_")
                        item["id"] = get_unique_id(word_clean, last_unit_context, b_grade)
                        
                        if item["type"] == "word":
                            item["word_audio"] = ""
                            item["example_audio"] = ""
                        else:
                            item["phrase_audio"] = ""
                            item["example_audio"] = ""
                        
                        st.session_state.all_extracted_data.append(item)
                        st.session_state.realtime_data.append(item)
                
                data_placeholder.subheader("📝 实时提取结果")
                if st.session_state.realtime_data:
                    df_realtime = pd.DataFrame([flatten_meanings_for_display(item) for item in st.session_state.realtime_data])
                    data_placeholder.dataframe(df_realtime, use_container_width=True)
                
                time.sleep(0.05)
            
            elapsed_seconds = int(time.time() - start_time)
            st.session_state.task_duration = f"{elapsed_seconds}秒"
            st.session_state.is_extracting_pdf = False
            st.rerun()

    if not st.session_state.is_extracting_pdf and st.session_state.all_extracted_data:
        st.success(f"PDF 解析完毕！耗时：**{st.session_state.task_duration}**。请在下方核对修改，无误后点击保存。")
        
        all_data = [item for item in st.session_state.all_extracted_data if item.get("id") not in st.session_state.items_to_delete]
        units = sorted(list(set([item.get("unit", "未知单元") for item in all_data]) | st.session_state.custom_units), key=lambda x: (len(x), x))
        
        col_left, col_right = st.columns([1, 2])
        
        with col_left:
            st.subheader("📄 PDF 页面预览")
            if st.session_state.pdf_bytes:
                start_p, end_p = st.session_state.selected_range
                page_range = list(range(start_p, end_p + 1))
                
                selected_page = st.selectbox(
                    "选择页面",
                    page_range,
                    key="page_selector",
                    format_func=lambda x: f"第{x}页"
                )
                
                if selected_page in st.session_state.current_page_images:
                    st.image(st.session_state.current_page_images[selected_page], use_container_width=True)
                else:
                    doc = PDFCache.get_doc(st.session_state.pdf_bytes)
                    img_bytes = pdf_page_to_image_bytes_cached(doc, selected_page)
                    st.session_state.current_page_images[selected_page] = img_bytes
                    st.image(img_bytes, use_container_width=True)
        
        with col_right:
            st.subheader("📝 单元词汇数据编辑")
            
            col_unit1, col_unit2 = st.columns([3, 1])
            with col_unit1:
                selected_unit = st.selectbox("选择单元", units, key="unit_selector")
            with col_unit2:
                st.write("")
                if st.button("➕ 新建单元", key="btn_new_unit"):
                    st.session_state.show_new_unit_input = True
            
            if st.session_state.get("show_new_unit_input", False):
                with st.container():
                    new_unit_name = st.text_input("输入新单元名称（如 Unit 3）", key="new_unit_name_input")
                    col_confirm1, col_confirm2 = st.columns(2)
                    with col_confirm1:
                        if st.button("✅ 确认添加", key="btn_confirm_new_unit"):
                            if new_unit_name and new_unit_name not in units:
                                st.session_state.custom_units.add(new_unit_name)
                                st.session_state.show_new_unit_input = False
                                st.success(f"已添加新单元: {new_unit_name}")
                                st.rerun()
                            elif new_unit_name in units:
                                st.warning("单元已存在")
                    with col_confirm2:
                        if st.button("❌ 取消", key="btn_cancel_new_unit"):
                            st.session_state.show_new_unit_input = False
                            st.rerun()
            
            unit_data = [item for item in all_data if item.get("unit") == selected_unit]
            words_data = [item for item in unit_data if item.get("type") == "word"]
            phrases_data = [item for item in unit_data if item.get("type") == "phrase"]
            
            tab_words, tab_phrases = st.tabs([f"单词列表 ({len(words_data)})", f"短语列表 ({len(phrases_data)})"])
            
            with tab_words:
                st.markdown("### 单词数据")
                if words_data:
                    flat_words = [flatten_meanings_for_display(item) for item in words_data]
                    df_words = pd.DataFrame(flat_words)
                    
                    display_cols = ["word", "phonetic", "pos", "meaning", "example", "example_zh"]
                    df_display = df_words[[col for col in display_cols if col in df_words.columns]].copy()
                    df_display.insert(0, "选择", False)
                    
                    edited_words_df = st.data_editor(
                        df_display,
                        num_rows="dynamic",
                        use_container_width=True,
                        key=f"words_editor_{selected_unit}",
                        column_config={
                            "选择": st.column_config.CheckboxColumn("选择", default=False, width="small"),
                            "word": st.column_config.TextColumn("英文单词", width="medium"),
                            "phonetic": st.column_config.TextColumn("音标", width="medium"),
                            "pos": st.column_config.TextColumn("词性", width="small"),
                            "meaning": st.column_config.TextColumn("释义", width="medium"),
                            "example": st.column_config.TextColumn("英文例句", width="large"),
                            "example_zh": st.column_config.TextColumn("中文例句", width="large")
                        },
                        hide_index=True
                    )
                    
                    st.session_state.edited_words[selected_unit] = edited_words_df
                    
                    col_del, col_move = st.columns(2)
                    with col_del:
                        if st.button("🗑️ 删除选中项", key=f"btn_delete_words_{selected_unit}"):
                            selected_rows = edited_words_df[edited_words_df["选择"] == True]
                            if not selected_rows.empty:
                                for _, row in selected_rows.iterrows():
                                    word_id = words_data[list(flat_words).index(row) if row in flat_words else None]
                                    if word_id:
                                        st.session_state.items_to_delete.add(word_id.get("id", ""))
                                st.success(f"已标记删除 {len(selected_rows)} 个单词")
                                st.rerun()
                    
                    with col_move:
                        target_unit = st.selectbox("目标单元", [u for u in units if u != selected_unit], key=f"move_target_{selected_unit}")
                        if st.button("📦 移动选中项", key=f"btn_move_words_{selected_unit}"):
                            selected_rows = edited_words_df[edited_words_df["选择"] == True]
                            if not selected_rows.empty:
                                for idx, row in selected_rows.iterrows():
                                    for item in st.session_state.all_extracted_data:
                                        if item.get("word") == row["word"] and item.get("unit") == selected_unit:
                                            item["unit"] = target_unit
                                st.success(f"已移动 {len(selected_rows)} 个单词到 {target_unit}")
                                st.rerun()
                else:
                    st.info("该单元暂无单词数据")
                
                st.divider()
                st.markdown("### ➕ 批量添加单词")
                
                st.markdown("**格式说明**：每行一个单词，格式为`英文 词性 中文释义`")
                st.markdown("例如：`apple n. 苹果` 或 `book n. 书 v. 预订`")
                
                batch_words_input = st.text_area(
                    "输入批量单词数据",
                    height=150,
                    placeholder="apple n. 苹果\nbanana n. 香蕉\nbook n. 书 v. 预订",
                    key=f"batch_words_input_{selected_unit}"
                )
                
                btn_add_words = st.button("批量添加单词", type="primary", key=f"btn_add_words_{selected_unit}")
                
                if btn_add_words:
                    if batch_words_input.strip():
                        if proofread_api_key:
                            lines = [line.strip() for line in batch_words_input.strip().split('\n') if line.strip()]
                            added_count = 0
                            failed_words = []
                            
                            progress_bar = st.progress(0)
                            status_text = st.empty()
                            
                            for idx, line in enumerate(lines):
                                status_text.text(f"正在处理: {line} ({idx + 1}/{len(lines)})")
                                
                                parts = line.split(None, 1)
                                if len(parts) >= 2:
                                    word = parts[0].strip()
                                    pos_meaning = parts[1].strip() if len(parts) > 1 else ""
                                    
                                    try:
                                        completed_info = complete_word_info(
                                            word, pos_meaning,
                                            proofread_api_key, proofread_base_url, proofread_model_name,
                                            b_grade, "word"
                                        )
                                        
                                        if completed_info:
                                            meanings_data = completed_info.get("meanings", [])
                                            if not meanings_data or len(meanings_data) == 0:
                                                meanings_data = [{"pos": "", "meaning": pos_meaning, "example": "", "example_zh": ""}]
                                            
                                            new_item = {
                                                "word": word,
                                                "phonetic": completed_info.get("phonetic", ""),
                                                "meanings": meanings_data,
                                                "unit": selected_unit,
                                                "type": "word",
                                                "book_version": b_version,
                                                "grade": b_grade,
                                                "semester": b_semester,
                                                "word_audio": ""
                                            }
                                            word_clean = "".join([c for c in word if c.isalpha() or c.isspace() or c == "'"]).strip().replace(" ", "_")
                                            new_item["id"] = get_unique_id(word_clean, selected_unit, b_grade)
                                            
                                            st.session_state.all_extracted_data.append(new_item)
                                            added_count += 1
                                        else:
                                            failed_words.append(word)
                                    except Exception as e:
                                        failed_words.append(word)
                                else:
                                    failed_words.append(line)
                                
                                progress_bar.progress((idx + 1) / len(lines))
                            
                            status_text.empty()
                            progress_bar.empty()
                            
                            if added_count > 0:
                                st.success(f"成功添加 {added_count} 个单词")
                            if failed_words:
                                st.warning(f"添加失败的单词: {', '.join(failed_words)}")
                            
                            if added_count > 0:
                                st.rerun()
                        else:
                            st.warning("请先配置校对 API")
                    else:
                        st.warning("请输入单词数据")
            
            with tab_phrases:
                st.markdown("### 短语数据")
                if phrases_data:
                    flat_phrases = [flatten_meanings_for_display(item) for item in phrases_data]
                    df_phrases = pd.DataFrame(flat_phrases)
                    
                    display_cols = ["word", "phonetic", "pos", "meaning", "example", "example_zh"]
                    df_display = df_phrases[[col for col in display_cols if col in df_phrases.columns]].copy()
                    df_display.insert(0, "选择", False)
                    
                    edited_phrases_df = st.data_editor(
                        df_display,
                        num_rows="dynamic",
                        use_container_width=True,
                        key=f"phrases_editor_{selected_unit}",
                        column_config={
                            "选择": st.column_config.CheckboxColumn("选择", default=False, width="small"),
                            "word": st.column_config.TextColumn("英文短语", width="medium"),
                            "phonetic": st.column_config.TextColumn("音标", width="medium"),
                            "pos": st.column_config.TextColumn("词性", width="small"),
                            "meaning": st.column_config.TextColumn("释义", width="medium"),
                            "example": st.column_config.TextColumn("英文例句", width="large"),
                            "example_zh": st.column_config.TextColumn("中文例句", width="large")
                        },
                        hide_index=True
                    )
                    
                    st.session_state.edited_phrases[selected_unit] = edited_phrases_df
                    
                    col_del, col_move = st.columns(2)
                    with col_del:
                        if st.button("🗑️ 删除选中项", key=f"btn_delete_phrases_{selected_unit}"):
                            selected_rows = edited_phrases_df[edited_phrases_df["选择"] == True]
                            if not selected_rows.empty:
                                for _, row in selected_rows.iterrows():
                                    for item in phrases_data:
                                        if item.get("word") == row["word"]:
                                            st.session_state.items_to_delete.add(item.get("id", ""))
                                            break
                                st.success(f"已标记删除 {len(selected_rows)} 个短语")
                                st.rerun()
                    
                    with col_move:
                        target_unit_p = st.selectbox("目标单元", [u for u in units if u != selected_unit], key=f"move_target_p_{selected_unit}")
                        if st.button("📦 移动选中项", key=f"btn_move_phrases_{selected_unit}"):
                            selected_rows = edited_phrases_df[edited_phrases_df["选择"] == True]
                            if not selected_rows.empty:
                                for idx, row in selected_rows.iterrows():
                                    for item in st.session_state.all_extracted_data:
                                        if item.get("word") == row["word"] and item.get("unit") == selected_unit:
                                            item["unit"] = target_unit_p
                                st.success(f"已移动 {len(selected_rows)} 个短语到 {target_unit_p}")
                                st.rerun()
                else:
                    st.info("该单元暂无短语数据")
                
                st.divider()
                st.markdown("### ➕ 批量添加短语")
                
                st.markdown("**格式说明**：每行一个短语，格式为`英文 中文释义`")
                st.markdown("例如：`look for 寻找` 或 `get up 起床`")
                
                batch_phrases_input = st.text_area(
                    "输入批量短语数据",
                    height=150,
                    placeholder="look for 寻找\nget up 起床\ntake care of 照顾",
                    key=f"batch_phrases_input_{selected_unit}"
                )
                
                btn_add_phrases = st.button("批量添加短语", type="primary", key=f"btn_add_phrases_{selected_unit}")
                
                if btn_add_phrases:
                    if batch_phrases_input.strip():
                        if proofread_api_key:
                            lines = [line.strip() for line in batch_phrases_input.strip().split('\n') if line.strip()]
                            added_count = 0
                            failed_phrases = []
                            
                            progress_bar = st.progress(0)
                            status_text = st.empty()
                            
                            for idx, line in enumerate(lines):
                                status_text.text(f"正在处理: {line} ({idx + 1}/{len(lines)})")
                                
                                parts = line.split(None, 1)
                                if len(parts) >= 2:
                                    phrase = parts[0].strip()
                                    meaning = parts[1].strip() if len(parts) > 1 else ""
                                    
                                    try:
                                        completed_info = complete_word_info(
                                            phrase, meaning,
                                            proofread_api_key, proofread_base_url, proofread_model_name,
                                            b_grade, "phrase"
                                        )
                                        
                                        if completed_info:
                                            meanings_data = completed_info.get("meanings", [])
                                            if not meanings_data or len(meanings_data) == 0:
                                                meanings_data = [{"pos": "", "meaning": meaning, "example": "", "example_zh": ""}]
                                            
                                            new_item = {
                                                "word": phrase,
                                                "phonetic": completed_info.get("phonetic", ""),
                                                "meanings": meanings_data,
                                                "unit": selected_unit,
                                                "type": "phrase",
                                                "book_version": b_version,
                                                "grade": b_grade,
                                                "semester": b_semester,
                                                "phrase_audio": ""
                                            }
                                            word_clean = "".join([c for c in phrase if c.isalpha() or c.isspace() or c == "'"]).strip().replace(" ", "_")
                                            new_item["id"] = get_unique_id(word_clean, selected_unit, b_grade)
                                            
                                            st.session_state.all_extracted_data.append(new_item)
                                            added_count += 1
                                        else:
                                            failed_phrases.append(phrase)
                                    except Exception as e:
                                        failed_phrases.append(phrase)
                                else:
                                    failed_phrases.append(line)
                                
                                progress_bar.progress((idx + 1) / len(lines))
                            
                            status_text.empty()
                            progress_bar.empty()
                            
                            if added_count > 0:
                                st.success(f"成功添加 {added_count} 个短语")
                            if failed_phrases:
                                st.warning(f"添加失败的短语: {', '.join(failed_phrases)}")
                            
                            if added_count > 0:
                                st.rerun()
                        else:
                            st.warning("请先配置校对 API")
                    else:
                        st.warning("请输入短语数据")
        
        st.divider()
        st.subheader("💾 保存数据")
        
        st.info("点击下方按钮将提取的数据保存为 JSONL 文件（未录音版）")
        
        col_save1, col_save2 = st.columns([2, 1])
        with col_save1:
            base_name = st.session_state.get("export_name_tab1", "extracted")
        with col_save2:
            st.write("")
            if st.button("💾 保存为 JSONL（未录音版）", type="primary", use_container_width=True, key="btn_save_jsonl"):
                os.makedirs(DATA_DIR, exist_ok=True)
                
                words_file_path = os.path.join(DATA_DIR, f"{base_name}_单词表_未录音.jsonl")
                phrases_file_path = os.path.join(DATA_DIR, f"{base_name}_短语表_未录音.jsonl")
                
                words_data = [item for item in st.session_state.all_extracted_data 
                             if item.get("type") == "word" and item.get("id") not in st.session_state.items_to_delete]
                phrases_data = [item for item in st.session_state.all_extracted_data 
                               if item.get("type") == "phrase" and item.get("id") not in st.session_state.items_to_delete]
                
                with open(words_file_path, 'w', encoding='utf-8') as f:
                    for entry in words_data:
                        f.write(json.dumps(entry, ensure_ascii=False) + '\n')
                
                with open(phrases_file_path, 'w', encoding='utf-8') as f:
                    for entry in phrases_data:
                        f.write(json.dumps(entry, ensure_ascii=False) + '\n')
                
                st.success(f"保存成功\n- 单词：`{words_file_path}` ({len(words_data)} 个)\n- 短语：`{phrases_file_path}` ({len(phrases_data)} 个)")

with tab2:
    st.info("在此模式下，您可以导入已保存的 JSONL 文件来生成或修复音频。")
    
    col_upload1, col_upload2 = st.columns(2)
    with col_upload1:
        uploaded_words = st.file_uploader("上传单词 JSONL 文件（未录音版）", type=["jsonl"], key="words_uploader")
    with col_upload2:
        uploaded_phrases = st.file_uploader("上传短语 JSONL 文件（未录音版）", type=["jsonl"], key="phrases_uploader")
    
    btn_jsonl = False
    if uploaded_words or uploaded_phrases:
        st.info('📁 输出文件将自动命名为"已录音版"')
        
        if uploaded_words:
            words_filename = uploaded_words.name.replace("未录音", "已录音")
            if words_filename == uploaded_words.name:
                words_filename = uploaded_words.name.replace(".jsonl", "_已录音.jsonl")
            st.write(f"单词输出文件：`{words_filename}`")
        
        if uploaded_phrases:
            phrases_filename = uploaded_phrases.name.replace("未录音", "已录音")
            if phrases_filename == uploaded_phrases.name:
                phrases_filename = uploaded_phrases.name.replace(".jsonl", "_已录音.jsonl")
            st.write(f"短语输出文件：`{phrases_filename}`")
        
        btn_jsonl = st.button("🎵 开始生成音频", type="primary", use_container_width=True, key="btn_jsonl_record")
    
    if btn_jsonl:
        st.session_state.jsonl_audio_data = []
        st.session_state.is_generating_audio = True
        
        main_progress = st.progress(0)
        main_status = st.empty()
        table_placeholder_2 = st.empty()
        
        start_time_2 = time.time()
        os.makedirs(DATA_DIR, exist_ok=True)
        os.makedirs(AUDIO_DIR, exist_ok=True)
        
        all_items = []
        total_lines = 0
        
        main_status.text("📖 正在读取 JSONL 文件...")
        
        if uploaded_words:
            words_lines = uploaded_words.getvalue().decode("utf-8").splitlines()
            total_lines += len(words_lines)
            for line in words_lines:
                if line.strip():
                    item = json.loads(line)
                    item["_source_type"] = "word"
                    all_items.append(item)
        
        if uploaded_phrases:
            phrases_lines = uploaded_phrases.getvalue().decode("utf-8").splitlines()
            total_lines += len(phrases_lines)
            for line in phrases_lines:
                if line.strip():
                    item = json.loads(line)
                    item["_source_type"] = "phrase"
                    all_items.append(item)
        
        audio_tasks = []
        audio_task_map = {}
        parsed_items = []
        skipped_count = 0
        
        words_save_path = os.path.join(DATA_DIR, words_filename if uploaded_words else "words_已录音.jsonl")
        phrases_save_path = os.path.join(DATA_DIR, phrases_filename if uploaded_phrases else "phrases_已录音.jsonl")
        
        existing_words_ids = set()
        existing_phrases_ids = set()
        
        if os.path.exists(words_save_path):
            try:
                with open(words_save_path, 'r', encoding='utf-8') as f:
                    for line in f:
                        if line.strip():
                            item = json.loads(line)
                            existing_words_ids.add(item.get("id"))
            except:
                pass
        
        if os.path.exists(phrases_save_path):
            try:
                with open(phrases_save_path, 'r', encoding='utf-8') as f:
                    for line in f:
                        if line.strip():
                            item = json.loads(line)
                            existing_phrases_ids.add(item.get("id"))
            except:
                pass
        
        main_status.text("📋 正在处理音频任务...")
        
        success_total = 0
        fail_total = 0
        skipped_total = 0
        already_processed = 0
        
        for i, item in enumerate(all_items):
            word = item.get("word", "")
            source_type = item.get("_source_type", "word")
            item_type = item.get("type", "word")
            
            if not word:
                continue
            
            word_clean = "".join([c for c in word if c.isalpha() or c.isspace() or c == "'"]).strip().replace(" ", "_")
            uid = item.get("id", get_unique_id(word_clean, item.get("unit", "unk"), item.get("grade", "unk")))
            item["id"] = uid
            
            existing_ids = existing_words_ids if item_type == "word" else existing_phrases_ids
            save_path = words_save_path if item_type == "word" else phrases_save_path
            
            if uid in existing_ids:
                already_processed += 1
                main_progress.progress((i + 1) / len(all_items))
                main_status.text(f"📋 处理进度: {i + 1}/{len(all_items)} (已跳过已处理: {already_processed})")
                continue
            
            audio_tasks_for_item = []
            
            if source_type == "word":
                word_audio_filename = f"{uid}_{word_clean}.mp3"
                word_audio_path = os.path.join(AUDIO_DIR, word_audio_filename)
                
                if os.path.exists(word_audio_path) and os.path.getsize(word_audio_path) > 0:
                    item["word_audio"] = f"./audio/{word_audio_filename}"
                    skipped_total += 1
                else:
                    audio_tasks_for_item.append((word, word_audio_path))
                    item["word_audio"] = f"./audio/{word_audio_filename}"
            else:
                phrase_audio_filename = f"{uid}_{word_clean}.mp3"
                phrase_audio_path = os.path.join(AUDIO_DIR, phrase_audio_filename)
                
                if os.path.exists(phrase_audio_path) and os.path.getsize(phrase_audio_path) > 0:
                    item["phrase_audio"] = f"./audio/{phrase_audio_filename}"
                    skipped_total += 1
                else:
                    audio_tasks_for_item.append((word, phrase_audio_path))
                    item["phrase_audio"] = f"./audio/{phrase_audio_filename}"
            
            meanings = item.get("meanings", [])
            if meanings:
                for meaning_idx, m in enumerate(meanings):
                    example = m.get("example", "")
                    if example:
                        ex_audio_filename = f"{uid}_{word_clean}_ex_{meaning_idx}.mp3"
                        ex_audio_path = os.path.join(AUDIO_DIR, ex_audio_filename)
                        
                        if os.path.exists(ex_audio_path) and os.path.getsize(ex_audio_path) > 0:
                            m["example_audio"] = f"./audio/{ex_audio_filename}"
                            skipped_total += 1
                        else:
                            audio_tasks_for_item.append((example, ex_audio_path))
                            m["example_audio"] = f"./audio/{ex_audio_filename}"
            
            del item["_source_type"]
            
            if audio_tasks_for_item:
                main_status.text(f"🎵 正在生成音频: {word[:20]}...")
                s, f = generate_audios_in_batch(audio_tasks_for_item, None, None)
                success_total += s
                fail_total += f
            
            append_to_jsonl(save_path, item)
            
            main_progress.progress((i + 1) / len(all_items))
            main_status.text(f"� 处理进度: {i + 1}/{len(all_items)} | 新生成: {success_total}, 跳过已存在: {skipped_total}, 已处理: {already_processed}")
        
        st.session_state.jsonl_audio_data = []
        
        main_status.success(f"✅ 处理完成！新生成: {success_total}, 跳过已存在音频: {skipped_total}, 已处理过: {already_processed}, 失败: {fail_total}")
        
        elapsed = int(time.time() - start_time_2)
        st.session_state.task_duration = f"{elapsed}秒"
        
        main_progress.empty()
        st.session_state.is_generating_audio = False
        st.rerun()

if not st.session_state.is_generating_audio and st.session_state.jsonl_audio_data:
    st.success(f"🎉 音频生成完成！耗时：**{st.session_state.task_duration}**")
    st.balloons()
    
    st.subheader("📊 音频结果")
    
    display_items = []
    for item in st.session_state.jsonl_audio_data:
        flat = flatten_meanings_for_display(item)
        if item.get("type") == "word":
            flat["word_audio"] = item.get("word_audio", "")
        else:
            flat["word_audio"] = item.get("phrase_audio", "")
        meanings = item.get("meanings", [])
        if meanings:
            flat["example_audio"] = meanings[0].get("example_audio", "") if meanings else ""
        display_items.append(flat)
    
    st.markdown(generate_html_table(display_items), unsafe_allow_html=True)
    
    st.divider()
    st.subheader("🔧 音频修复工具")
    
    def check_audio_status(audio_path):
        if not audio_path:
            return "missing"
        full_path = audio_path.replace("./audio/", f"{AUDIO_DIR}/").replace("./", f"{AUDIO_DIR}/")
        if not os.path.exists(full_path):
            return "missing"
        if os.path.getsize(full_path) == 0:
            return "empty"
        return "ok"
    
    damaged_items = []
    for item in st.session_state.jsonl_audio_data:
        item_type = item.get("type", "word")
        word = item.get("word", "")
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
        else:
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
        st.dataframe(damaged_df[["word", "type", "audio_type", "status"]], use_container_width=True)
        
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
                        full_path = audio_path.replace("./audio/", f"{AUDIO_DIR}/").replace("./", f"{AUDIO_DIR}/")
                        repair_tasks.append((text, full_path))
                
                if repair_tasks:
                    repair_progress = st.progress(0)
                    repair_status = st.empty()
                    success, fail = generate_audios_in_batch(repair_tasks, repair_progress, repair_status)
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
                        full_path = audio_path.replace("./audio/", f"{AUDIO_DIR}/").replace("./", f"{AUDIO_DIR}/")
                        repair_tasks.append((text, full_path))
                
                if repair_tasks:
                    repair_progress = st.progress(0)
                    repair_status = st.empty()
                    success, fail = generate_audios_in_batch(repair_tasks, repair_progress, repair_status)
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
                    for line in words_jsonl_file.getvalue().decode("utf-8").splitlines():
                        if line.strip():
                            item = json.loads(line)
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
                    for line in phrases_jsonl_file.getvalue().decode("utf-8").splitlines():
                        if line.strip():
                            item = json.loads(line)
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
        if not extract_api_key:
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
                for idx, pno in enumerate(pages):
                    status.info(f"正在提取目录页：{pno} ({idx + 1}/{len(pages)})")
                    b64_img = pdf_page_to_base64_cached(doc, pno)
                    page_items = extract_unit_meta_from_page(
                        b64_img,
                        pno,
                        extract_api_key,
                        extract_base_url,
                        extract_model_name
                    )
                    all_items.extend(page_items)
                    progress.progress((idx + 1) / len(pages))

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
    st.header("课文提取（按单元 Section A/B 页码）")
    st.info("导入教材后，按单元填写 Section A 与 Section B 页码（支持 12 或 12-13,15），系统会自动对齐到对应 Unit。")

    if "passage_results" not in st.session_state:
        st.session_state.passage_results = []
    if "passage_source_pdf" not in st.session_state:
        st.session_state.passage_source_pdf = ""

    source_mode_p = st.radio(
        "PDF 来源",
        ["待处理教材目录", "手动上传 PDF"],
        horizontal=True,
        key="passage_source_mode"
    )

    selected_pdf_bytes_p = None
    selected_pdf_name_p = ""

    if source_mode_p == "待处理教材目录":
        if os.path.isdir(TARGET_TEXTBOOK_DIR):
            pdf_files_p = sorted([f for f in os.listdir(TARGET_TEXTBOOK_DIR) if f.lower().endswith(".pdf")])
            if pdf_files_p:
                picked_p = st.selectbox("选择教材文件", pdf_files_p, key="passage_pdf_picker")
                selected_pdf_name_p = picked_p
                picked_path_p = os.path.join(TARGET_TEXTBOOK_DIR, picked_p)
                with open(picked_path_p, "rb") as rf:
                    selected_pdf_bytes_p = rf.read()
                st.caption(f"来源目录：{TARGET_TEXTBOOK_DIR}")
            else:
                st.warning(f"目录中没有 PDF：{TARGET_TEXTBOOK_DIR}")
        else:
            st.warning(f"目录不存在或不可访问：{TARGET_TEXTBOOK_DIR}")
    else:
        uploaded_p = st.file_uploader("上传教材 PDF", type=["pdf"], key="passage_uploader")
        if uploaded_p is not None:
            selected_pdf_name_p = uploaded_p.name
            selected_pdf_bytes_p = uploaded_p.getvalue()

    meta_col_p1, meta_col_p2, meta_col_p3 = st.columns(3)
    with meta_col_p1:
        passage_book_version = st.text_input("教材版本", value="", key="passage_book_version")
    with meta_col_p2:
        passage_grade = st.text_input("年级", value="", key="passage_grade")
    with meta_col_p3:
        passage_semester = st.text_input("学期", value="", key="passage_semester")

    unit_count = st.number_input("单元数量", min_value=1, max_value=30, value=8, step=1, key="passage_unit_count")

    st.markdown("### 页码配置")
    for i in range(1, int(unit_count) + 1):
        col_a, col_b = st.columns(2)
        with col_a:
            st.text_input(f"Unit {i} Section A 页码", value="", key=f"passage_unit_{i}_A")
        with col_b:
            st.text_input(f"Unit {i} Section B 页码", value="", key=f"passage_unit_{i}_B")

    if st.button("开始提取课文", type="primary", key="btn_extract_passages"):
        if not extract_api_key:
            st.error("请先在左侧填写提取 API Key。")
        elif not selected_pdf_bytes_p:
            st.error("请先选择或上传教材 PDF。")
        else:
            doc_p = PDFCache.get_doc(selected_pdf_bytes_p)
            total_pages_p = len(doc_p)

            tasks = []
            for i in range(1, int(unit_count) + 1):
                for sec in ["A", "B"]:
                    raw_range = st.session_state.get(f"passage_unit_{i}_{sec}", "")
                    pages = parse_page_range_input(raw_range, 1, total_pages_p)
                    if pages:
                        tasks.append({
                            "unit": f"Unit {i}",
                            "section": sec,
                            "passage_type": "dialogue" if sec == "A" else "reading",
                            "pages": pages,
                        })

            if not tasks:
                st.error("请至少填写一个单元的页码。")
            else:
                progress_p = st.progress(0)
                status_p = st.empty()
                results = []

                for idx, task in enumerate(tasks):
                    unit_label = task["unit"]
                    sec_label = task["section"]
                    pages = task["pages"]
                    status_p.info(f"正在提取 {unit_label} Section {sec_label}，页码 {pages}")

                    title = ""
                    text_chunks = []
                    for pno in pages:
                        b64_img = pdf_page_to_base64_cached(doc_p, pno)
                        page_data = extract_passage_from_page(
                            b64_img,
                            extract_api_key,
                            extract_base_url,
                            extract_model_name,
                            unit_label,
                            sec_label,
                        )
                        if (not title) and page_data.get("title"):
                            title = page_data.get("title", "")
                        if page_data.get("passage_text"):
                            text_chunks.append(page_data.get("passage_text", ""))

                    merged_text = "\n\n".join([c for c in text_chunks if c.strip()]).strip()
                    results.append({
                        "unit": unit_label,
                        "section": sec_label,
                        "passage_type": task["passage_type"],
                        "title": title,
                        "passage_text": merged_text,
                        "source_pages": pages,
                    })
                    progress_p.progress((idx + 1) / len(tasks))

                st.session_state.passage_results = results
                st.session_state.passage_source_pdf = selected_pdf_name_p
                status_p.success(f"提取完成：共生成 {len(results)} 条课文记录。")

    if st.session_state.passage_results:
        st.subheader("提取结果（可编辑）")
        display_rows = []
        for r in st.session_state.passage_results:
            row = dict(r)
            row["source_pages"] = ",".join([str(p) for p in r.get("source_pages", [])])
            display_rows.append(row)

        df_passages = pd.DataFrame(display_rows)
        edited_passages_df = st.data_editor(
            df_passages,
            use_container_width=True,
            num_rows="dynamic",
            key="passage_editor",
            hide_index=True
        )

        default_name_p = "passages.jsonl"
        if st.session_state.passage_source_pdf:
            stem_p = os.path.splitext(st.session_state.passage_source_pdf)[0]
            default_name_p = f"{stem_p}_passages.jsonl"
        save_name_p = st.text_input("保存文件名", value=default_name_p, key="passage_save_name")

        if st.button("保存课文到 structure_data", key="btn_save_passages"):
            os.makedirs(STRUCTURE_DIR, exist_ok=True)
            save_path_p = os.path.join(STRUCTURE_DIR, save_name_p)
            records_p = edited_passages_df.to_dict(orient="records")
            with open(save_path_p, "w", encoding="utf-8") as wf:
                for rec in records_p:
                    raw_pages = str(rec.get("source_pages", "") or "").strip()
                    pages = [int(x.strip()) for x in raw_pages.split(",") if x.strip().isdigit()]
                    out = {
                        "unit": (rec.get("unit", "") or "").strip(),
                        "section": (rec.get("section", "") or "").strip().upper(),
                        "passage_type": (rec.get("passage_type", "") or "").strip(),
                        "title": (rec.get("title", "") or "").strip(),
                        "passage_text": (rec.get("passage_text", "") or "").strip(),
                        "source_pages": pages,
                        "book_version": (passage_book_version or "").strip(),
                        "grade": (passage_grade or "").strip(),
                        "semester": (passage_semester or "").strip(),
                    }
                    wf.write(json.dumps(out, ensure_ascii=False) + "\n")
            st.success(f"已保存：{save_path_p}")
