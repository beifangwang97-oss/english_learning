import argparse
import base64
import hashlib
import json
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

import fitz
from openai import OpenAI


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_INPUT_DIR = os.path.join(BASE_DIR, "小学各年级试卷")
DEFAULT_OUTPUT_DIR = os.path.join(BASE_DIR, "exam_data")
DEFAULT_OCR_CACHE_DIR = os.path.join(BASE_DIR, "runs", "mode7_primary_pdf_cache")
PARSER_VERSION = "mode7_primary_pdf_v1"
DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_MODEL = "qwen/qwen3-vl-32b-instruct"
PROJECT_ROOT = os.path.dirname(BASE_DIR)
DEFAULT_ENV_PATHS = [
    os.path.join(PROJECT_ROOT, ".env"),
    os.path.join(BASE_DIR, ".env"),
]


def ensure_dirs() -> None:
    os.makedirs(DEFAULT_OUTPUT_DIR, exist_ok=True)
    os.makedirs(DEFAULT_OCR_CACHE_DIR, exist_ok=True)


def sanitize_text(value: Any) -> str:
    return str(value or "").strip()


def sanitize_filename(text: str) -> str:
    safe = re.sub(r'[\\/:*?"<>|]+', "_", sanitize_text(text))
    safe = re.sub(r"\s+", "", safe)
    return safe or "unknown"


def normalize_multiline_text(text: str) -> str:
    value = str(text or "").replace("\r\n", "\n").replace("\r", "\n")
    value = value.replace("\u3000", " ")
    value = re.sub(r"[ \t]+", " ", value)
    lines = [line.strip() for line in value.split("\n")]
    while lines and not lines[0]:
        lines.pop(0)
    while lines and not lines[-1]:
        lines.pop()
    joined = "\n".join(lines)
    joined = re.sub(r"\n{3,}", "\n\n", joined)
    return joined.strip()


def compact_line(text: str) -> str:
    return re.sub(r"\s+", " ", sanitize_text(text))


def iso_now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S")


def task_timestamp() -> str:
    return time.strftime("%Y%m%d_%H%M%S")


def make_short_id(seed: str) -> str:
    return hashlib.md5(seed.encode("utf-8")).hexdigest()[:12]


def load_env_file() -> Optional[str]:
    for path in DEFAULT_ENV_PATHS:
        if not os.path.isfile(path):
            continue
        with open(path, "r", encoding="utf-8") as rf:
            for raw_line in rf:
                line = raw_line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                env_key = key.strip()
                env_value = value.strip().strip('"').strip("'")
                if env_key and env_key not in os.environ:
                    os.environ[env_key] = env_value
        return path
    return None


def discover_api_keys(cli_api_key: str = "") -> List[str]:
    keys: List[str] = []
    explicit = sanitize_text(cli_api_key)
    if explicit:
        keys.append(explicit)
    primary = sanitize_text(os.environ.get("MODE7_PRIMARY_PDF_API_KEY", ""))
    if primary and primary not in keys:
        keys.append(primary)
    combined = sanitize_text(os.environ.get("MODE7_PRIMARY_PDF_API_KEYS", ""))
    if combined:
        for item in combined.split(","):
            key = sanitize_text(item)
            if key and key not in keys:
                keys.append(key)
    indexed: List[Tuple[int, str]] = []
    for env_key, env_value in os.environ.items():
        match = re.fullmatch(r"MODE7_PRIMARY_PDF_API_KEY_(\d+)", env_key)
        if not match:
            continue
        key = sanitize_text(env_value)
        if key:
            indexed.append((int(match.group(1)), key))
    for _, key in sorted(indexed, key=lambda item: item[0]):
        if key not in keys:
            keys.append(key)
    return keys


def build_ocr_cache_key(path: str, page_no: int, api_settings: Optional[Dict[str, Any]] = None) -> str:
    normalized_path = os.path.abspath(path)
    try:
        stat = os.stat(normalized_path)
        mtime = int(stat.st_mtime)
        size = int(stat.st_size)
    except OSError:
        mtime = 0
        size = 0
    model = sanitize_text((api_settings or {}).get("model", "")) or DEFAULT_MODEL
    seed = f"{normalized_path}|{mtime}|{size}|{page_no}|{model}"
    return hashlib.md5(seed.encode("utf-8")).hexdigest()


def get_ocr_cache_path(path: str, page_no: int, api_settings: Optional[Dict[str, Any]] = None) -> str:
    cache_dir = sanitize_text((api_settings or {}).get("ocr_cache_dir", "")) or DEFAULT_OCR_CACHE_DIR
    return os.path.join(cache_dir, f"{build_ocr_cache_key(path, page_no, api_settings)}.txt")


def read_ocr_cache(path: str, page_no: int, api_settings: Optional[Dict[str, Any]] = None) -> str:
    cache_path = get_ocr_cache_path(path, page_no, api_settings)
    if not os.path.isfile(cache_path):
        return ""
    try:
        with open(cache_path, "r", encoding="utf-8") as rf:
            return normalize_multiline_text(rf.read())
    except OSError:
        return ""


def write_ocr_cache(path: str, page_no: int, text: str, api_settings: Optional[Dict[str, Any]] = None) -> None:
    normalized = normalize_multiline_text(text)
    if not normalized:
        return
    cache_path = get_ocr_cache_path(path, page_no, api_settings)
    os.makedirs(os.path.dirname(cache_path), exist_ok=True)
    try:
        with open(cache_path, "w", encoding="utf-8") as wf:
            wf.write(normalized)
    except OSError:
        return


def discover_pdf_files(input_dir: str) -> List[str]:
    if not os.path.isdir(input_dir):
        return []
    files: List[str] = []
    for root, _, names in os.walk(input_dir):
        for name in names:
            if name.lower().endswith(".pdf") and not name.startswith("~$"):
                files.append(os.path.join(root, name))
    return sorted(files)


def chinese_number_to_int(text: str) -> int:
    mapping = {
        "\u4e00": 1,
        "\u4e8c": 2,
        "\u4e09": 3,
        "\u56db": 4,
        "\u4e94": 5,
        "\u516d": 6,
        "\u4e03": 7,
        "\u516b": 8,
        "\u4e5d": 9,
        "\u5341": 10,
        "\u5341\u4e00": 11,
        "\u5341\u4e8c": 12,
    }
    return mapping.get(text.strip(), 0)


def parse_meta_from_path(path: str) -> Dict[str, str]:
    parts = os.path.normpath(path).split(os.sep)
    filename = os.path.basename(path)
    grade = ""
    semester = ""
    book_version = ""
    grade_pattern = re.compile(r"([\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d])\u5e74\u7ea7")
    semester_pattern = re.compile(r"([\u4e0a\u4e0b\u5168])\u518c")
    version_aliases = [
        ("\u65e7\u4eba\u6559\u7248\uff08PEP\uff09\u5c0f\u5b66", "\u65e7\u4eba\u6559\u7248\uff08PEP\uff09\u5c0f\u5b66"),
        ("\u4eba\u6559\u7248\uff08PEP\uff09\u5c0f\u5b66", "\u4eba\u6559\u7248\uff08PEP\uff09\u5c0f\u5b66"),
        ("\u65e7\u4eba\u6559\u7248\u521d\u4e2d", "\u65e7\u4eba\u6559\u7248\u521d\u4e2d"),
        ("\u4eba\u6559\u7248\u521d\u4e2d", "\u4eba\u6559\u7248\u521d\u4e2d"),
    ]
    for part in parts:
        normalized = compact_line(part)
        if not grade:
            grade_match = grade_pattern.search(normalized)
            if grade_match:
                grade = f"{grade_match.group(1)}\u5e74\u7ea7"
        if not semester:
            semester_match = semester_pattern.search(normalized)
            if semester_match:
                semester = f"{semester_match.group(1)}\u518c"
        if not book_version:
            for alias, canonical in version_aliases:
                if alias in normalized:
                    book_version = canonical
                    break
    unit = ""
    unit_match = re.search(r"U\s*([1-9]\d?)", filename, flags=re.I)
    if unit_match:
        unit = f"Unit {unit_match.group(1)}"
    else:
        unit_match = re.search(
            r"\u7b2c([\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341]+)\u5355\u5143",
            filename,
        )
        if unit_match:
            unit_no = chinese_number_to_int(unit_match.group(1))
            if unit_no:
                unit = f"Unit {unit_no}"
    if not book_version:
        if re.search(r"\bPEP\b", filename, flags=re.I):
            book_version = "\u4eba\u6559\u7248\uff08PEP\uff09\u5c0f\u5b66"
        elif re.search(r"\bRJ\b", filename, flags=re.I):
            book_version = "\u4eba\u6559\u7248RJ"
        elif grade:
            book_version = "\u5c0f\u5b66\u82f1\u8bed"
    return {
        "book_version": book_version,
        "grade": grade,
        "semester": semester,
        "unit": unit,
        "source_file": filename,
    }


@dataclass
class PageBlock:
    page_no: int
    x0: float
    y0: float
    x1: float
    y1: float
    text: str


@dataclass
class Section:
    question_no: int
    heading: str
    page_no: int
    lines: List[str]


def extract_page_blocks(path: str) -> Tuple[List[PageBlock], List[Dict[str, Any]]]:
    doc = fitz.open(path)
    blocks: List[PageBlock] = []
    page_stats: List[Dict[str, Any]] = []
    for page_index, page in enumerate(doc):
        page_no = page_index + 1
        raw_blocks = page.get_text("blocks")
        usable_count = 0
        for block in raw_blocks:
            x0, y0, x1, y1, text = block[:5]
            normalized = normalize_multiline_text(text)
            if not normalized:
                continue
            usable_count += 1
            blocks.append(PageBlock(page_no=page_no, x0=x0, y0=y0, x1=x1, y1=y1, text=normalized))
        page_stats.append({
            "page_no": page_no,
            "width": round(float(page.rect.width), 2),
            "height": round(float(page.rect.height), 2),
            "text_block_count": usable_count,
            "needs_ocr": usable_count == 0,
        })
    doc.close()
    blocks.sort(key=lambda item: (item.page_no, item.y0, item.x0))
    return blocks, page_stats


def page_to_png_base64(page: fitz.Page, clip: Optional[fitz.Rect] = None) -> str:
    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False, clip=clip)
    return base64.b64encode(pix.tobytes("png")).decode("ascii")


def ocr_image_base64_with_vision(image_b64: str, api_settings: Dict[str, Any]) -> str:
    api_key = sanitize_text(api_settings.get("api_key", ""))
    if not api_key:
        return ""
    client = OpenAI(
        api_key=api_key,
        base_url=sanitize_text(api_settings.get("base_url", "")) or DEFAULT_BASE_URL,
    )
    prompt = (
        "You are transcribing a scanned primary-school English exam page. "
        "Return plain UTF-8 text only. Preserve the original reading order and line breaks as much as possible. "
        "Keep question numbers, option letters, punctuation, Chinese text, English text, and table text. "
        "Do not explain, summarize, translate, answer questions, or infer missing content. "
        "If some text is unreadable, leave it out rather than guessing."
    )
    response = client.chat.completions.create(
        model=sanitize_text(api_settings.get("model", "")) or DEFAULT_MODEL,
        temperature=0,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image_b64}"}},
                ],
            }
        ],
    )
    return normalize_multiline_text(response.choices[0].message.content if response.choices else "")


def ocr_page_with_vision(page: fitz.Page, api_settings: Dict[str, Any]) -> str:
    return ocr_image_base64_with_vision(page_to_png_base64(page), api_settings)

def ocr_page_regions_with_vision(page: fitz.Page, api_settings: Dict[str, Any], regions: List[Tuple[float, float]]) -> str:
    texts: List[str] = []
    height = float(page.rect.height)
    for top_ratio, bottom_ratio in regions:
        top = max(0.0, min(1.0, top_ratio))
        bottom = max(top, min(1.0, bottom_ratio))
        clip = fitz.Rect(page.rect.x0, page.rect.y0 + height * top, page.rect.x1, page.rect.y0 + height * bottom)
        text = ocr_image_base64_with_vision(page_to_png_base64(page, clip=clip), api_settings)
        if text:
            texts.append(text)
    return normalize_multiline_text("\n".join(texts))




def build_ocr_worker_settings(api_settings: Optional[Dict[str, Any]], worker_index: int) -> Dict[str, Any]:
    settings = dict(api_settings or {})
    api_keys = [sanitize_text(item) for item in settings.get("api_keys", []) if sanitize_text(item)]
    if api_keys:
        settings["api_key"] = api_keys[worker_index % len(api_keys)]
    return settings


def extract_page_blocks_with_optional_ocr(path: str, api_settings: Optional[Dict[str, str]] = None) -> Tuple[List[PageBlock], List[Dict[str, Any]]]:
    doc = fitz.open(path)
    blocks: List[PageBlock] = []
    page_stats: List[Dict[str, Any]] = []
    ocr_jobs: List[Dict[str, Any]] = []
    for page_index, page in enumerate(doc):
        page_no = page_index + 1
        raw_blocks = page.get_text("blocks")
        usable_count = 0
        for block in raw_blocks:
            x0, y0, x1, y1, text = block[:5]
            normalized = normalize_multiline_text(text)
            if not normalized:
                continue
            usable_count += 1
            blocks.append(PageBlock(page_no=page_no, x0=x0, y0=y0, x1=x1, y1=y1, text=normalized))
        page_stat = {
            "page_no": page_no,
            "width": round(float(page.rect.width), 2),
            "height": round(float(page.rect.height), 2),
            "text_block_count": usable_count,
            "needs_ocr": usable_count == 0,
            "text_source": "text_layer" if usable_count > 0 else "none",
        }
        if usable_count == 0 and api_settings:
            cached_text = read_ocr_cache(path, page_no, api_settings)
            if cached_text:
                blocks.append(PageBlock(page_no=page_no, x0=0, y0=0, x1=float(page.rect.width), y1=float(page.rect.height), text=cached_text))
                page_stat["text_source"] = "vision_ocr_cache"
                page_stats.append(page_stat)
                continue
            api_keys = [sanitize_text(item) for item in api_settings.get("api_keys", []) if sanitize_text(item)]
            fallback_key = sanitize_text(api_settings.get("api_key", ""))
            if api_keys or fallback_key:
                ocr_jobs.append({
                    "page_no": page_no,
                    "width": float(page.rect.width),
                    "height": float(page.rect.height),
                    "image_b64": page_to_png_base64(page),
                })
        page_stats.append(page_stat)
    doc.close()
    if ocr_jobs:
        key_count = len([sanitize_text(item) for item in (api_settings or {}).get("api_keys", []) if sanitize_text(item)])
        fallback_key = sanitize_text((api_settings or {}).get("api_key", ""))
        worker_count = int((api_settings or {}).get("max_workers", 0) or 0)
        if worker_count <= 0:
            worker_count = key_count or (1 if fallback_key else 0)
        worker_count = max(1, min(worker_count, len(ocr_jobs)))
        future_map = {}
        ocr_results: Dict[int, str] = {}
        with ThreadPoolExecutor(max_workers=worker_count) as executor:
            for job_index, job in enumerate(ocr_jobs):
                worker_settings = build_ocr_worker_settings(api_settings, job_index)
                future = executor.submit(ocr_image_base64_with_vision, job["image_b64"], worker_settings)
                future_map[future] = job
            for future in as_completed(future_map):
                job = future_map[future]
                page_no = int(job["page_no"])
                try:
                    ocr_results[page_no] = future.result()
                except Exception:
                    ocr_results[page_no] = ""
        page_stat_map = {int(item["page_no"]): item for item in page_stats}
        for job in ocr_jobs:
            page_no = int(job["page_no"])
            ocr_text = normalize_multiline_text(ocr_results.get(page_no, ""))
            if ocr_text:
                write_ocr_cache(path, page_no, ocr_text, api_settings)
                blocks.append(PageBlock(page_no=page_no, x0=0, y0=0, x1=float(job["width"]), y1=float(job["height"]), text=ocr_text))
                page_stat_map[page_no]["text_source"] = "vision_ocr"
    blocks.sort(key=lambda item: (item.page_no, item.y0, item.x0))
    return blocks, page_stats


def extract_single_page_text(path: str, page_no: int, api_settings: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    doc = fitz.open(path)
    if page_no < 1 or page_no > len(doc):
        doc.close()
        raise ValueError(f"page_no out of range: {page_no}")
    page = doc[page_no - 1]
    raw_blocks = page.get_text("blocks")
    text_blocks: List[str] = []
    for block in raw_blocks:
        normalized = normalize_multiline_text(block[4])
        if normalized:
            text_blocks.append(normalized)
    text_source = "text_layer" if text_blocks else "none"
    page_text = normalize_multiline_text("\n".join(text_blocks))
    if not page_text and api_settings:
        cached_text = read_ocr_cache(path, page_no, api_settings)
        if cached_text:
            page_text = cached_text
            text_source = "vision_ocr_cache"
        elif sanitize_text(api_settings.get("api_key", "")):
            page_text = ocr_page_with_vision(page, api_settings)
            if page_text:
                write_ocr_cache(path, page_no, page_text, api_settings)
                text_source = "vision_ocr"
    result = {
        "source_file": os.path.basename(path),
        "page_no": page_no,
        "page_count": len(doc),
        "width": round(float(page.rect.width), 2),
        "height": round(float(page.rect.height), 2),
        "text_source": text_source,
        "text": page_text,
    }
    doc.close()
    return result


def blocks_to_lines(blocks: List[PageBlock]) -> List[Tuple[int, str]]:
    lines: List[Tuple[int, str]] = []
    for block in blocks:
        for line in block.text.split("\n"):
            normalized = compact_line(line)
            if normalized:
                lines.append((block.page_no, normalized))
    return lines


def build_page_text_preview(blocks: List[PageBlock], max_chars: int = 400) -> Dict[int, str]:
    page_map: Dict[int, List[str]] = {}
    for block in blocks:
        page_map.setdefault(block.page_no, []).append(block.text)
    preview: Dict[int, str] = {}
    for page_no, parts in page_map.items():
        merged = normalize_multiline_text("\n".join(parts))
        preview[page_no] = merged[:max_chars]
    return preview
def find_answer_start_index(lines: List[Tuple[int, str]], meta: Dict[str, str]) -> int:
    answer_heading_pattern = re.compile(
        r"^(参考答案|答案|听力原文及参考答案|听力原文|听力材料)(?:[:：\s]|$)"
    )
    answer_start = next(
        (
            idx
            for idx, (_, line) in enumerate(lines)
            if answer_heading_pattern.match(compact_line(line))
            or re.match(r"^[一二三四五六七八九十]+、\s*\d{1,2}\s*[—\-]\s*\d{1,2}", compact_line(line))
        ),
        -1,
    )
    current_unit = compact_line(meta.get("unit", ""))
    if answer_start == -1 and current_unit:
        unit_hits = [idx for idx, (_, line) in enumerate(lines) if current_unit in compact_line(line)]
        if len(unit_hits) >= 2:
            answer_start = unit_hits[-1]
    return answer_start


def extract_answer_lines_from_start(lines: List[Tuple[int, str]], start_index: int, meta: Dict[str, str]) -> List[str]:
    if start_index == -1:
        return []
    answer_lines = [compact_line(line) for _, line in lines[start_index:] if compact_line(line)]
    current_unit = compact_line(meta.get("unit", ""))
    if current_unit:
        unit_start = next((idx for idx, line in enumerate(answer_lines) if current_unit in line), -1)
        if unit_start != -1:
            answer_lines = answer_lines[unit_start:]
        next_unit_index = next(
            (
                idx
                for idx, line in enumerate(answer_lines[1:], start=1)
                if re.search(r"\bUnit\s+\d+\b", line) and current_unit not in line
            ),
            -1,
        )
        if next_unit_index != -1:
            answer_lines = answer_lines[:next_unit_index]
    return answer_lines



def extract_answer_lines(lines: List[Tuple[int, str]], meta: Dict[str, str]) -> List[str]:
    return extract_answer_lines_from_start(lines, find_answer_start_index(lines, meta), meta)


SECTION_ANSWER_RE = re.compile(
    r"^([一二三四五六七八九十]{1,3})[、.．：:]?\s*(.*)$"
)


def parse_answer_sections(answer_lines: List[str]) -> Dict[int, List[str]]:
    sections: Dict[int, List[str]] = {}
    current_no = 0
    marker_pattern = re.compile(r"([一二三四五六七八九十]{1,3})[、.．：:]")
    for raw_line in answer_lines:
        line = compact_line(raw_line)
        if not line:
            continue
        matches = list(marker_pattern.finditer(line))
        if matches:
            for idx, match in enumerate(matches):
                section_no = chinese_number_to_int(match.group(1))
                if section_no <= 0:
                    continue
                start_pos = match.end()
                end_pos = matches[idx + 1].start() if idx + 1 < len(matches) else len(line)
                segment = compact_line(line[start_pos:end_pos])
                sections[section_no] = [segment] if segment else []
                current_no = section_no
            continue
        match = SECTION_ANSWER_RE.match(line)
        if match:
            current_no = chinese_number_to_int(match.group(1))
            if current_no <= 0:
                current_no = 0
                continue
            first_line = compact_line(match.group(2))
            sections[current_no] = [first_line] if first_line else []
            continue
        if current_no:
            sections.setdefault(current_no, []).append(line)
    return sections


def parse_single_answer_map(lines: List[str]) -> Dict[int, str]:
    text = " ".join(lines)
    result: Dict[int, str] = {}
    for match in re.finditer(r"(\d{1,2})\s*[.、\-—]\s*([A-G])\b", text):
        result[int(match.group(1))] = match.group(2)
    if result:
        return result
    compact_match = re.search(r"(\d{1,2})\s*[—\-]\s*(\d{1,2})\s*([A-G]{2,})", text)
    if compact_match:
        start_no = int(compact_match.group(1))
        end_no = int(compact_match.group(2))
        values = list(compact_match.group(3))
        if end_no >= start_no and len(values) >= (end_no - start_no + 1):
            return {
                question_no: values[question_no - start_no]
                for question_no in range(start_no, end_no + 1)
            }
    linear_tokens = re.findall(r"\b([A-G])\b", text)
    if linear_tokens:
        return {idx: value for idx, value in enumerate(linear_tokens, start=1)}
    return result



def parse_boolean_answer_map(lines: List[str]) -> Dict[int, bool]:
    text = " ".join(lines)
    result: Dict[int, bool] = {}
    for match in re.finditer(r"(\d{1,2})\s*[.、\-—]\s*([TFYN√×])\b", text, flags=re.I):
        token = match.group(2).upper()
        result[int(match.group(1))] = token in {"T", "Y", "√"}
    return result



def parse_intonation_answer_map(lines: List[str]) -> Dict[int, str]:
    text = " ".join(lines)
    result: Dict[int, str] = {}
    for match in re.finditer(r"(\d{1,2})\s*[.、\-—]\s*([↑↓])", text):
        result[int(match.group(1))] = match.group(2)
    return result



def parse_text_answer_map(lines: List[str]) -> Dict[int, str]:
    result: Dict[int, str] = {}
    text = " ".join(compact_line(line) for line in lines if compact_line(line))
    for match in re.finditer(r"(\d{1,2})\s*[.、]\s*(.+?)(?=(?:\s+\d{1,2}\s*[.、]\s*)|$)", text):
        result[int(match.group(1))] = compact_line(match.group(2))
    if result:
        return result
    numbered = parse_numbered_items(lines)
    if numbered:
        for idx, body in numbered:
            result[idx] = compact_line(body)
    return result



def parse_compound_answer_map(lines: List[str]) -> Dict[int, str]:
    result: Dict[int, str] = {}
    text = " ".join(compact_line(line) for line in lines if compact_line(line))
    for match in re.finditer(r"(\d{1,2})\s*[.、]\s*(.+?)(?=(?:\s+\d{1,2}\s*[.、]\s*)|$)", text):
        result[int(match.group(1))] = compact_line(match.group(2))
    return result


def parse_word_match_answer_map(lines: List[str]) -> Dict[str, str]:
    text = " ".join(compact_line(line) for line in lines if compact_line(line))
    answer_map: Dict[str, str] = {}
    for match in re.finditer(r"(\d{1,2})\s*[.\-—、:：]\s*([A-Z])", text, flags=re.I):
        answer_map[match.group(1)] = match.group(2).upper()
    return answer_map


def parse_table_answer_rows(lines: List[str]) -> Dict[str, str]:
    answer_map: Dict[str, str] = {}
    for raw_line in lines:
        line = compact_line(raw_line)
        if not line:
            continue
        if line.startswith("|"):
            cells = [compact_line(cell) for cell in line.strip("|").split("|")]
            if len(cells) >= 2 and cells[0] and cells[1]:
                if not all(re.fullmatch(r"[-: ]+", cell or "") for cell in cells):
                    answer_map[cells[0]] = cells[1]
            continue
        if ":" in line or "：" in line:
            left, right = re.split(r"[:：]", line, maxsplit=1)
            left = compact_line(left)
            right = compact_line(right)
            if left and right:
                answer_map[left] = right
    return answer_map



def parse_delimited_answer_list(lines: List[str]) -> List[str]:
    text = compact_line(" ".join(lines))
    if not text:
        return []
    if re.search(r"\d{1,2}\s*[.、]", text):
        answer_map = parse_compound_answer_map(lines)
        return [answer_map[idx] for idx in sorted(answer_map)]
    parts = [compact_line(part) for part in re.split(r"[;；,，\s]+", text) if compact_line(part)]
    return parts



def is_tf_task_title(text: str) -> bool:
    normalized = compact_line(text)
    if "任务" not in normalized:
        return False
    return any(token in normalized for token in ["判断", "T", "F", "√", "×"])



def apply_answers_to_rows(rows: List[Dict[str, Any]], answer_sections: Dict[int, List[str]]) -> None:
    for row in rows:
        question_no = int(row.get("question_no", 0) or 0)
        section_lines = answer_sections.get(question_no, [])
        if not section_lines:
            continue
        question_type = row.get("question_type", "")
        questions = row.get("questions", [])
        if question_type in {"single_choice", "phonics_odd_one_out", "dialogue_completion_choice", "reading_choice", "response_choice_match", "image_option_match"}:
            answer_map = parse_single_answer_map(section_lines)
            for idx, question in enumerate(questions, start=1):
                if idx in answer_map:
                    question["answer"]["value"] = answer_map[idx]
        elif question_type == "intonation_judgment":
            answer_map = parse_intonation_answer_map(section_lines)
            for idx, question in enumerate(questions, start=1):
                if idx in answer_map:
                    question["answer"]["value"] = answer_map[idx]
        elif question_type in {"reading_tf", "pronunciation_tf"}:
            answer_map = parse_boolean_answer_map(section_lines)
            for idx, question in enumerate(questions, start=1):
                if idx in answer_map:
                    question["answer"]["value"] = answer_map[idx]
        elif question_type in {"word_form_fill", "reading_fill_blank", "sentence_order", "sentence_rewrite", "letter_neighbor", "word_category"}:
            answer_map = parse_text_answer_map(section_lines)
            for idx, question in enumerate(questions, start=1):
                if idx in answer_map:
                    question["answer"]["value"] = answer_map[idx]
        elif question_type == "passage_word_bank_fill":
            answer_list = parse_delimited_answer_list(section_lines)
            for idx, question in enumerate(questions, start=1):
                if idx - 1 < len(answer_list):
                    question["answer"]["value"] = answer_list[idx - 1]
        elif question_type == "image_text_fill":
            answer_map = parse_compound_answer_map(section_lines)
            for idx, question in enumerate(questions, start=1):
                if idx in answer_map:
                    question["answer"]["value"] = answer_map[idx]
        elif question_type == "reading_task_mixed":
            answer_values = parse_reading_task_mixed_answers(section_lines)
            if (not questions or (len(questions) == 1 and questions[0].get("question") == "根据材料完成任务")) and answer_values:
                generated_questions = []
                for idx, (sub_no, value) in enumerate(answer_values, start=1):
                    answer_type = "boolean" if isinstance(value, bool) else "text"
                    generated_questions.append({
                        "sub_no": sub_no or idx,
                        "question": f"子题{sub_no or idx}",
                        "options": [],
                        "answer": {"type": answer_type, "value": value},
                        "analysis": "",
                    })
                row["questions"] = generated_questions
                continue
            for question, (_, value) in zip(questions, answer_values):
                question["answer"]["value"] = value
        elif question_type == "word_match":
            answer_map = parse_word_match_answer_map(section_lines)
            if answer_map:
                row["questions"] = [{
                    "sub_no": idx,
                    "question": prompt,
                    "options": [],
                    "answer": {"type": "match", "value": answer},
                    "analysis": "",
                } for idx, (prompt, answer) in enumerate(answer_map.items(), start=1)]
        elif question_type == "reading_table_completion":
            answer_map = parse_table_answer_rows(section_lines)
            for question in questions:
                prompt = compact_line(question.get("question", ""))
                if prompt in answer_map:
                    question["answer"]["value"] = answer_map[prompt]



def is_written_heading(line: str) -> bool:
    normalized = compact_line(line)
    return "笔试部分" in normalized



def is_excluded_section(heading: str) -> bool:
    normalized = compact_line(heading)
    excluded_tokens = ["听力", "听录音", "听音", "书面表达", "写作"]
    if any(token in normalized for token in excluded_tokens):
        return True
    if "PEP" in normalized or "RJ" in normalized:
        return True
    if normalized.startswith("年级"):
        return True
    if re.fullmatch(r"[一二三四五六七八九十\s]+", normalized):
        return True
    if normalized in {"年级", "英语", "笔试部分", "听力部分"}:
        return True
    if normalized in {"示例", "示例:"}:
        return True
    return False


SECTION_RE = re.compile(r"^([一二三四五六七八九十]{1,3})[、.．：:]?\s*(.+)$")



def split_written_sections(lines: List[Tuple[int, str]]) -> Tuple[List[Section], List[str]]:
    warnings: List[str] = []
    written_start = 0
    for idx, (_, line) in enumerate(lines):
        if is_written_heading(line):
            written_start = idx + 1
            break
    relevant = lines[written_start:] if written_start else lines
    answer_start = find_answer_start_index(relevant, {})
    if answer_start != -1:
        relevant = relevant[:answer_start]
    sections: List[Section] = []
    current: Optional[Section] = None
    seen_question_nos: set[int] = set()
    for page_no, line in relevant:
        normalized = compact_line(line)
        if not normalized:
            continue
        match = SECTION_RE.match(normalized)
        if match:
            question_no = chinese_number_to_int(match.group(1))
            heading = compact_line(match.group(2))
            if question_no <= 0:
                continue
            if is_excluded_section(heading):
                continue
            if current and current.lines:
                sections.append(current)
                seen_question_nos.add(current.question_no)
            if question_no in seen_question_nos and len(sections) >= 3:
                warnings.append(f"duplicate_section_sequence_stopped_at_{question_no}")
                current = None
                break
            current = Section(question_no=question_no, heading=heading, page_no=page_no, lines=[])
            continue
        if current is not None:
            current.lines.append(normalized)
    if current and current.lines:
        sections.append(current)
    if not sections:
        warnings.append("no_written_sections_detected")
    return sections, warnings



def guess_question_type(heading: str) -> str:
    normalized = compact_line(heading)
    if "看图" in normalized and "写单词" in normalized:
        return "image_word_write"
    if "左邻右舍" in normalized:
        return "letter_neighbor"
    if "分类" in normalized and ("填选项" in normalized or "根据所给单词" in normalized):
        return "word_category"
    if "看图" in normalized and ("补全句子" in normalized or "补全对话" in normalized):
        return "image_text_fill"
    if "任务型阅读" in normalized:
        return "reading_task_mixed"
    if "情景交际" in normalized:
        return "single_choice"
    if "补全对话" in normalized and "选择合适的句子" in normalized:
        return "dialogue_completion_choice"
    if "选择与" in normalized and "意思相符的图片" in normalized:
        return "image_option_match"
    if ("为下列句子" in normalized and "选择" in normalized and "图片" in normalized) or ("为下列图片" in normalized and "选择" in normalized and ("句子" in normalized or "对话" in normalized)):
        return "image_option_match"
    if "根据图片提示" in normalized and "补全句子" in normalized and "选择相应的图片" in normalized:
        return "image_text_fill"
    if "升调" in normalized or "降调" in normalized:
        return "intonation_judgment"
    if any(token in normalized for token in ["读音不同", "发音不同", "不同类", "同类"]):
        return "phonics_odd_one_out"
    if "连线" in normalized:
        return "word_match"
    if "连词成句" in normalized or "排序" in normalized:
        return "sentence_order"
    if "正确形式" in normalized or "适当形式" in normalized:
        return "word_form_fill"
    if any(token in normalized for token in ["选择正确的答语", "给下列问句选择正确的答语", "给下列句子选择合适的答语"]):
        return "response_choice_match"
    if any(token in normalized for token in ["单项选择", "单项选择题", "选择最佳答案", "选择正确答案", "读一读，选择正确的答案"]):
        return "single_choice"
    if "补全对话" in normalized or "补全他们的对话" in normalized:
        return "dialogue_completion_choice"
    if "发音" in normalized and "相同" in normalized and ("T" in normalized or "F" in normalized):
        return "pronunciation_tf"
    if "判断" in normalized and any(token in normalized for token in ["T", "F", "√", "×", "正", "误"]):
        return "reading_tf"
    if "完成表格" in normalized:
        return "reading_table_completion"
    if "阅读理解" in normalized or ("阅读" in normalized and any(token in normalized for token in ["选择正确答案", "选择正确的答案"])):
        return "reading_choice"
    if "完成任务" in normalized or "完成下列任务" in normalized:
        return "reading_task_mixed"
    if ("选词填空" in normalized and "补全短文" in normalized) or ("补全短文" in normalized and any(token in normalized for token in ["方框", "选择合适的内容", "选择正确的选项"])):
        return "passage_word_bank_fill"
    if any(token in normalized for token in ["填空", "完成句子"]) or ("根据句意" in normalized and any(token in normalized for token in ["写单词", "写短语", "补全句子"])) or ("看图" in normalized and "方框" in normalized and "补全句子" in normalized):
        return "reading_fill_blank"
    if any(token in normalized for token in ["改写句子", "按要求完成下列各题"]):
        return "sentence_rewrite"
    return "unsupported"



def infer_fallback_question_type(section: Section) -> str:
    heading = compact_line(section.heading)
    lines = [compact_line(line) for line in section.lines if compact_line(line)]
    if "看图" in heading and "写单词" in heading:
        return "image_word_write"
    if "左邻右舍" in heading:
        return "letter_neighbor"
    if "分类" in heading and ("填选项" in heading or "根据所给单词" in heading):
        return "word_category"
    if "看图" in heading and ("补全句子" in heading or "补全对话" in heading):
        return "image_text_fill"
    if "任务型阅读" in heading:
        return "reading_task_mixed"
    if "情景交际" in heading and any(re.search(r"\b[A-D]\.\s*", line) for line in lines):
        return "single_choice"
    if any(token in heading for token in ["单项选择", "选择最佳答案", "选择正确答案"]):
        return "single_choice"
    if any(re.search(r"\b[A-D]\.\s*", line) for line in lines) and len(group_question_lines(lines)) >= 2:
        return "single_choice"
    if len(lines) >= 2 and any(re.search(r"\d{1,2}\.\s*[_.]", line) for line in lines):
        word_bank_candidates = [
            line for line in lines
            if 3 <= len(re.findall(r"[A-Za-z']+", line)) <= 15 and "___" not in line
        ]
        if word_bank_candidates:
            return "passage_word_bank_fill"
    if any("[" in line and "]" in line for line in lines) and any(re.search(r"\d{1,2}\.\s*[_.]", line) for line in lines):
        return "image_text_fill"
    if any("任务" in line for line in lines):
        return "reading_task_mixed"
    return "unsupported"

def parse_option_span(text: str) -> List[Dict[str, str]]:
    matches = list(re.finditer(r"([A-G])\.\s*(.*?)(?=(?:\s+[A-G]\.\s)|$)", text))
    options: List[Dict[str, str]] = []
    for match in matches:
        options.append({"key": match.group(1), "text": compact_line(match.group(2))})
    return options


def parse_option_lines(lines: List[str]) -> List[Dict[str, str]]:
    options: List[Dict[str, str]] = []
    current_key: Optional[str] = None
    current_parts: List[str] = []
    for raw_line in lines:
        line = compact_line(raw_line)
        if not line:
            continue
        match = re.match(r"^([A-G])\.\s*(.*)$", line)
        if match:
            if current_key:
                options.append({"key": current_key, "text": compact_line(" ".join(current_parts))})
            current_key = match.group(1)
            current_parts = [match.group(2)]
            continue
        if current_key:
            current_parts.append(line)
    if current_key:
        options.append({"key": current_key, "text": compact_line(" ".join(current_parts))})
    return [option for option in options if option.get("text")]


def parse_numbered_items(lines: List[str]) -> List[Tuple[int, str]]:
    text = "\n".join(lines)
    pattern = re.compile(r"(?ms)(?:(?:\(|\uff08)\s*(?:\)|\uff09)\s*)?(\d{1,2})[.\u3001]\s*(.*?)(?=(?:\n\s*(?:(?:\(|\uff08)\s*(?:\)|\uff09)\s*)?\d{1,2}[.\u3001])|$)")
    rows: List[Tuple[int, str]] = []
    for match in pattern.finditer(text):
        rows.append((int(match.group(1)), normalize_multiline_text(match.group(2))))
    return rows


def parse_inline_numbered_items(lines: List[str]) -> List[Tuple[int, str]]:
    text = " ".join(compact_line(line) for line in lines if compact_line(line))
    pattern = re.compile(r"(?:(?:\(|\uff08)\s*(?:\)|\uff09)\s*)?(\d{1,2})[.\u3001]\s*(.*?)(?=(?:\s*(?:(?:\(|\uff08)\s*(?:\)|\uff09)\s*)?\d{1,2}[.\u3001])|$)")
    rows: List[Tuple[int, str]] = []
    for match in pattern.finditer(text):
        rows.append((int(match.group(1)), compact_line(match.group(2))))
    return rows


def split_task_chunks(lines: List[str]) -> Tuple[List[str], List[Tuple[str, List[str]]]]:
    material_lines: List[str] = []
    tasks: List[Tuple[str, List[str]]] = []
    current_title = ""
    current_lines: List[str] = []
    in_task = False
    for raw_line in lines:
        line = compact_line(raw_line)
        if not line or re.fullmatch(r"[\-??????d]+", line):
            continue
        if "??????????????????" in line or re.search(r"\bUnit\s+\d+\b", line):
            break
        is_task_line = ("任务" in line) or ("ä»»åŠ¡" in line)
        if is_task_line:
            if current_title:
                tasks.append((current_title, current_lines))
            split_match = re.match(r"^(.*?[：:])(.*)$", line)
            if split_match:
                current_title = compact_line(split_match.group(1))
                trailing = compact_line(split_match.group(2))
            else:
                current_title = line
                trailing = ""
            current_lines = []
            in_task = True
            if trailing:
                current_lines.append(trailing)
            continue
        if in_task:
            current_lines.append(line)
        else:
            material_lines.append(line)
    if current_title:
        tasks.append((current_title, current_lines))
    return material_lines, tasks


QUESTION_LINE_RE = re.compile(r"^(?:(?:\(|\uff08)\s*(?:\)|\uff09)\s*)?(\d{1,2})[.\u3001]\s*(.*)$")


def group_question_lines(lines: List[str]) -> List[Tuple[int, List[str]]]:
    grouped: List[Tuple[int, List[str]]] = []
    current_no = 0
    current_lines: List[str] = []
    for raw_line in lines:
        line = compact_line(raw_line)
        if not line:
            continue
        match = QUESTION_LINE_RE.match(line)
        if match:
            if current_no and current_lines:
                grouped.append((current_no, current_lines))
            current_no = int(match.group(1))
            first_line = compact_line(match.group(2))
            current_lines = [first_line] if first_line else []
            continue
        if current_no:
            current_lines.append(line)
    if current_no and current_lines:
        grouped.append((current_no, current_lines))
    return grouped


def parse_single_choice_section(section: Section) -> Dict[str, Any]:
    items = group_question_lines(section.lines)
    questions = []
    for idx, (_, body_lines) in enumerate(items, start=1):
        merged = normalize_multiline_text("\n".join(body_lines))
        options = parse_option_span(merged.replace("\n", " "))
        if not options:
            continue
        stem = compact_line(re.split(r"\bA\.\s*", merged, maxsplit=1)[0])
        questions.append({
            "sub_no": idx,
            "question": stem,
            "options": options,
            "answer": {"type": "single", "value": ""},
            "analysis": "",
        })
    return {"material": [], "questions": questions}


def parse_phonics_odd_one_out_section(section: Section) -> Dict[str, Any]:
    items = group_question_lines(section.lines)
    questions = []
    for idx, (_, body_lines) in enumerate(items, start=1):
        merged = normalize_multiline_text("\n".join(body_lines))
        options = parse_option_span(merged.replace("\n", " "))
        if not options:
            continue
        questions.append({
            "sub_no": idx,
            "question": "",
            "options": options,
            "answer": {"type": "single", "value": ""},
            "analysis": "",
        })
    return {"material": [], "questions": questions}


def parse_word_match_section(section: Section) -> Dict[str, Any]:
    entries = [compact_line(line) for line in section.lines if compact_line(line)]
    if not entries:
        return {"material": [], "questions": []}
    midpoint = len(entries) // 2
    left = entries[:midpoint]
    right = entries[midpoint:]
    questions = []
    for idx, question in enumerate(left, start=1):
        questions.append({
            "sub_no": idx,
            "question": question,
            "options": [],
            "answer": {"type": "match", "value": ""},
            "analysis": "",
        })
    return {"material": [], "questions": questions}


def parse_word_form_fill_section(section: Section) -> Dict[str, Any]:
    items = parse_numbered_items(section.lines)
    questions = [{
        "sub_no": idx,
        "question": compact_line(body),
        "options": [],
        "answer": {"type": "text", "value": ""},
        "analysis": "",
    } for idx, (_, body) in enumerate(items, start=1)]
    return {"material": [], "questions": questions}


def parse_letter_neighbor_section(section: Section) -> Dict[str, Any]:
    items = parse_inline_numbered_items(section.lines) or parse_numbered_items(section.lines)
    questions = []
    for idx, (_, body) in enumerate(items, start=1):
        questions.append({
            "sub_no": idx,
            "question": compact_line(body),
            "options": [],
            "answer": {"type": "text", "value": ""},
            "analysis": "",
        })
    return {"material": [], "questions": questions}


def parse_word_category_section(section: Section) -> Dict[str, Any]:
    lines = [compact_line(line) for line in section.lines if compact_line(line)]
    material: List[Dict[str, Any]] = []
    option_bank_lines = [line for line in lines if re.search(r"\b[A-J]\.\s*", line)]
    if option_bank_lines:
        material.append({"type": "text", "content": normalize_multiline_text("\n".join(option_bank_lines))})
    question_lines = [line for line in lines if line not in option_bank_lines]
    items = parse_inline_numbered_items(question_lines) or parse_numbered_items(question_lines)
    questions = []
    for idx, (_, body) in enumerate(items, start=1):
        questions.append({
            "sub_no": idx,
            "question": compact_line(body),
            "options": [],
            "answer": {"type": "text", "value": ""},
            "analysis": "",
        })
    return {"material": material, "questions": questions}


def parse_reading_fill_blank_section(section: Section) -> Dict[str, Any]:
    material_lines: List[str] = []
    word_bank_lines: List[str] = []
    question_lines: List[str] = []
    seen_question = False
    for line in section.lines:
        normalized = compact_line(line)
        if QUESTION_LINE_RE.match(normalized):
            seen_question = True
        if seen_question:
            question_lines.append(line)
        else:
            if re.search(r"[A-Za-z]", normalized) and "___" not in normalized and len(normalized.split()) <= 8:
                word_bank_lines.append(line)
            else:
                material_lines.append(line)
    material: List[Dict[str, Any]] = []
    material_text = normalize_multiline_text("\n".join(material_lines))
    if material_text:
        material.append({"type": "text", "content": material_text})
    word_bank_text = compact_line(" ".join(word_bank_lines))
    if word_bank_text:
        material.append({"type": "text", "content": f"word_bank: {word_bank_text}"})
    items = parse_numbered_items(question_lines)
    questions = [{
        "sub_no": idx,
        "question": compact_line(body),
        "options": [],
        "answer": {"type": "text", "value": ""},
        "analysis": "",
    } for idx, (_, body) in enumerate(items, start=1)]
    return {"material": material, "questions": questions}


def infer_blank_numbers_from_text(text: str) -> List[int]:
    ordered: List[int] = []
    normalized = normalize_multiline_text(text)
    for match in re.finditer(r"(\d{1,2})\s*[.、]\s*[_＿]{1,}|[_＿]{2,}\s*(\d{1,2})", normalized):
        value = match.group(1) or match.group(2)
        if not value:
            continue
        blank_no = int(value)
        if blank_no not in ordered:
            ordered.append(blank_no)
    if ordered:
        return ordered
    generic_count = len(re.findall(r"[_＿]{3,}", normalized))
    if generic_count:
        return list(range(1, generic_count + 1))
    return []


def build_blank_questions(blank_numbers: List[int], start_sub_no: int, option_bank: Optional[List[Dict[str, str]]] = None) -> List[Dict[str, Any]]:
    questions: List[Dict[str, Any]] = []
    answer_type = "single" if option_bank else "text"
    answer_value: Any = "" if option_bank else ""
    for offset, blank_no in enumerate(blank_numbers, start=0):
        questions.append({
            "sub_no": start_sub_no + offset,
            "question": f"空{blank_no}",
            "options": option_bank or [],
            "answer": {"type": answer_type, "value": answer_value},
            "analysis": "",
        })
    return questions


def is_fill_task_title(text: str) -> bool:
    normalized = compact_line(text)
    return any(token in normalized for token in ["选词填空", "补全短文", "补全对话", "完成短文", "选择合适的单词", "用所给单词"])


def infer_open_question_numbers(text: str) -> List[int]:
    ordered: List[int] = []
    for match in re.finditer(r"(\d{1,2})\s*[.、]", compact_line(text)):
        question_no = int(match.group(1))
        if question_no not in ordered:
            ordered.append(question_no)
    return ordered


def build_info_card_questions(task_lines: List[str], start_sub_no: int) -> List[Dict[str, Any]]:
    questions: List[Dict[str, Any]] = []
    for idx, line in enumerate(task_lines, start=0):
        normalized = compact_line(line)
        if not normalized or ":" not in normalized:
            continue
        if re.fullmatch(r"[A-Za-z ]+[:：]?", normalized):
            continue
        key = normalized.split(":", 1)[0].split("：", 1)[0].strip()
        if len(key) > 20:
            continue
        questions.append({
            "sub_no": start_sub_no + idx,
            "question": key,
            "options": [],
            "answer": {"type": "text", "value": ""},
            "analysis": "",
        })
    return questions


def build_text_questions_from_labels(task_text: str, start_sub_no: int) -> List[Dict[str, Any]]:
    labels = re.findall(r"([A-Za-z][A-Za-z ]{0,20})\(([^()]{1,12})\)", task_text)
    questions: List[Dict[str, Any]] = []
    for idx, (label, alias) in enumerate(labels, start=0):
        prompt = compact_line(f"{label}({alias})")
        questions.append({
            "sub_no": start_sub_no + idx,
            "question": prompt,
            "options": [],
            "answer": {"type": "text", "value": ""},
            "analysis": "",
        })
    return questions


def is_title_choice_task(text: str) -> bool:
    normalized = compact_line(text)
    return "标题" in normalized or "题目" in normalized


def parse_reading_task_mixed_answers(lines: List[str]) -> List[Tuple[int, Any]]:
    values: List[Tuple[int, Any]] = []
    text = " ".join(compact_line(line) for line in lines if compact_line(line))
    for match in re.finditer(r"(\d{1,2})\s*[.、]\s*([A-GTFYN√×]+|.+?)(?=(?:\s+\d{1,2}\s*[.、])|$)", text):
        raw_value = compact_line(match.group(2))
        if raw_value in {"T", "F", "Y", "N"}:
            value: Any = raw_value in {"T", "Y"}
        elif raw_value in {"√", "×"}:
            value = raw_value == "√"
        else:
            value = raw_value
        values.append((int(match.group(1)), value))
    return values

def parse_passage_word_bank_fill_section(section: Section) -> Dict[str, Any]:
    lines = [compact_line(line) for line in section.lines if compact_line(line) and not re.fullmatch(r"[\-??????d]+", compact_line(line))]
    if not lines:
        return {"material": [], "questions": []}
    word_bank_index = 0
    for idx, line in enumerate(lines):
        token_count = len(re.findall(r"[A-Za-z']+", line))
        if "[" in line or "]" in line:
            continue
        if token_count >= 3 and token_count <= 15 and "___" not in line and not re.search(r"\d{1,2}\.\s*[_\.]", line):
            word_bank_index = idx
            break
    word_bank_line = lines[word_bank_index] if lines else ""
    material_lines = lines[:word_bank_index]
    passage_lines = lines[word_bank_index + 1:]
    passage_text = normalize_multiline_text("\n".join(passage_lines))
    numbered_blanks = infer_blank_numbers_from_text(passage_text)
    blank_count = len(numbered_blanks)
    if blank_count == 0:
        blank_count = len(re.findall(r"_{3,}", passage_text))
    if blank_count == 0:
        blank_count = passage_text.count("________")
    if blank_count == 0:
        blank_count = max(len(re.findall(r"\b\d{1,2}\.\b", passage_text)), 0)
    if not numbered_blanks:
        numbered_blanks = list(range(1, blank_count + 1))
    material: List[Dict[str, Any]] = []
    material_text = normalize_multiline_text("\n".join(material_lines))
    if material_text:
        material.append({"type": "text", "content": material_text})
    if word_bank_line:
        material.append({"type": "text", "content": f"word_bank: {word_bank_line}"})
    if passage_text:
        material.append({"type": "text", "content": passage_text})
    questions = build_blank_questions(numbered_blanks, 1)
    return {"material": material, "questions": questions}



def parse_reading_tf_section(section: Section) -> Dict[str, Any]:
    prompt_lines = [compact_line(line) for line in section.lines if compact_line(line)]
    prompt_lines = [line for line in prompt_lines if re.search(r"\(\s*\)\s*\d{1,2}[.、]", line) or re.search(r"^\(\s*\)\d{1,2}[.、]", line) or ("( )" in line and re.search(r"\d{1,2}", line))]
    items = parse_inline_numbered_items(prompt_lines) if prompt_lines else parse_numbered_items(section.lines)
    if not items:
        items = parse_numbered_items(section.lines)
    material_lines = section.lines
    if items:
        first_item_no = items[0][0]
        split_re = re.compile(rf"^\s*{first_item_no}[.、]\s*")
        collected: List[str] = []
        before_items = True
        for line in section.lines:
            if before_items and split_re.match(line):
                before_items = False
            if before_items:
                collected.append(line)
        material_lines = collected
    material_text = normalize_multiline_text("\n".join(material_lines))
    material = [{"type": "text", "content": material_text}] if material_text else []
    questions = [{
        "sub_no": idx,
        "question": compact_line(body),
        "options": [],
        "answer": {"type": "boolean", "value": None},
        "analysis": "",
    } for idx, (_, body) in enumerate(items, start=1)]
    return {"material": material, "questions": questions}


def parse_pronunciation_tf_section(section: Section) -> Dict[str, Any]:
    items = parse_inline_numbered_items(section.lines) or parse_numbered_items(section.lines)
    questions = [{
        "sub_no": idx,
        "question": compact_line(body),
        "options": [
            {"key": "T", "text": "相同"},
            {"key": "F", "text": "不同"},
        ],
        "answer": {"type": "boolean", "value": None},
        "analysis": "",
    } for idx, (_, body) in enumerate(items, start=1)]
    return {"material": [], "questions": questions}


def parse_response_choice_match_section(section: Section) -> Dict[str, Any]:
    lines = [compact_line(line) for line in section.lines if compact_line(line)]
    inline_items: List[Tuple[int, str]] = []
    inline_options: List[str] = []
    for line in lines:
        qmatch = QUESTION_LINE_RE.match(line)
        if not qmatch:
            continue
        body = compact_line(qmatch.group(2))
        opt_match = re.search(r"\b([A-G])\.\s*", body)
        if opt_match:
            inline_items.append((int(qmatch.group(1)), compact_line(body[:opt_match.start()])))
            inline_options.append(body[opt_match.start():])
    option_lines = [line for line in lines if re.search(r"\b[A-G]\.\s*", line)]
    prompt_lines = [line for line in lines if not re.search(r"\b[A-G]\.\s*", line)]
    option_bank = parse_option_span(" ".join(inline_options or option_lines))
    items = inline_items or parse_inline_numbered_items(prompt_lines) or parse_numbered_items(prompt_lines)
    questions = [{
        "sub_no": idx,
        "question": compact_line(body),
        "options": option_bank,
        "answer": {"type": "single", "value": ""},
        "analysis": "",
    } for idx, (_, body) in enumerate(items, start=1)]
    return {"material": [], "questions": questions}


def parse_image_option_match_section(section: Section) -> Dict[str, Any]:
    lines = [compact_line(line) for line in section.lines if compact_line(line)]
    prompt_lines = [line for line in lines if QUESTION_LINE_RE.match(line) or re.search(r"(?:\(\s*\)|^)\d{1,2}\.", line)]
    items = parse_inline_numbered_items(prompt_lines) or parse_numbered_items(prompt_lines)
    option_keys = sorted(set(re.findall(r"\b([A-G])\.", " ".join(lines))))
    options = [{"key": key, "text": f"image_option_{key}"} for key in option_keys]
    material: List[Dict[str, Any]] = []
    if option_keys:
        material.append({"type": "text", "content": "image_options: " + " ".join(option_keys)})
    questions = [{
        "sub_no": idx,
        "question": compact_line(body),
        "options": options,
        "answer": {"type": "single", "value": ""},
        "analysis": "",
    } for idx, (_, body) in enumerate(items, start=1)]
    return {"material": material, "questions": questions}


def parse_image_text_fill_section(section: Section) -> Dict[str, Any]:
    lines = [compact_line(line) for line in section.lines if compact_line(line)]
    image_option_lines = [line for line in lines if re.search(r"\b[A-G]\.", line)]
    prompt_lines = [line for line in lines if QUESTION_LINE_RE.match(line) or re.search(r"(?:\(\s*\)|^)\d{1,2}\.", line)]
    option_keys = sorted(set(re.findall(r"\b([A-G])\.", " ".join(image_option_lines))))
    material: List[Dict[str, Any]] = []
    if option_keys:
        material.append({"type": "text", "content": "image_options: " + " ".join(option_keys)})
    word_bank_text = compact_line(" ".join([line for line in lines if line not in image_option_lines and line not in prompt_lines]))
    if word_bank_text and len(word_bank_text.split()) <= 20:
        material.append({"type": "text", "content": f"word_bank: {word_bank_text}"})
    items = parse_inline_numbered_items(prompt_lines) or parse_numbered_items(prompt_lines)
    questions = [{
        "sub_no": idx,
        "question": compact_line(body),
        "options": [{"key": key, "text": f"image_option_{key}"} for key in option_keys],
        "answer": {"type": "text", "value": ""},
        "analysis": "",
    } for idx, (_, body) in enumerate(items, start=1)]
    return {"material": material, "questions": questions}


def parse_image_word_write_section(section: Section) -> Dict[str, Any]:
    lines = [compact_line(line) for line in section.lines if compact_line(line)]
    items = parse_inline_numbered_items(lines) or parse_numbered_items(lines)
    if not items:
        numbered_only = []
        for line in lines:
            match = QUESTION_LINE_RE.match(line)
            if match:
                numbered_only.append((int(match.group(1)), compact_line(match.group(2))))
        items = numbered_only
    questions = []
    for idx, (_, body) in enumerate(items, start=1):
        prompt = compact_line(body) or f"图{idx}"
        questions.append({
            "sub_no": idx,
            "question": prompt,
            "options": [],
            "answer": {"type": "text", "value": ""},
            "analysis": "",
        })
    return {"material": [], "questions": questions}


def parse_reading_task_mixed_section(section: Section) -> Dict[str, Any]:
    material_lines, task_chunks = split_task_chunks(section.lines)
    material: List[Dict[str, Any]] = []
    material_text = normalize_multiline_text("\n".join(material_lines))
    if material_text:
        material.append({"type": "text", "content": material_text})
    questions: List[Dict[str, Any]] = []
    sub_no = 1
    for task_title, task_lines in task_chunks:
        task_lines = [compact_line(line) for line in task_lines if compact_line(line)]
        if not task_lines:
            continue
        task_text = normalize_multiline_text("\n".join(task_lines))
        task_descriptor = compact_line(task_title + " " + task_text)
        option_lines = [line for line in task_lines if re.search(r"\b[A-G]\.\s*", line)]
        prompt_lines = [line for line in task_lines if line not in option_lines]
        option_bank = parse_option_span(" ".join(option_lines))
        if not option_bank and option_lines:
            option_bank = parse_option_lines(option_lines)
        grouped_items = group_question_lines(task_lines)
        numbered_items = parse_inline_numbered_items(prompt_lines) or parse_numbered_items(prompt_lines)

        if grouped_items and any((parse_option_span(normalize_multiline_text("\n".join(body_lines)).replace("\n", " ")) or parse_option_lines(body_lines)) for _, body_lines in grouped_items):
            for _, body_lines in grouped_items:
                merged = normalize_multiline_text("\n".join(body_lines))
                options = parse_option_span(merged.replace("\n", " ")) or parse_option_lines(body_lines)
                if len(options) == 1 and re.fullmatch(r"[A-G](?:\.\s*[A-G])+\.?", options[0]["text"]):
                    option_keys = [options[0]["key"]] + re.findall(r"([A-G])", options[0]["text"])
                    options = [{"key": key, "text": f"option_{key}"} for key in option_keys]
                stem = compact_line(re.split(r"\bA\.\s*", merged, maxsplit=1)[0])
                if not options:
                    continue
                questions.append({
                    "sub_no": sub_no,
                    "question": stem,
                    "options": options,
                    "answer": {"type": "single", "value": ""},
                    "analysis": "",
                })
                sub_no += 1
            continue

        if is_fill_task_title(task_descriptor) and option_bank:
            blank_numbers = infer_blank_numbers_from_text(task_text)
            if not blank_numbers:
                blank_numbers = infer_blank_numbers_from_text(material_text)
            if blank_numbers:
                for item in build_blank_questions(blank_numbers, sub_no, option_bank):
                    questions.append(item)
                sub_no += len(blank_numbers)
                continue

        if is_tf_task_title(task_descriptor):
            tf_items = parse_inline_numbered_items(task_lines) or parse_numbered_items(task_lines)
            for _, body in tf_items:
                questions.append({
                    "sub_no": sub_no,
                    "question": compact_line(body),
                    "options": [],
                    "answer": {"type": "boolean", "value": None},
                    "analysis": "",
                })
                sub_no += 1
            continue

        info_card_questions = build_info_card_questions(task_lines, sub_no)
        if info_card_questions:
            questions.extend(info_card_questions)
            sub_no += len(info_card_questions)
            continue

        label_questions = build_text_questions_from_labels(task_text, sub_no)
        if label_questions:
            questions.extend(label_questions)
            sub_no += len(label_questions)
            continue

        if is_title_choice_task(task_descriptor) and option_bank:
            title_prompt = compact_line(" ".join(prompt_lines))
            title_prompt = re.sub(r"[_\.\s]+$", "", title_prompt).strip()
            if not title_prompt or title_prompt in {task_title, compact_line(task_title)}:
                title_prompt = "为文章选择标题"
            questions.append({
                "sub_no": sub_no,
                "question": title_prompt,
                "options": option_bank,
                "answer": {"type": "single", "value": ""},
                "analysis": "",
            })
            sub_no += 1
            continue

        if option_bank and numbered_items:
            for _, body in numbered_items:
                questions.append({
                    "sub_no": sub_no,
                    "question": compact_line(body),
                    "options": option_bank,
                    "answer": {"type": "single", "value": ""},
                    "analysis": "",
                })
                sub_no += 1
            continue

        if option_bank and not numbered_items:
            questions.append({
                "sub_no": sub_no,
                "question": compact_line(task_title),
                "options": option_bank,
                "answer": {"type": "single", "value": ""},
                "analysis": "",
            })
            sub_no += 1
            continue

        open_question_numbers = infer_open_question_numbers(task_text)
        if open_question_numbers:
            for item in build_blank_questions(open_question_numbers, sub_no):
                questions.append(item)
            sub_no += len(open_question_numbers)
            continue

        if numbered_items:
            for _, body in numbered_items:
                questions.append({
                    "sub_no": sub_no,
                    "question": compact_line(body),
                    "options": [],
                    "answer": {"type": "text", "value": ""},
                    "analysis": "",
                })
                sub_no += 1
            continue

        blank_numbers = infer_blank_numbers_from_text(task_text)
        if blank_numbers:
            for item in build_blank_questions(blank_numbers, sub_no):
                questions.append(item)
            sub_no += len(blank_numbers)
            continue
    if not questions and material:
        questions.append({
            "sub_no": 1,
            "question": "根据材料完成任务",
            "options": [],
            "answer": {"type": "text", "value": ""},
            "analysis": "",
        })
    return {"material": material, "questions": questions}


def parse_reading_table_completion_section(section: Section) -> Dict[str, Any]:
    lines = [compact_line(line) for line in section.lines if compact_line(line)]
    table_start = next((idx for idx, line in enumerate(lines) if line.startswith("|")), -1)
    material: List[Dict[str, Any]] = []
    if table_start > 0:
        material_text = normalize_multiline_text("\n".join(lines[:table_start]))
        if material_text:
            material.append({"type": "text", "content": material_text})
    table_lines = lines[table_start:] if table_start != -1 else []
    headers: List[str] = []
    rows: List[List[str]] = []
    for line in table_lines:
        if not line.startswith("|"):
            continue
        cells = [compact_line(cell) for cell in line.strip("|").split("|")]
        if not headers:
            headers = cells
            continue
        if all(re.fullmatch(r"[-: ]+", cell or "") for cell in cells):
            continue
        rows.append(cells)
    if headers:
        material.append({"type": "table", "headers": headers, "rows": rows})
    questions = []
    for idx, row in enumerate(rows, start=1):
        if not row:
            continue
        prompt = row[0]
        answer_value = row[1] if len(row) > 1 else ""
        questions.append({
            "sub_no": idx,
            "question": prompt,
            "options": [],
            "answer": {"type": "text", "value": answer_value},
            "analysis": "",
        })
    return {"material": material, "questions": questions}


def parse_sentence_order_section(section: Section) -> Dict[str, Any]:
    items = parse_numbered_items(section.lines)
    questions = [{
        "sub_no": idx,
        "question": compact_line(body),
        "options": [],
        "answer": {"type": "text", "value": ""},
        "analysis": "",
    } for idx, (_, body) in enumerate(items, start=1)]
    return {"material": [], "questions": questions}


def parse_intonation_judgment_section(section: Section) -> Dict[str, Any]:
    items = parse_numbered_items(section.lines)
    questions = []
    for idx, (_, body) in enumerate(items, start=1):
        prompt = compact_line(re.sub(r"\(\s*\)", "", body))
        questions.append({
            "sub_no": idx,
            "question": prompt,
            "options": [
                {"key": "↑", "text": "升调"},
                {"key": "↓", "text": "降调"},
            ],
            "answer": {"type": "single", "value": ""},
            "analysis": "",
        })
    return {"material": [], "questions": questions}


def parse_sentence_rewrite_section(section: Section) -> Dict[str, Any]:
    items = parse_numbered_items(section.lines)
    questions = [{
        "sub_no": idx,
        "question": compact_line(body),
        "options": [],
        "answer": {"type": "text", "value": ""},
        "analysis": "",
    } for idx, (_, body) in enumerate(items, start=1)]
    return {"material": [], "questions": questions}


def parse_reading_choice_section(section: Section) -> Dict[str, Any]:
    items = group_question_lines(section.lines)
    material_lines = section.lines
    if items:
        first_item_no = items[0][0]
        split_re = re.compile(rf"^\s*{first_item_no}[.、]\s*")
        collected: List[str] = []
        before_items = True
        for line in section.lines:
            if before_items and split_re.match(line):
                before_items = False
            if before_items:
                collected.append(line)
        material_lines = collected
    material_text = normalize_multiline_text("\n".join(material_lines))
    material = [{"type": "text", "content": material_text}] if material_text else []
    questions = []
    for idx, (_, body_lines) in enumerate(items, start=1):
        merged = normalize_multiline_text("\n".join(body_lines))
        options = parse_option_span(merged.replace("\n", " "))
        stem = compact_line(re.split(r"\bA\.\s*", merged, maxsplit=1)[0])
        questions.append({
            "sub_no": idx,
            "question": stem,
            "options": options,
            "answer": {"type": "single", "value": ""},
            "analysis": "",
        })
    return {"material": material, "questions": questions}


def parse_dialogue_completion_choice_section(section: Section) -> Dict[str, Any]:
    cleaned_lines = [compact_line(line) for line in section.lines if compact_line(line) and not re.fullmatch(r"[\-－\d]+", compact_line(line))]
    option_lines = [line for line in cleaned_lines if re.search(r"\b[A-G]\.\s*", line)]
    dialogue_lines = [line for line in cleaned_lines if not re.search(r"\b[A-G]\.\s*", line)]
    option_bank = parse_option_span(" ".join(option_lines))
    dialogue_text = "\n".join(dialogue_lines)
    text = "\n".join(cleaned_lines)
    blank_numbers = [int(num) for num in re.findall(r"_\s*(\d{1,2})\s*_", dialogue_text)]
    if not blank_numbers:
        blank_numbers = [int(num) for num in re.findall(r"(\d{1,2})\.\s*[_＿]{2,}", dialogue_text)]
    if not blank_numbers:
        blank_numbers = [int(num) for num in re.findall(r"(\d{1,2})\.\s*[_＿]{2,}", text)]
    ordered_blanks: List[int] = []
    for blank_no in blank_numbers:
        if blank_no not in ordered_blanks:
            ordered_blanks.append(blank_no)
    questions = [{
        "sub_no": idx,
        "question": f"空{blank_no}",
        "options": option_bank,
        "answer": {"type": "single", "value": ""},
        "analysis": "",
    } for idx, blank_no in enumerate(ordered_blanks, start=1)]
    material = [{"type": "text", "content": normalize_multiline_text(dialogue_text)}] if dialogue_text else []
    return {"material": material, "questions": questions}


def infer_fallback_question_type(section: Section) -> str:
    lines = [compact_line(line) for line in section.lines if compact_line(line)]
    if len(lines) >= 2 and any(re.search(r"\d{1,2}\.\s*[_\.]", line) for line in lines):
        word_bank_candidates = [
            line for line in lines
            if len(re.findall(r"[A-Za-z']+", line)) >= 3 and len(re.findall(r"[A-Za-z']+", line)) <= 15 and "___" not in line
        ]
        if word_bank_candidates:
            return "passage_word_bank_fill"
    if any("[" in line and "]" in line for line in lines) and any(re.search(r"\d{1,2}\.\s*[_\.]", line) for line in lines):
        return "image_text_fill"
    if any("??" in line or "??????" in line for line in lines):
        return "reading_task_mixed"
    return "unsupported"


PHASE1_PARSERS = {
    "image_option_match": parse_image_option_match_section,
    "image_text_fill": parse_image_text_fill_section,
    "image_word_write": parse_image_word_write_section,
    "intonation_judgment": parse_intonation_judgment_section,
    "letter_neighbor": parse_letter_neighbor_section,
    "passage_word_bank_fill": parse_passage_word_bank_fill_section,
    "phonics_odd_one_out": parse_phonics_odd_one_out_section,
    "pronunciation_tf": parse_pronunciation_tf_section,
    "response_choice_match": parse_response_choice_match_section,
    "word_match": parse_word_match_section,
    "single_choice": parse_single_choice_section,
    "word_form_fill": parse_word_form_fill_section,
    "sentence_order": parse_sentence_order_section,
    "sentence_rewrite": parse_sentence_rewrite_section,
    "word_category": parse_word_category_section,
    "reading_fill_blank": parse_reading_fill_blank_section,
    "reading_task_mixed": parse_reading_task_mixed_section,
    "reading_tf": parse_reading_tf_section,
    "reading_table_completion": parse_reading_table_completion_section,
    "reading_choice": parse_reading_choice_section,
    "dialogue_completion_choice": parse_dialogue_completion_choice_section,
}


def build_primary_record(meta: Dict[str, str], section: Section) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    question_type = guess_question_type(section.heading)
    if question_type not in PHASE1_PARSERS:
        question_type = infer_fallback_question_type(section)
    if question_type not in PHASE1_PARSERS:
        return None, question_type
    parsed = PHASE1_PARSERS[question_type](section)
    if not parsed.get("questions"):
        if question_type == "reading_task_mixed" and parsed.get("material"):
            parsed["questions"] = []
        else:
            return None, question_type
    material_text = "\n".join(
        block.get("content", "")
        for block in parsed.get("material", [])
        if block.get("type") == "text"
    )
    first_question = parsed["questions"][0]["question"] if parsed["questions"] else ""
    seed = "|".join([
        meta.get("book_version", ""),
        meta.get("grade", ""),
        meta.get("semester", ""),
        meta.get("unit", ""),
        question_type,
        str(section.question_no),
        compact_line(material_text or first_question),
    ])
    return {
        "question_uid": make_short_id(seed),
        "source_file": meta.get("source_file", ""),
        "book_version": meta.get("book_version", ""),
        "grade": meta.get("grade", ""),
        "semester": meta.get("semester", ""),
        "unit": meta.get("unit", ""),
        "question_type": question_type,
        "question_no": section.question_no,
        "knowledge_tags": [],
        "difficulty": None,
        "material": parsed.get("material", []),
        "questions": parsed.get("questions", []),
        "analysis": "",
        "created_at": iso_now(),
    }, None


def build_output_filename(meta: Dict[str, str]) -> str:
    parts = []
    for value in [
        meta.get("grade", ""),
        meta.get("semester", ""),
    ]:
        if not sanitize_text(value):
            continue
        sanitized = sanitize_filename(value)
        if sanitized and sanitized != "unknown":
            parts.append(sanitized)
    unit_value = meta.get("unit", "")
    if sanitize_text(unit_value):
        sanitized_unit = sanitize_filename(unit_value)
        if sanitized_unit and sanitized_unit != "unknown":
            parts.append(sanitized_unit)
    source_stem = os.path.splitext(meta.get("source_file", ""))[0]
    sanitized_stem = sanitize_filename(source_stem)
    if sanitized_stem and sanitized_stem != "unknown":
        parts.append(sanitized_stem)
    return "_".join(parts) + ".jsonl"


def resolve_output_dir(base_output_dir: str, meta: Dict[str, str], run_tag: str) -> str:
    book_version = sanitize_filename(meta.get("book_version", "")) or "未分类教材"
    resolved = os.path.join(base_output_dir, book_version, run_tag)
    os.makedirs(resolved, exist_ok=True)
    return resolved


def write_jsonl(rows: List[Dict[str, Any]], output_path: str) -> None:
    with open(output_path, "w", encoding="utf-8") as wf:
        for row in rows:
            wf.write(json.dumps(row, ensure_ascii=False) + "\n")

def recover_missing_answer_sections(path: str, meta: Dict[str, str], expected_max_no: int, answer_sections: Dict[int, List[str]], api_settings: Optional[Dict[str, Any]] = None) -> Dict[int, List[str]]:
    if not api_settings or not sanitize_text((api_settings or {}).get("api_key", "")):
        return answer_sections
    if expected_max_no <= 0 or max(answer_sections.keys(), default=0) >= expected_max_no:
        return answer_sections
    doc = fitz.open(path)
    try:
        sliced_lines: List[Tuple[int, str]] = []
        regions = [(0.0, 0.58), (0.52, 1.0)]
        for page_index, page in enumerate(doc):
            page_no = page_index + 1
            text = ocr_page_regions_with_vision(page, api_settings, regions)
            for line in text.split("\n"):
                normalized = compact_line(line)
                if normalized:
                    sliced_lines.append((page_no, normalized))
        recovered_lines = extract_answer_lines(sliced_lines, meta)
        recovered_sections = parse_answer_sections(recovered_lines)
        for question_no, section_lines in recovered_sections.items():
            if question_no not in answer_sections and question_no <= expected_max_no:
                answer_sections[question_no] = section_lines
        return answer_sections
    finally:
        doc.close()


def process_pdf(path: str, output_dir: str, run_tag: str, api_settings: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    meta = parse_meta_from_path(path)
    resolved_output_dir = resolve_output_dir(output_dir, meta, run_tag)
    blocks, page_stats = extract_page_blocks_with_optional_ocr(path, api_settings)
    page_text_preview = build_page_text_preview(blocks)
    lines = blocks_to_lines(blocks)
    answer_lines = extract_answer_lines(lines, meta)
    answer_sections = parse_answer_sections(answer_lines)
    sections, split_warnings = split_written_sections(lines)
    expected_max_no = max((section.question_no for section in sections), default=0)
    answer_sections = recover_missing_answer_sections(path, meta, expected_max_no, answer_sections, api_settings)
    rows: List[Dict[str, Any]] = []
    skipped: List[Dict[str, Any]] = []
    for section in sections:
        row, skipped_type = build_primary_record(meta, section)
        if row is not None:
            rows.append(row)
        else:
            skipped.append({
                "question_no": section.question_no,
                "heading": section.heading,
                "question_type": skipped_type or "unsupported",
            })
    apply_answers_to_rows(rows, answer_sections)
    output_path = os.path.join(resolved_output_dir, build_output_filename(meta))
    if rows:
        write_jsonl(rows, output_path)
    report = {
        "source_file": meta.get("source_file", ""),
        "parser_version": PARSER_VERSION,
        "output_path": output_path if rows else "",
        "record_count": len(rows),
        "page_count": len(page_stats),
        "page_stats": page_stats,
        "page_text_preview": page_text_preview,
        "ocr_needed_pages": [page["page_no"] for page in page_stats if page["needs_ocr"]],
        "warnings": split_warnings,
        "answer_sections": {str(key): value for key, value in answer_sections.items()},
        "detected_sections": [
            {
                "question_no": section.question_no,
                "heading": section.heading,
                "page_no": section.page_no,
                "line_count": len(section.lines),
            }
            for section in sections
        ],
        "skipped_sections": skipped,
        "meta": meta,
    }
    report_path = os.path.join(resolved_output_dir, build_output_filename(meta).replace(".jsonl", "_report.json"))
    with open(report_path, "w", encoding="utf-8") as wf:
        json.dump(report, wf, ensure_ascii=False, indent=2)
    return report




def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract primary-school written exam questions from PDFs.")
    parser.add_argument("--input-dir", default=DEFAULT_INPUT_DIR, help="Directory containing primary-school PDFs.")
    parser.add_argument("--output-dir", default=DEFAULT_OUTPUT_DIR, help="Directory to store extracted JSONL files.")
    parser.add_argument("--limit", type=int, default=0, help="Process at most N PDF files.")
    parser.add_argument("--api-key", default=os.environ.get("MODE7_PRIMARY_PDF_API_KEY", ""), help="Optional API key for vision OCR.")
    parser.add_argument("--base-url", default=os.environ.get("MODE7_PRIMARY_PDF_BASE_URL", DEFAULT_BASE_URL), help="Base URL for optional vision OCR.")
    parser.add_argument("--model", default=os.environ.get("MODE7_PRIMARY_PDF_MODEL", DEFAULT_MODEL), help="Model for optional vision OCR.")
    parser.add_argument("--max-workers", type=int, default=0, help="Max concurrent OCR requests. Defaults to number of available API keys.")
    parser.add_argument("--ocr-cache-dir", default=DEFAULT_OCR_CACHE_DIR, help="Directory to store page-level OCR cache.")
    parser.add_argument("--single-file", default="", help="Run OCR/debug on a single PDF file.")
    parser.add_argument("--single-page", type=int, default=0, help="If set, only extract one page and print its text.")
    return parser.parse_args()


def main() -> None:
    loaded_env_path = load_env_file()
    ensure_dirs()
    args = parse_args()
    input_dir = args.input_dir
    output_dir = args.output_dir
    os.makedirs(output_dir, exist_ok=True)
    run_tag = f"task_{task_timestamp()}"
    files = discover_pdf_files(input_dir)
    if args.single_file:
        files = [args.single_file]
    if args.limit > 0:
        files = files[:args.limit]
    api_keys = discover_api_keys(args.api_key)
    max_workers = args.max_workers if args.max_workers > 0 else len(api_keys)
    ocr_cache_dir = sanitize_text(args.ocr_cache_dir) or DEFAULT_OCR_CACHE_DIR
    os.makedirs(ocr_cache_dir, exist_ok=True)
    api_settings = {
        "api_key": api_keys[0] if api_keys else "",
        "api_keys": api_keys,
        "base_url": args.base_url,
        "model": args.model,
        "max_workers": max_workers,
        "ocr_cache_dir": ocr_cache_dir,
    }
    if args.single_file and args.single_page > 0:
        result = extract_single_page_text(args.single_file, args.single_page, api_settings)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return
    results = [process_pdf(path, output_dir, run_tag, api_settings) for path in files]
    print(json.dumps({
        "parser_version": PARSER_VERSION,
        "loaded_env_path": loaded_env_path or "",
        "input_dir": input_dir,
        "output_dir": output_dir,
        "run_tag": run_tag,
        "file_count": len(files),
        "api_key_count": len(api_keys),
        "max_workers": max_workers,
        "ocr_cache_dir": ocr_cache_dir,
        "reports": results,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
