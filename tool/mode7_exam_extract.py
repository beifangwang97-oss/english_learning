import argparse
import hashlib
import json
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd
import streamlit as st
from openai import OpenAI


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_INPUT_DIR = os.path.join(BASE_DIR, "\u5f85\u5904\u7406\u8bd5\u5377", "\u4eba\u6559\u7248\u521d\u4e2d")
DEFAULT_OUTPUT_DIR = os.path.join(BASE_DIR, "exam_data", "\u4eba\u6559\u7248\u521d\u4e2d")
DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_MODEL = "openai/gpt-4o-mini"
LLM_CLIENT_CACHE: Dict[str, OpenAI] = {}

OPENROUTER_MODEL_OPTIONS = [
    {"id": "openai/gpt-4o-mini", "name": "OpenAI GPT-4o mini", "input_price": "$0.15/M", "output_price": "$0.60/M"},
    {"id": "openai/gpt-4.1-mini", "name": "OpenAI GPT-4.1 mini", "input_price": "$0.40/M", "output_price": "$1.60/M"},
    {"id": "openai/gpt-4.1", "name": "OpenAI GPT-4.1", "input_price": "$2.00/M", "output_price": "$8.00/M"},
    {"id": "openai/gpt-4o", "name": "OpenAI GPT-4o", "input_price": "$2.50/M", "output_price": "$10.00/M"},
    {"id": "google/gemini-2.5-flash-lite", "name": "Google Gemini 2.5 Flash Lite", "input_price": "$0.10/M", "output_price": "$0.40/M"},
    {"id": "google/gemini-2.5-flash", "name": "Google Gemini 2.5 Flash", "input_price": "$0.15/M", "output_price": "$0.60/M"},
    {"id": "google/gemini-2.5-pro", "name": "Google Gemini 2.5 Pro", "input_price": "$1.25/M", "output_price": "$10.00/M"},
    {"id": "qwen/qwen-2.5-vl-72b-instruct", "name": "Qwen 2.5 VL 72B Instruct", "input_price": "See OpenRouter", "output_price": "See OpenRouter"},
]

QUESTION_TYPE_MAP = {
    "single_choice": "single_choice",
    "cloze": "cloze",
    "reading_mcq": "reading",
    "seven_choice": "seven_choice",
}

SHARED_STEM_TEMPLATE = {
    "single_choice": "Choose the best answer from A, B, C and D.",
    "cloze": "Read the passage and choose the best answer for each blank from A, B, C and D.",
    "reading": "Read the passage and choose the best answer from A, B, C and D.",
    "seven_choice": "Choose five proper sentences to complete the dialogue.",
}


def ensure_dirs() -> None:
    os.makedirs(DEFAULT_OUTPUT_DIR, exist_ok=True)


def sanitize_text(value: Any) -> str:
    return str(value or "").strip()


def sanitize_filename(text: str) -> str:
    safe = re.sub(r'[\\/:*?"<>|]+', "_", sanitize_text(text))
    safe = re.sub(r"\s+", "", safe)
    return safe or "unknown"


def compact_line(text: str) -> str:
    return re.sub(r"\s+", " ", sanitize_text(text))


def strip_score_description(text: str) -> str:
    value = sanitize_text(text)
    value = re.sub(r"[（(]\s*共.*?满分.*?[)）]", "", value)
    value = re.sub(r"[（(]\s*共.*?分\s*[)）]", "", value)
    value = re.sub(r"[（(]\s*每小题.*?分\s*[)）]", "", value)
    value = re.sub(r"\s{2,}", " ", value)
    return value.strip()


def normalize_multiline_text(text: str) -> str:
    value = str(text or "").replace("\r\n", "\n").replace("\r", "\n")
    value = value.replace("\u3000", " ")
    value = re.sub(r"[\x00-\x08\x0b-\x1f]", "", value)
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in value.split("\n")]
    while lines and not lines[0]:
        lines.pop(0)
    while lines and not lines[-1]:
        lines.pop()
    joined = "\n".join(lines)
    joined = re.sub(r"\n{3,}", "\n\n", joined)
    return joined.strip()


def make_short_id(seed: str) -> str:
    return hashlib.md5(seed.encode("utf-8")).hexdigest()[:12]


def iso_now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S")


def build_output_filename(book_version: str, grade: str, semester: str, unit: str) -> str:
    return f"{sanitize_filename(book_version)}_{sanitize_filename(grade)}_{sanitize_filename(semester)}_{sanitize_filename(unit)}_\u540c\u6b65\u9898.jsonl"


def parse_source_meta_from_filename(filename: str) -> Dict[str, str]:
    stem = os.path.splitext(os.path.basename(filename))[0]
    match = re.search(
        r"(?P<grade>[\u4e03\u516b\u4e5d]\u5e74\u7ea7)(?P<semester>\u4e0a\u518c|\u4e0b\u518c).*?Unit\s*(?P<unit_no>\d+)",
        stem,
        flags=re.IGNORECASE,
    )
    meta = {
        "book_version": "",
        "grade": "",
        "semester": "",
        "unit": "",
        "unit_no": "",
        "paper_title": stem,
    }
    if not match:
        return meta
    unit_no = match.group("unit_no").strip()
    meta["grade"] = match.group("grade").strip()
    meta["semester"] = match.group("semester").strip()
    meta["unit_no"] = unit_no
    meta["unit"] = f"Unit {unit_no}"
    book = stem[: match.start()].strip()
    meta["book_version"] = book
    return meta


def enrich_source_meta_from_path(path: str, source_meta: Dict[str, str]) -> Dict[str, str]:
    enriched = dict(source_meta)
    parent_name = os.path.basename(os.path.dirname(path))
    if not enriched.get("book_version") and parent_name:
        enriched["book_version"] = sanitize_text(parent_name)
    return enriched


def discover_doc_files(input_dir: str) -> List[str]:
    if not os.path.isdir(input_dir):
        return []
    files: List[str] = []
    for root, _, names in os.walk(input_dir):
        for name in names:
            if name.lower().endswith(".doc") and not name.startswith("~$"):
                files.append(os.path.join(root, name))
    return sorted(files)


def read_doc_text(path: str) -> str:
    with open(path, "rb") as rf:
        raw = rf.read()
    return raw.decode("utf-16le", errors="ignore")


def clean_text(text: str) -> str:
    value = normalize_multiline_text(text)
    value = re.sub(r"[^\S\n]+", " ", value)
    return value


def find_unit_title_positions(full_text: str, paper_title: str) -> List[int]:
    title = sanitize_text(paper_title)
    patterns: List[str] = []
    if title:
        patterns.append(title)
        unit_match = re.search(r"(Unit\s*\d+)", title, flags=re.I)
        if unit_match:
            patterns.append(unit_match.group(1))
    positions: List[int] = []
    for pattern in patterns:
        start = 0
        while pattern:
            idx = full_text.find(pattern, start)
            if idx == -1:
                break
            positions.append(idx)
            start = idx + len(pattern)
    return sorted(set(positions))


def split_paper_and_teacher_text(full_text: str, paper_title: str) -> Tuple[str, str]:
    positions = find_unit_title_positions(full_text, paper_title)
    if len(positions) >= 2:
        return clean_text(full_text[positions[0]:positions[1]]), clean_text(full_text[positions[1]:])
    if positions:
        return clean_text(full_text[positions[0]:]), ""
    return clean_text(full_text), ""


def section_by_regex(text: str, start_pattern: str, end_pattern: str) -> str:
    start = re.search(start_pattern, text, flags=re.S)
    if not start:
        return ""
    content = text[start.end():]
    end = re.search(end_pattern, content, flags=re.S)
    if end:
        content = content[: end.start()]
    return clean_text(content)


def parse_option_rows(block_text: str) -> Dict[str, str]:
    matches = list(re.finditer(r"(?:^|\n)([A-G])\.\s*(.*?)(?=(?:\n[A-G]\.\s)|$)", block_text, flags=re.S))
    options: Dict[str, str] = {}
    for match in matches:
        options[match.group(1)] = compact_line(match.group(2))
    return options


def question_start_pattern(question_no: Optional[int] = None) -> str:
    number = r"\d{1,2}" if question_no is None else str(question_no)
    return rf"(?:^|\n)\s*(?:\(\s*\)\s*)?({number})\."


def is_instruction_line(line: str) -> bool:
    value = sanitize_text(line)
    if not value:
        return False
    if re.match(r"^[A-G](?:\s|\[|$)", value):
        return False
    return any(token in value for token in ["根据", "阅读", "从方框", "从每小题", "选出", "选项", "填入空白处"])


def split_question_blocks(section_text: str, start_no: int, end_no: int) -> List[Tuple[int, str]]:
    starts = list(re.finditer(question_start_pattern(), section_text))
    rows: List[Tuple[int, str]] = []
    for idx, match in enumerate(starts):
        question_no = int(match.group(1))
        if question_no < start_no or question_no > end_no:
            continue
        start_idx = match.start()
        end_idx = starts[idx + 1].start() if idx + 1 < len(starts) else len(section_text)
        rows.append((question_no, section_text[start_idx:end_idx].strip()))
    return rows


def truncate_at_next_material_or_section(text: str) -> str:
    patterns = [
        r"(?:\n|^)\s*[A-F](?:\s*\[[^\]]+\])?\s*(?:\n|$)",
        r"(?:\n|^)第二节\s*阅读",
        r"(?:\n|^)第三部分",
        r"(?:\n|^)\bIX\.",
        r"(?:\n|^)\bX\.",
    ]
    end_idx = len(text)
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.S)
        if match:
            end_idx = min(end_idx, match.start())
    return text[:end_idx].strip()


def parse_mcq_block(block_text: str, expect_stem: bool = True) -> Tuple[str, Dict[str, str]]:
    content_match = re.search(rf"{question_start_pattern()}\s*(.*)$", block_text, flags=re.S)
    if not content_match:
        return "", {}
    content = truncate_at_next_material_or_section(content_match.group(2).strip())
    option_positions = list(re.finditer(r"(?<![A-Za-z])([A-D])\.\s*", content))
    if not option_positions:
        return (compact_line(content) if expect_stem else ""), {}
    stem = content[: option_positions[0].start()].strip() if expect_stem else ""
    options: Dict[str, str] = {}
    for idx, match in enumerate(option_positions):
        start_idx = match.end()
        end_idx = option_positions[idx + 1].start() if idx + 1 < len(option_positions) else len(content)
        options[match.group(1)] = compact_line(truncate_at_next_material_or_section(content[start_idx:end_idx]))
    return compact_line(stem), options


def parse_choice_questions(section_text: str, start_no: int, end_no: int, expect_stem: bool = True) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for question_no, block in split_question_blocks(section_text, start_no, end_no):
        stem, options = parse_mcq_block(block, expect_stem=expect_stem)
        rows.append({"question_no": question_no, "stem": stem, "options": options})
    return rows


def first_question_index(text: str, question_no: int) -> int:
    match = re.search(question_start_pattern(question_no), text)
    return match.start() if match else -1


def split_first_line_and_rest(text: str) -> Tuple[str, str]:
    lines = [line.strip() for line in normalize_multiline_text(text).split("\n") if line.strip()]
    if not lines:
        return "", ""
    shared_lines = [strip_score_description(lines[0])]
    rest_start = 1
    if len(lines) > 1 and is_instruction_line(lines[1]):
        shared_lines.append(strip_score_description(lines[1]))
        rest_start = 2
    shared_stem = compact_line(" ".join(line for line in shared_lines if line))
    rest = "\n".join(lines[rest_start:]).strip()
    return shared_stem, rest


def parse_single_choice_section(section_text: str) -> Tuple[List[Dict[str, Any]], str]:
    start_idx = first_question_index(section_text, 21)
    header = section_text[:start_idx].strip() if start_idx != -1 else ""
    shared_stem = strip_score_description(compact_line(header))
    return parse_choice_questions(section_text, 21, 30, expect_stem=True), shared_stem


def split_cloze_shared_and_material(section_text: str) -> Tuple[str, str, str]:
    q31_idx = first_question_index(section_text, 31)
    if q31_idx == -1:
        return "", "", ""
    head = section_text[:q31_idx].strip()
    b_label = re.search(r"(?:^|\n)\s*B(?:\s*\[[^\]]+\])?\s*(?:\n|$)", head)
    if b_label:
        a_head = head[: b_label.start()].strip()
        b_head = head[b_label.end():].strip()
    else:
        a_head = head
        b_head = ""
    shared_stem, material_a = split_first_line_and_rest(a_head)
    return shared_stem, material_a, b_head


def parse_cloze_section(section_text: str) -> Tuple[List[Dict[str, Any]], Dict[str, str], str]:
    q31_idx = first_question_index(section_text, 31)
    q41_idx = first_question_index(section_text, 41)
    b_label_match = re.search(r"(?:^|\n)\s*B(?:\s*\[[^\]]+\])?\s*(?:\n|$)", section_text)
    shared_stem, material_a, _ = split_cloze_shared_and_material(section_text)
    material_b = ""
    if b_label_match and q41_idx != -1:
        material_b = normalize_multiline_text(section_text[b_label_match.end():q41_idx])
    materials = {
        "A": normalize_multiline_text(material_a),
        "B": material_b,
    }
    rows: List[Dict[str, Any]] = []
    if q31_idx != -1 and q41_idx != -1:
        rows.extend(parse_choice_questions(section_text[q31_idx:q41_idx], 31, 40, expect_stem=False))
        rows.extend(parse_choice_questions(section_text[q41_idx:], 41, 50, expect_stem=False))
    return rows, materials, shared_stem


def parse_seven_choice_section(section_text: str) -> Tuple[List[Dict[str, Any]], str, str]:
    q51_idx = first_question_index(section_text, 51)
    options_match = re.search(r"(?:^|\n)A\.\s.*$", section_text, flags=re.S)
    before_options = section_text[: options_match.start()].strip() if options_match else section_text[:q51_idx].strip() if q51_idx != -1 else section_text
    shared_stem, material = split_first_line_and_rest(before_options)
    options = parse_option_rows(options_match.group(0)) if options_match else {}
    rows = [{"question_no": q_no, "stem": "", "options": options} for q_no in range(51, 56)]
    return rows, normalize_multiline_text(material), shared_stem


def parse_reading_section(section_text: str) -> Tuple[List[Dict[str, Any]], Dict[str, str], List[Dict[str, Any]], str]:
    shared_stem = ""
    label_a = re.search(r"(?:^|\n)\s*A(?:\s*\[[^\]]+\])?\s*(?:\n|$)", section_text)
    if label_a:
        shared_stem = strip_score_description(compact_line(section_text[: label_a.start()]))

    ranges = {"A": (56, 58), "B": (59, 61), "C": (62, 65), "D": (66, 68), "E": (69, 72), "F": (73, 75)}
    materials: Dict[str, str] = {}
    mcq_rows: List[Dict[str, Any]] = []
    qa_rows: List[Dict[str, Any]] = []

    for label, (start_no, _) in ranges.items():
        label_pattern = re.compile(rf"(?:^|\n)\s*{label}(?:\s*\[[^\]]+\])?\s*(?:\n|$)", flags=re.S)
        label_match = label_pattern.search(section_text)
        if not label_match:
            continue
        question_idx = first_question_index(section_text[label_match.end():], start_no)
        if question_idx == -1:
            continue
        materials[label] = normalize_multiline_text(section_text[label_match.end(): label_match.end() + question_idx])

    for label, (start_no, end_no) in list(ranges.items())[:5]:
        q_start = first_question_index(section_text, start_no)
        if q_start == -1:
            continue
        next_start = first_question_index(section_text[q_start + 1:], end_no + 1) if end_no < 72 else first_question_index(section_text[q_start + 1:], 73)
        block_text = section_text[q_start:] if next_start == -1 else section_text[q_start: q_start + 1 + next_start]
        for row in parse_choice_questions(block_text, start_no, end_no, expect_stem=True):
            row["material_label"] = label
            mcq_rows.append(row)

    qa_pattern = re.compile(r"(?ms)(7[3-5])\.\s*(.*?)(?=(?:\n\s*7[3-5]\.)|(?:\n\s*IX\.)|(?:\n\s*X\.)|$)")
    for match in qa_pattern.finditer(section_text):
        q_no = int(match.group(1))
        qa_rows.append({"question_no": q_no, "stem": compact_line(match.group(2)), "material_label": "F"})
    return mcq_rows, materials, qa_rows, shared_stem


def parse_numbered_entries(section_text: str, stop_markers: List[str]) -> Dict[int, str]:
    end_idx = len(section_text)
    for marker in stop_markers:
        pos = section_text.find(marker)
        if pos != -1:
            end_idx = min(end_idx, pos)
    body = section_text[:end_idx]
    pattern = re.compile(r"(?ms)(\d{1,3})\.\s*(.*?)(?=(?<!\d)\d{1,3}\.\s|[A-F]\)\s*【主旨大意】|[IVX]+\.\s|$)")
    entries: Dict[int, str] = {}
    for match in pattern.finditer(body):
        entries[int(match.group(1))] = compact_line(match.group(2))
    return entries


def parse_answer_and_explanation(raw: str) -> Tuple[str, str]:
    value = sanitize_text(raw)
    if not value:
        return "", ""
    patterns = [
        r"^(?:答案[:：]?\s*)?([A-G])(?:\s*[/／]\s*([A-G]))?(?:[\.．、]|\s+)?(?:解析[:：]?\s*)?(.*)$",
        r"^([A-G])(?:\s*[/／]\s*([A-G]))?\s*(.*)$",
    ]
    for pattern in patterns:
        match = re.match(pattern, value, flags=re.I)
        if match:
            answer = match.group(1).upper()
            if match.group(2):
                answer = f"{answer}/{match.group(2).upper()}"
            explanation = sanitize_text(match.group(3))
            return answer, explanation
    return value, ""


def parse_seven_choice_answers(section_text: str) -> Dict[int, Dict[str, str]]:
    result: Dict[int, Dict[str, str]] = {}
    sequence = re.search(r"51-55\s*([A-G]{5})", section_text)
    if sequence:
        for idx, letter in enumerate(sequence.group(1)):
            result[51 + idx] = {"answer": letter, "explanation": ""}

    entries = parse_numbered_entries(section_text, ["VIII."])
    for q_no in range(51, 56):
        raw = entries.get(q_no, "")
        if raw:
            answer, explanation = parse_answer_and_explanation(raw)
            if answer:
                result[q_no] = {"answer": answer, "explanation": explanation}
    return result


def parse_main_idea_entries(section_text: str, stop_markers: List[str]) -> Dict[str, str]:
    end_idx = len(section_text)
    for marker in stop_markers:
        pos = section_text.find(marker)
        if pos != -1:
            end_idx = min(end_idx, pos)
    body = section_text[:end_idx]
    pattern = re.compile(r"([A-F])\)\s*【主旨大意】(.*?)(?=(?:\n\s*[A-F]\)\s*【主旨大意】)|(?:\n\s*\d{1,3}\.)|$)", flags=re.S)
    result: Dict[str, str] = {}
    for match in pattern.finditer(body):
        result[match.group(1)] = compact_line(match.group(2))
    return result


def material_row(material_id: str, label: str, question_type: str, material_text: str, shared_stem: str, meta: Dict[str, str], explanation: str = "") -> Dict[str, Any]:
    return {
        "record_type": "material",
        "material_id": material_id,
        "material_label": label,
        "question_type": question_type,
        "material_text": normalize_multiline_text(material_text),
        "material_explanation": compact_line(explanation),
        "shared_stem": strip_score_description(shared_stem),
        "book_version": meta.get("book_version", ""),
        "grade": meta.get("grade", ""),
        "semester": meta.get("semester", ""),
        "unit": meta.get("unit", ""),
    }


def question_row(question_no: int, question_type: str, stem: str, options: Optional[Dict[str, str]], meta: Dict[str, str], material_id: str = "", answer: str = "", explanation: str = "") -> Dict[str, Any]:
    return {
        "record_type": "question",
        "question_no": question_no,
        "question_type": question_type,
        "stem": compact_line(stem),
        "material_id": material_id,
        "answer": sanitize_text(answer),
        "explanation": compact_line(explanation),
        "book_version": meta.get("book_version", ""),
        "grade": meta.get("grade", ""),
        "semester": meta.get("semester", ""),
        "unit": meta.get("unit", ""),
        "options": [{"key": key, "text": text} for key, text in (options or {}).items()],
    }


def build_material_id(meta: Dict[str, str], question_type: str, label: str) -> str:
    return make_short_id(f"{meta.get('book_version')}|{meta.get('grade')}|{meta.get('semester')}|{meta.get('unit')}|{question_type}|{label}")


def extract_paper_rows(path: str) -> List[Dict[str, Any]]:
    source_meta = enrich_source_meta_from_path(path, parse_source_meta_from_filename(os.path.basename(path)))
    full_text = read_doc_text(path)
    paper_text, teacher_text = split_paper_and_teacher_text(full_text, source_meta.get("paper_title", ""))

    rows: List[Dict[str, Any]] = [{
        "record_type": "meta",
        "book_version": source_meta.get("book_version", ""),
        "grade": source_meta.get("grade", ""),
        "semester": source_meta.get("semester", ""),
        "unit": source_meta.get("unit", ""),
        "source_file": os.path.basename(path),
    }]

    paper_v = section_by_regex(paper_text, r"\bV\.", r"\bVI\.")
    paper_vi = section_by_regex(paper_text, r"\bVI\.", r"\bVII\.")
    paper_vii = section_by_regex(paper_text, r"\bVII\.", r"\bVIII\.")
    paper_viii = section_by_regex(paper_text, r"\bVIII\.", r"\bIX\.|\bX\.|$")

    teacher_v = section_by_regex(teacher_text, r"\bV\.", r"\bVI\.")
    teacher_vi = section_by_regex(teacher_text, r"\bVI\.", r"\bVII\.")
    teacher_vii = section_by_regex(teacher_text, r"\bVII\.", r"\bVIII\.")
    teacher_viii = section_by_regex(teacher_text, r"\bVIII\.", r"\bIX\.|\bX\.|$")

    single_rows, single_shared = parse_single_choice_section(paper_v)
    single_answers = parse_numbered_entries(teacher_v, ["VI."])
    for item in single_rows:
        answer, explanation = parse_answer_and_explanation(single_answers.get(item["question_no"], ""))
        rows.append(question_row(item["question_no"], "single_choice", item["stem"] or single_shared, item["options"], source_meta, answer=answer, explanation=explanation))

    cloze_rows, cloze_materials, cloze_shared = parse_cloze_section(paper_vi)
    cloze_answers = parse_numbered_entries(teacher_vi, ["VII."])
    cloze_main_ideas = parse_main_idea_entries(teacher_vi, ["VII."])
    cloze_material_ids = {"A": build_material_id(source_meta, "cloze", "A"), "B": build_material_id(source_meta, "cloze", "B")}
    rows.append(material_row(cloze_material_ids["A"], "A", "cloze", cloze_materials.get("A", ""), cloze_shared, source_meta, cloze_main_ideas.get("A", "")))
    rows.append(material_row(cloze_material_ids["B"], "B", "cloze", cloze_materials.get("B", ""), cloze_shared, source_meta, cloze_main_ideas.get("B", "")))
    for item in cloze_rows:
        label = "A" if item["question_no"] <= 40 else "B"
        answer, explanation = parse_answer_and_explanation(cloze_answers.get(item["question_no"], ""))
        rows.append(question_row(item["question_no"], "cloze", item["stem"], item["options"], source_meta, material_id=cloze_material_ids[label], answer=answer, explanation=explanation))

    seven_rows, seven_material, seven_shared = parse_seven_choice_section(paper_vii)
    seven_answers = parse_seven_choice_answers(teacher_vii)
    seven_material_id = build_material_id(source_meta, "seven_choice", "dialogue")
    rows.append(material_row(seven_material_id, "dialogue", "seven_choice", seven_material, seven_shared, source_meta))
    for item in seven_rows:
        info = seven_answers.get(item["question_no"], {})
        rows.append(question_row(item["question_no"], "seven_choice", item["stem"], item["options"], source_meta, material_id=seven_material_id, answer=info.get("answer", ""), explanation=info.get("explanation", "")))

    reading_rows, reading_materials, reading_qa_rows, reading_shared = parse_reading_section(paper_viii)
    reading_answers = parse_numbered_entries(teacher_viii, ["IX.", "X."])
    reading_main_ideas = parse_main_idea_entries(teacher_viii, ["IX.", "X."])
    reading_material_ids = {label: build_material_id(source_meta, "reading", label) for label in reading_materials}
    for label, material_text in reading_materials.items():
        rows.append(material_row(reading_material_ids[label], label, "reading", material_text, reading_shared, source_meta, reading_main_ideas.get(label, "")))
    for item in reading_rows:
        answer, explanation = parse_answer_and_explanation(reading_answers.get(item["question_no"], ""))
        rows.append(question_row(item["question_no"], "reading_mcq", item["stem"], item["options"], source_meta, material_id=reading_material_ids.get(item.get("material_label", ""), ""), answer=answer, explanation=explanation))
    for item in reading_qa_rows:
        rows.append(question_row(item["question_no"], "reading_qa", item["stem"], None, source_meta, material_id=reading_material_ids.get("F", "")))

    return rows


def get_openai_client(api_key: str, base_url: str) -> OpenAI:
    cache_key = f"{base_url}|{api_key}"
    if cache_key not in LLM_CLIENT_CACHE:
        LLM_CLIENT_CACHE[cache_key] = OpenAI(api_key=api_key, base_url=base_url)
    return LLM_CLIENT_CACHE[cache_key]


def parse_api_keys(primary_key: str, multi_text: str) -> List[str]:
    keys: List[str] = []
    if sanitize_text(primary_key):
        keys.append(sanitize_text(primary_key))
    if sanitize_text(multi_text):
        for line in re.split(r"[\r\n,;]+", multi_text):
            key = sanitize_text(line)
            if key:
                keys.append(key)
    deduped: List[str] = []
    seen = set()
    for key in keys:
        if key in seen:
            continue
        deduped.append(key)
        seen.add(key)
    return deduped


def options_to_dict(options: Any) -> Dict[str, str]:
    if isinstance(options, dict):
        return {str(key): compact_line(value) for key, value in options.items() if sanitize_text(key) and sanitize_text(value)}
    if isinstance(options, list):
        mapped: Dict[str, str] = {}
        for item in options:
            if not isinstance(item, dict):
                continue
            key = sanitize_text(item.get("key"))
            text = compact_line(item.get("text", ""))
            if key and text:
                mapped[key] = text
        return mapped
    return {}


def dict_to_option_list(options: Dict[str, str]) -> List[Dict[str, str]]:
    return [{"key": key, "text": text} for key, text in sorted(options.items())]


def has_complete_options(row: Dict[str, Any]) -> bool:
    options = options_to_dict(row.get("options"))
    return list(options.keys())[:4] == ["A", "B", "C", "D"] and all(options.get(key) for key in ["A", "B", "C", "D"])


def should_enhance_row(row: Dict[str, Any]) -> bool:
    question_type = sanitize_text(row.get("question_type"))
    if question_type not in {"single_choice", "cloze", "reading", "seven_choice"}:
        return False
    if not compact_line(row.get("analysis", "")):
        return True
    if question_type == "reading" and (not compact_line(row.get("stem", "")) or not has_complete_options(row)):
        return True
    return False


def render_model_selector(label: str, default_model_id: str, widget_key: str) -> str:
    options = [
        f"{item['name']} | {item['id']} | input {item['input_price']} | output {item['output_price']}"
        for item in OPENROUTER_MODEL_OPTIONS
    ]
    label_to_id = {options[idx]: OPENROUTER_MODEL_OPTIONS[idx]["id"] for idx in range(len(options))}
    default_label = next((key for key, value in label_to_id.items() if value == default_model_id), options[0])
    selected = st.multiselect(label, options=options, default=[default_label], max_selections=1, key=widget_key)
    return label_to_id[selected[0]] if selected else default_model_id


def build_group_uid(row: Dict[str, Any], material_text: str) -> str:
    if material_text:
        return make_short_id(f"{row.get('question_type')}|{material_text}")
    return make_short_id(f"{row.get('book_version')}|{row.get('grade')}|{row.get('semester')}|{row.get('unit')}|{row.get('question_type')}|{row.get('question_no')}")


def fill_question_with_api(row: Dict[str, Any], api_settings: Dict[str, Any], api_key: str) -> Dict[str, Any]:
    if not api_settings.get("enable_api") or not api_key:
        return {}
    client = get_openai_client(api_key, api_settings["base_url"])
    option_lines = "\n".join(f"{key}. {text}" for key, text in options_to_dict(row.get("options")).items())
    prompt = f"""You are helping repair structured English exam data.

Please repair the current question fields:
1. `analysis`: concise explanation grounded in the source.
2. `stem`: complete it only when the current stem is missing or obviously broken.
3. `options`: if the current options are not a complete A/B/C/D set, try to restore four options.

Rules:
- Return JSON only.
- Stay as faithful as possible to the provided material.
- If the original question is a structure / route / picture question and the original visual choices are missing,
  you may reconstruct textual options from context and set `notes` to `reconstructed_from_context`.
- If recovery is unreliable, keep existing content instead of inventing aggressively.

question_type: {row.get('question_type', '')}
shared_stem: {row.get('shared_stem', '')}
material:
{row.get('material', '')}

current_stem: {row.get('stem', '')}
current_options:
{option_lines}
answer: {row.get('answer', {}).get('value', '')}
current_analysis: {row.get('analysis', '')}

Return:
{{
  "stem": "...",
  "options": {{"A": "...", "B": "...", "C": "...", "D": "..."}},
  "analysis": "...",
  "notes": ""
}}
"""
    response = client.chat.completions.create(
        model=api_settings["model_id"],
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
    )
    text = sanitize_text(response.choices[0].message.content if response.choices else "")
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?", "", text).strip()
        text = re.sub(r"```$", "", text).strip()
    try:
        payload = json.loads(text)
        normalized_options = options_to_dict(payload.get("options"))
        result: Dict[str, Any] = {}
        if compact_line(payload.get("stem", "")):
            result["stem"] = compact_line(payload.get("stem", ""))
        if normalized_options:
            result["options"] = dict_to_option_list(normalized_options)
        if compact_line(payload.get("analysis", "")):
            result["analysis"] = compact_line(payload.get("analysis", ""))
        if compact_line(payload.get("notes", "")):
            result["notes"] = compact_line(payload.get("notes", ""))
        return result
    except Exception:
        return {}


def build_enhancement_tasks(normalized_rows: List[Dict[str, Any]]) -> List[int]:
    return [idx for idx, row in enumerate(normalized_rows) if should_enhance_row(row)]


def run_parallel_enhancement(normalized_rows: List[Dict[str, Any]], api_settings: Dict[str, Any]) -> Dict[str, int]:
    api_keys = api_settings.get("api_keys") or []
    if not api_settings.get("enable_api") or not api_keys:
        return {"analysis": 0, "question_fields": 0}

    task_indexes = build_enhancement_tasks(normalized_rows)
    if not task_indexes:
        return {"analysis": 0, "question_fields": 0}

    counters = {"analysis": 0, "question_fields": 0}
    task_queue = list(task_indexes)
    max_workers = min(len(api_keys), len(task_queue))
    if max_workers <= 0:
        return counters

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_map = {}
        for api_key in api_keys[:max_workers]:
            if not task_queue:
                break
            row_index = task_queue.pop(0)
            future = executor.submit(fill_question_with_api, normalized_rows[row_index], api_settings, api_key)
            future_map[future] = (row_index, api_key)

        while future_map:
            for future in as_completed(list(future_map.keys())):
                row_index, api_key = future_map.pop(future)
                try:
                    payload = future.result() or {}
                except Exception:
                    payload = {}
                if payload:
                    updated = False
                    if compact_line(payload.get("analysis", "")) and not compact_line(normalized_rows[row_index].get("analysis", "")):
                        normalized_rows[row_index]["analysis"] = compact_line(payload["analysis"])
                        counters["analysis"] += 1
                        updated = True
                    if compact_line(payload.get("stem", "")) and not compact_line(normalized_rows[row_index].get("stem", "")):
                        normalized_rows[row_index]["stem"] = compact_line(payload["stem"])
                        updated = True
                    if payload.get("options") and not has_complete_options(normalized_rows[row_index]):
                        normalized_rows[row_index]["options"] = payload["options"]
                        updated = True
                    if compact_line(payload.get("notes", "")):
                        note = compact_line(payload["notes"])
                        existing = compact_line(normalized_rows[row_index].get("remarks", ""))
                        normalized_rows[row_index]["remarks"] = f"{existing} | {note}".strip(" |")
                    if updated:
                        counters["question_fields"] += 1
                if task_queue:
                    next_row_index = task_queue.pop(0)
                    next_future = executor.submit(fill_question_with_api, normalized_rows[next_row_index], api_settings, api_key)
                    future_map[next_future] = (next_row_index, api_key)
                break

    return counters


def normalize_rows(raw_rows: List[Dict[str, Any]], api_settings: Optional[Dict[str, Any]] = None) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    api_settings = api_settings or {}
    meta_row = next((row for row in raw_rows if row.get("record_type") == "meta"), {})
    material_map = {
        sanitize_text(row.get("material_id")): row
        for row in raw_rows
        if row.get("record_type") == "material" and sanitize_text(row.get("material_id"))
    }
    question_rows = [row for row in raw_rows if row.get("record_type") == "question"]

    normalized_rows: List[Dict[str, Any]] = []
    counts_by_type: Dict[str, int] = {}
    missing_answers: List[int] = []
    missing_analysis: List[int] = []
    missing_scope: List[int] = []
    duplicate_question_uids: List[str] = []
    skipped_unsupported: List[Dict[str, Any]] = []
    seen_question_uids = set()
    api_filled_analysis_count = 0
    api_enhanced_question_count = 0

    for row in question_rows:
        mapped_type = QUESTION_TYPE_MAP.get(sanitize_text(row.get("question_type")))
        question_no = int(row.get("question_no", 0) or 0)
        if not mapped_type:
            skipped_unsupported.append({"question_no": question_no, "question_type": row.get("question_type", "")})
            continue

        material_ref = material_map.get(sanitize_text(row.get("material_id")), {})
        material_text = normalize_multiline_text(material_ref.get("material_text", ""))
        shared_stem = strip_score_description(compact_line(material_ref.get("shared_stem", ""))) or SHARED_STEM_TEMPLATE.get(mapped_type, "")
        stem = compact_line(row.get("stem", ""))
        options = row.get("options") if isinstance(row.get("options"), list) else []
        answer_value = sanitize_text(row.get("answer"))
        analysis = compact_line(row.get("explanation", ""))
        if not analysis and compact_line(material_ref.get("material_explanation", "")):
            analysis = compact_line(material_ref.get("material_explanation", ""))

        current_meta = {
            "book_version": sanitize_text(row.get("book_version")) or sanitize_text(meta_row.get("book_version")),
            "grade": sanitize_text(row.get("grade")) or sanitize_text(meta_row.get("grade")),
            "semester": sanitize_text(row.get("semester")) or sanitize_text(meta_row.get("semester")),
            "unit": sanitize_text(row.get("unit")) or sanitize_text(meta_row.get("unit")),
        }

        group_uid = build_group_uid({"question_type": mapped_type, **current_meta, "question_no": question_no}, material_text or shared_stem)
        question_uid = make_short_id(f"{group_uid}|{question_no}|{answer_value}|{stem}")
        if question_uid in seen_question_uids:
            duplicate_question_uids.append(question_uid)
        seen_question_uids.add(question_uid)

        normalized = {
            "question_uid": question_uid,
            "group_uid": group_uid,
            "source_type": "sync_test",
            "source_file": sanitize_text(meta_row.get("source_file")),
            "parser_version": "mode7_v3",
            "question_type": mapped_type,
            "question_no": question_no,
            "book_version": current_meta["book_version"],
            "grade": current_meta["grade"],
            "semester": current_meta["semester"],
            "unit": current_meta["unit"],
            "exam_scene": "同步测试",
            "knowledge_tags": [],
            "difficulty": None,
            "shared_stem": shared_stem,
            "material": material_text,
            "stem": stem,
            "options": options,
            "answer": {"type": "single", "value": answer_value},
            "analysis": analysis,
            "status": "draft",
            "created_at": iso_now(),
            "remarks": "",
        }

        if not all(current_meta.values()):
            missing_scope.append(question_no)
        if not answer_value:
            missing_answers.append(question_no)

        normalized_rows.append(normalized)
        counts_by_type[mapped_type] = counts_by_type.get(mapped_type, 0) + 1

    enhancement_stats = run_parallel_enhancement(normalized_rows, api_settings)
    api_filled_analysis_count += int(enhancement_stats.get("analysis", 0) or 0)
    api_enhanced_question_count += int(enhancement_stats.get("question_fields", 0) or 0)

    missing_analysis = [
        int(row.get("question_no", 0) or 0)
        for row in normalized_rows
        if not compact_line(row.get("analysis", ""))
    ]

    report = {
        "source_file": sanitize_text(meta_row.get("source_file")),
        "question_count": len(normalized_rows),
        "counts_by_type": counts_by_type,
        "missing_answers": missing_answers,
        "missing_analysis": missing_analysis,
        "missing_scope": missing_scope,
        "duplicate_question_uids": duplicate_question_uids,
        "skipped_unsupported": skipped_unsupported,
        "api_filled_analysis_count": api_filled_analysis_count,
        "api_enhanced_question_count": api_enhanced_question_count,
    }
    return normalized_rows, report


def write_jsonl(rows: List[Dict[str, Any]], output_path: str) -> None:
    with open(output_path, "w", encoding="utf-8") as wf:
        for row in rows:
            wf.write(json.dumps(row, ensure_ascii=False) + "\n")


def write_report(report: Dict[str, Any], report_path: str) -> None:
    with open(report_path, "w", encoding="utf-8") as wf:
        json.dump(report, wf, ensure_ascii=False, indent=2)


def process_one_file(path: str, output_dir: str, api_settings: Optional[Dict[str, Any]] = None) -> Tuple[str, str, Dict[str, Any]]:
    raw_rows = extract_paper_rows(path)
    normalized_rows, report = normalize_rows(raw_rows, api_settings)
    meta = next((row for row in raw_rows if row.get("record_type") == "meta"), {})
    output_name = build_output_filename(meta.get("book_version", ""), meta.get("grade", ""), meta.get("semester", ""), meta.get("unit", ""))
    output_path = os.path.join(output_dir, output_name)
    report_path = output_path.replace(".jsonl", "_report.json")
    write_jsonl(normalized_rows, output_path)
    write_report(report, report_path)
    return output_path, report_path, report


def load_jsonl_preview(path: str, limit: int = 20) -> List[Dict[str, Any]]:
    if not path or not os.path.exists(path):
        return []
    rows: List[Dict[str, Any]] = []
    with open(path, "r", encoding="utf-8") as rf:
        for idx, line in enumerate(rf):
            if idx >= limit:
                break
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def build_preview_rows(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    preview: List[Dict[str, Any]] = []
    for row in rows:
        preview.append(
            {
                "question_no": row.get("question_no", ""),
                "question_type": row.get("question_type", ""),
                "group_uid": row.get("group_uid", ""),
                "answer": row.get("answer", {}).get("value", "") if isinstance(row.get("answer"), dict) else "",
                "shared_stem": row.get("shared_stem", ""),
                "stem": row.get("stem", ""),
            }
        )
    return preview


def upsert_result(results: List[Dict[str, Any]], payload: Dict[str, Any]) -> None:
    file_key = payload.get("file_key") or payload.get("source_path") or payload.get("file_name", "")
    for idx, row in enumerate(results):
        row_key = row.get("file_key") or row.get("source_path") or row.get("file_name", "")
        if row_key == file_key:
            merged = dict(row)
            merged.update(payload)
            results[idx] = merged
            return
    results.append(payload)


def render_app() -> None:
    st.set_page_config(page_title="Tiger English - Mode7 Sync Question Bank Tool", layout="wide", page_icon="T")
    st.markdown(
        """
<style>
    .stTabs [data-baseweb="tab-list"] { gap: 8px; }
    .stTabs [data-baseweb="tab"] { height: 50px; padding-left: 20px; padding-right: 20px; font-weight: 500; }
    .stTabs [aria-selected="true"] { background-color: #1f77b4; color: white; }
</style>
""",
        unsafe_allow_html=True,
    )
    st.title("Mode7 Sync Question Extractor")
    st.caption("Extract .doc sync tests into JSONL and use multi-key API enhancement for incomplete reading questions and missing analyses.")

    if "mode7_results" not in st.session_state:
        st.session_state.mode7_results = []

    with st.sidebar:
        st.header("Model Settings")
        enable_api = st.checkbox("Enable API Enhancement", value=False)
        api_key = st.text_input("Primary API Key", value="", type="password")
        extra_api_keys = st.text_area("Extra API Keys", value="", height=140, placeholder="One key per line")
        base_url = st.text_input("Base URL", value=DEFAULT_BASE_URL)
        model_id = render_model_selector("Model", DEFAULT_MODEL, "mode7_model")
        st.caption(f"Current model: `{model_id}`")
        api_keys = parse_api_keys(api_key, extra_api_keys)
        st.caption(f"Available API keys: {len(api_keys)}")
        st.divider()
        st.header("Directory Settings")
        input_dir = st.text_input("Input Directory", value=DEFAULT_INPUT_DIR)
        output_dir = st.text_input("Output Directory", value=DEFAULT_OUTPUT_DIR)
        st.caption("The tool scans .doc files recursively under the input directory.")

    api_settings = {
        "enable_api": enable_api,
        "api_key": api_key,
        "api_keys": api_keys,
        "base_url": base_url,
        "model_id": model_id,
    }

    files = discover_doc_files(input_dir)
    c1, c2, c3 = st.columns(3)
    c1.metric("Pending Files", len(files))
    c2.metric("API Enhancement", "Enabled" if enable_api else "Disabled")
    c3.metric("Output Directory", "Ready" if os.path.isdir(output_dir) else "Will Create")

    with st.expander("Pending File List", expanded=False):
        if files:
            st.dataframe(pd.DataFrame({"File Name": [os.path.basename(path) for path in files], "Full Path": files}), use_container_width=True, hide_index=True)
        else:
            st.info("No .doc files were found in the current input directory.")

    if st.button("Start Extraction", type="primary", use_container_width=True):
        if not os.path.isdir(input_dir):
            st.error("Input directory does not exist.")
        elif not files:
            st.warning("No .doc files are available for processing.")
        else:
            os.makedirs(output_dir, exist_ok=True)
            progress = st.progress(0.0)
            status_box = st.empty()
            results: List[Dict[str, Any]] = []
            for idx, source_path in enumerate(files, start=1):
                file_name = os.path.basename(source_path)
                status_box.info(f"Processing: {file_name} ({idx}/{len(files)})")
                upsert_result(
                    results,
                    {
                        "file_key": source_path,
                        "source_path": source_path,
                        "file_name": file_name,
                        "status": "running",
                        "output_path": "",
                        "report_path": "",
                        "question_count": 0,
                        "skipped_count": 0,
                        "api_filled_analysis_count": 0,
                        "api_enhanced_question_count": 0,
                        "report": {},
                    },
                )
                try:
                    output_path, report_path, report = process_one_file(source_path, output_dir, api_settings)
                    upsert_result(
                        results,
                        {
                            "file_key": source_path,
                            "source_path": source_path,
                            "file_name": file_name,
                            "status": "ok",
                            "output_path": output_path,
                            "report_path": report_path,
                            "question_count": int(report.get("question_count", 0) or 0),
                            "skipped_count": len(report.get("skipped_unsupported", []) or []),
                            "api_filled_analysis_count": int(report.get("api_filled_analysis_count", 0) or 0),
                            "api_enhanced_question_count": int(report.get("api_enhanced_question_count", 0) or 0),
                            "report": report,
                        },
                    )
                except Exception as exc:
                    upsert_result(
                        results,
                        {
                            "file_key": source_path,
                            "source_path": source_path,
                            "file_name": file_name,
                            "status": "error",
                            "output_path": "",
                            "report_path": "",
                            "question_count": 0,
                            "skipped_count": 0,
                            "api_filled_analysis_count": 0,
                            "api_enhanced_question_count": 0,
                            "report": {},
                            "error": str(exc),
                        },
                    )
                progress.progress(idx / len(files))
            st.session_state.mode7_results = results
            status_box.success("Processing finished.")

    results = st.session_state.mode7_results
    if results:
        success_count = sum(1 for row in results if row.get("status") == "ok")
        total_questions = sum(int(row.get("question_count", 0) or 0) for row in results)
        total_skipped = sum(int(row.get("skipped_count", 0) or 0) for row in results)
        total_api_filled = sum(int(row.get("api_filled_analysis_count", 0) or 0) for row in results)
        total_api_enhanced = sum(int(row.get("api_enhanced_question_count", 0) or 0) for row in results)
        m1, m2, m3, m4 = st.columns(4)
        m1.metric("Success Files", success_count)
        m2.metric("Questions", total_questions)
        m3.metric("Skipped", total_skipped)
        m4.metric("API Enhanced", total_api_enhanced)
        st.caption(f"Analyses filled by API: {total_api_filled}")

        st.subheader("Results")
        st.dataframe(
            pd.DataFrame(
                [
                    {
                        "File Name": row.get("file_name", ""),
                        "Status": row.get("status", ""),
                        "Questions": row.get("question_count", 0),
                        "Skipped": row.get("skipped_count", 0),
                        "API Analysis": row.get("api_filled_analysis_count", 0),
                        "API Enhanced": row.get("api_enhanced_question_count", 0),
                        "JSONL": row.get("output_path", ""),
                        "Report": row.get("report_path", ""),
                        "Error": row.get("error", ""),
                    }
                    for row in results
                ]
            ),
            use_container_width=True,
            hide_index=True,
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract sync-test .doc files into JSONL")
    parser.add_argument("--input-dir", default=DEFAULT_INPUT_DIR, help="Input directory")
    parser.add_argument("--output-dir", default=DEFAULT_OUTPUT_DIR, help="Output directory")
    parser.add_argument("--enable-api", action="store_true", help="Enable API enhancement")
    parser.add_argument("--api-key", default="", help="Primary API key")
    parser.add_argument("--api-keys", default="", help="Extra API keys separated by newline, comma or semicolon")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="API Base URL")
    parser.add_argument("--model", default=DEFAULT_MODEL, help="Model ID")
    args = parser.parse_args()

    files = discover_doc_files(args.input_dir)
    if not files:
        print("No .doc files found.")
        return

    api_settings = {
        "enable_api": bool(args.enable_api),
        "api_key": args.api_key,
        "api_keys": parse_api_keys(args.api_key, args.api_keys),
        "base_url": args.base_url,
        "model_id": args.model,
    }

    os.makedirs(args.output_dir, exist_ok=True)
    success = 0
    total_questions = 0
    total_skipped = 0
    total_api_filled = 0
    total_api_enhanced = 0
    for path_str in files:
        try:
            output_path, report_path, report = process_one_file(path_str, args.output_dir, api_settings)
            success += 1
            total_questions += int(report.get("question_count", 0) or 0)
            total_skipped += len(report.get("skipped_unsupported", []) or [])
            total_api_filled += int(report.get("api_filled_analysis_count", 0) or 0)
            total_api_enhanced += int(report.get("api_enhanced_question_count", 0) or 0)
            print(f"[OK] {os.path.basename(path_str)} -> {output_path}")
            print(f"     report -> {report_path}")
            print(
                f"     questions={report.get('question_count', 0)} "
                f"skipped={len(report.get('skipped_unsupported', []) or [])} "
                f"api_analysis={report.get('api_filled_analysis_count', 0)} "
                f"api_enhanced={report.get('api_enhanced_question_count', 0)}"
            )
        except Exception as exc:
            print(f"[ERR] {os.path.basename(path_str)} -> {exc}")

    print(f"Completed: {success}/{len(files)}")
    print(
        f"questions={total_questions} skipped_unsupported={total_skipped} "
        f"api_analysis={total_api_filled} api_enhanced={total_api_enhanced}"
    )

if __name__ == "__main__":
    ensure_dirs()
    if st.runtime.exists():
        render_app()
    else:
        main()
