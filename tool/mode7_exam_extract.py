import argparse
import hashlib
import json
import os
import re
import time
from typing import Dict, List, Optional, Tuple


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_INPUT_DIR = os.path.join(BASE_DIR, "待处理试卷")
DEFAULT_OUTPUT_DIR = os.path.join(BASE_DIR, "exam_data", "未导入")


def ensure_dirs() -> None:
    os.makedirs(DEFAULT_OUTPUT_DIR, exist_ok=True)


def make_task_id() -> str:
    return time.strftime("%Y%m%d_%H%M%S")


def sanitize_filename(text: str) -> str:
    safe = re.sub(r'[\\/:*?"<>|]+', "_", str(text or "").strip())
    safe = re.sub(r"\s+", "", safe)
    return safe or "unknown"


def build_output_filename(book_version: str, grade: str, semester: str, unit: str, task_id: str) -> str:
    unit_compact = re.sub(r"\s+", "", unit or "")
    return f"{sanitize_filename(book_version)}_{sanitize_filename(grade)}_{sanitize_filename(semester)}_{sanitize_filename(unit_compact)}_同步题_{task_id}.jsonl"


def parse_source_meta_from_filename(filename: str) -> Dict[str, str]:
    stem = os.path.splitext(os.path.basename(filename))[0]
    match = re.match(
        r"^(?P<book>.+?)(?P<grade>[一二三四五六七八九]年级)(?P<semester>上册|下册|全一册|全册)\s*Unit\s*(?P<unit_no>\d+).*$",
        stem,
        flags=re.IGNORECASE,
    )
    if not match:
        return {
            "book_version": "",
            "grade": "",
            "semester": "",
            "unit": "",
            "unit_no": "",
            "paper_title": stem,
        }
    unit_no = match.group("unit_no")
    return {
        "book_version": match.group("book").strip(),
        "grade": match.group("grade").strip(),
        "semester": match.group("semester").strip().replace("全一册", "全册"),
        "unit": f"Unit {unit_no}",
        "unit_no": unit_no,
        "paper_title": stem,
    }


def read_doc_text(path: str) -> str:
    with open(path, "rb") as rf:
        raw = rf.read()
    return raw.decode("utf-16le", errors="ignore")


def clean_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = text.replace("\x0c", "\n").replace("\x07", "\n").replace("\x01", "")
    text = text.replace("\u3000", " ")
    text = text.replace("\t", " ")
    text = re.sub(r"[^\S\n]+", " ", text)
    # 删除 doc 二进制残留中的异常字符，但保留中英文、常见标点与换行
    text = re.sub(r"[^0-9A-Za-z\u4e00-\u9fff\u3400-\u4dbf\n \.,;:?!'\"“”‘’\-\(\)\[\]/_&%$#@+*=<>…—、，。；：？！《》【】（）·]", "", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def split_paper_and_teacher_text(full_text: str, unit_label: str) -> Tuple[str, str]:
    title = f"{unit_label} 单元拔尖检测"
    first = full_text.find(title)
    if first == -1:
        return clean_text(full_text), ""
    second = full_text.find(title, first + len(title))
    if second == -1:
        return clean_text(full_text[first:]), ""
    paper_text = clean_text(full_text[first:second])
    teacher_text = clean_text(full_text[second:])
    return paper_text, teacher_text


def find_first_index(text: str, markers: List[str]) -> int:
    positions = [text.find(marker) for marker in markers if text.find(marker) != -1]
    return min(positions) if positions else -1


def section_after_marker(text: str, start_markers: List[str], end_markers: List[str]) -> str:
    start_idx = find_first_index(text, start_markers)
    if start_idx == -1:
        return ""
    start_marker = min(
        (marker for marker in start_markers if text.find(marker) != -1),
        key=lambda marker: text.find(marker),
    )
    content = text[start_idx + len(start_marker):]
    end_positions = [content.find(marker) for marker in end_markers if content.find(marker) != -1]
    if end_positions:
        content = content[: min(end_positions)]
    return content.strip()


def section_by_regex(text: str, start_pattern: str, end_pattern: str) -> str:
    start_match = re.search(start_pattern, text, flags=re.S)
    if not start_match:
        return ""
    content = text[start_match.end() :]
    end_match = re.search(end_pattern, content, flags=re.S)
    if end_match:
        content = content[: end_match.start()]
    return content.strip()


def make_id(seed: str) -> str:
    return hashlib.md5(seed.encode("utf-8")).hexdigest()[:12]


def parse_option_rows(block_text: str) -> Dict[str, str]:
    matches = list(re.finditer(r"(?:^|\n)([A-G])\.\s*(.*?)(?=(?:\n[A-G]\.\s)|$)", block_text, flags=re.S))
    options: Dict[str, str] = {}
    for match in matches:
        options[match.group(1)] = " ".join(match.group(2).split())
    return options


def split_question_blocks(section_text: str, start_no: int, end_no: int) -> List[Tuple[int, str]]:
    starts = list(re.finditer(r"\(\s*\)\s*(\d+)\.", section_text))
    rows: List[Tuple[int, str]] = []
    for idx, match in enumerate(starts):
        q_no = int(match.group(1))
        if q_no < start_no or q_no > end_no:
            continue
        start_idx = match.start()
        end_idx = starts[idx + 1].start() if idx + 1 < len(starts) else len(section_text)
        rows.append((q_no, section_text[start_idx:end_idx].strip()))
    return rows


def parse_mcq_block(block_text: str, expect_stem: bool = True) -> Tuple[str, Dict[str, str]]:
    q_match = re.search(r"\(\s*\)\s*\d+\.\s*(.*)$", block_text, flags=re.S)
    if not q_match:
        return "", {}
    content = q_match.group(1).strip()
    option_positions = list(re.finditer(r"(?<![A-Za-z])([A-D])\.\s*", content))
    if not option_positions:
        return (" ".join(content.split()) if expect_stem else ""), {}

    stem = content[: option_positions[0].start()].strip() if expect_stem else ""
    options: Dict[str, str] = {}
    for idx, match in enumerate(option_positions):
        key = match.group(1)
        start_idx = match.end()
        end_idx = option_positions[idx + 1].start() if idx + 1 < len(option_positions) else len(content)
        option_text = " ".join(content[start_idx:end_idx].split())
        option_text = re.sub(r"(第二节\s*阅读.*|第三部分\s*阅读.*|VII\..*|VIII\..*|IX\..*|X\..*)$", "", option_text).strip()
        options[key] = option_text
    return " ".join(stem.split()), options


def parse_choice_questions(section_text: str, start_no: int, end_no: int, expect_stem: bool = True) -> List[Dict[str, object]]:
    rows: List[Dict[str, object]] = []
    for q_no, block_text in split_question_blocks(section_text, start_no, end_no):
        stem, options = parse_mcq_block(block_text, expect_stem=expect_stem)
        rows.append(
            {
                "question_no": q_no,
                "stem": stem,
                "options": options,
            }
        )
    return rows


def parse_material_by_question_range(section_text: str, start_no: int, end_no: int, label: str) -> str:
    marker = f"( ) {start_no}."
    idx = section_text.find(marker)
    if idx == -1:
        marker = f"({start_no}."
        idx = section_text.find(marker)
    if idx == -1:
        marker = f"{start_no}."
        idx = section_text.find(marker)
    if idx == -1:
        return ""
    head = section_text[:idx].strip()
    head = re.sub(rf"^[{re.escape(label)}]\s*(\[[^\]]+\])?\s*", "", head).strip()
    return head


def parse_single_choice_section(section_text: str) -> List[Dict[str, object]]:
    return parse_choice_questions(section_text, 21, 30, expect_stem=True)


def parse_cloze_section(section_text: str) -> Tuple[List[Dict[str, object]], Dict[str, str]]:
    materials = {}
    q_rows: List[Dict[str, object]] = []

    b_marker = re.search(r"\nB(?:\s*\[[^\]]+\])?\s*\n", section_text)
    q31_marker = re.search(r"\(\s*\)\s*31\.", section_text)
    q41_marker = re.search(r"\(\s*\)\s*41\.", section_text)

    if q31_marker and b_marker:
        materials["A"] = section_text[: q31_marker.start()].strip()
        q_rows.extend(parse_choice_questions(section_text[q31_marker.start() : b_marker.start()], 31, 40, expect_stem=False))
        if q41_marker:
            materials["B"] = section_text[b_marker.end() : q41_marker.start()].strip()
            q_rows.extend(parse_choice_questions(section_text[q41_marker.start() :], 41, 50, expect_stem=False))
    return q_rows, materials


def parse_seven_choice_section(section_text: str) -> Tuple[List[Dict[str, object]], str, Dict[str, str]]:
    q51 = re.search(r"51\.\s*_+", section_text)
    if not q51:
        q51 = re.search(r"51\.", section_text)
    options_match = re.search(r"\nA\.\s.*$", section_text, flags=re.S)
    dialogue_text = section_text
    options: Dict[str, str] = {}
    if q51 and options_match:
        dialogue_text = section_text[: options_match.start()].strip()
        options = parse_option_rows(options_match.group(0))
    rows = []
    for q_no in range(51, 56):
        rows.append(
            {
                "question_no": q_no,
                "stem": f"补全对话第 {q_no} 空",
                "options": options,
            }
        )
    return rows, dialogue_text, options


def parse_reading_section(section_text: str) -> Tuple[List[Dict[str, object]], Dict[str, str], List[Dict[str, object]]]:
    materials: Dict[str, str] = {}
    mcq_rows: List[Dict[str, object]] = []
    qa_rows: List[Dict[str, object]] = []
    ranges = {
        "A": (56, 58),
        "B": (59, 61),
        "C": (62, 65),
        "D": (66, 68),
        "E": (69, 72),
        "F": (73, 75),
    }

    for label, (start_no, end_no) in ranges.items():
        label_pattern = re.compile(rf"(?:^|\n){label}(?:\s*\[[^\]]+\])?\s*\n", flags=re.S)
        label_match = label_pattern.search(section_text)
        if not label_match:
            continue
        if label != "F":
            q_marker = re.search(rf"\(\s*\)\s*{start_no}\.", section_text[label_match.end() :], flags=re.S)
        else:
            q_marker = re.search(rf"\n\s*{start_no}\.", section_text[label_match.end() :], flags=re.S)
        if not q_marker:
            continue
        material_start = label_match.end()
        material_end = label_match.end() + q_marker.start()
        materials[label] = section_text[material_start:material_end].strip()

    for label, (start_no, end_no) in list(ranges.items())[:5]:
        q_start = re.search(rf"\(\s*\)\s*{start_no}\.", section_text)
        if not q_start:
            continue
        next_q_start = None
        if end_no < 72:
            next_q_start = re.search(rf"\(\s*\)\s*{end_no + 1}\.", section_text[q_start.start() :], flags=re.S)
        elif end_no == 72:
            next_q_start = re.search(r"\n\s*73\.", section_text[q_start.start() :], flags=re.S)
        next_label_pos = None
        next_label = chr(ord(label) + 1) if label != "E" else "F"
        next_label_match = re.search(rf"\n{next_label}(?:\s*\[[^\]]+\])?\s*\n", section_text[q_start.start() :], flags=re.S)
        if next_label_match:
            next_label_pos = next_label_match.start()
        end_candidates = []
        if next_q_start:
            end_candidates.append(next_q_start.start())
        if next_label_pos is not None:
            end_candidates.append(next_label_pos)
        block_text = section_text[q_start.start() : q_start.start() + min(end_candidates)] if end_candidates else section_text[q_start.start() :]
        for row in parse_choice_questions(block_text, start_no, end_no, expect_stem=True):
            row["material_label"] = label
            mcq_rows.append(row)

    qa_pattern = re.compile(
        r"(\d+)\.\s*(.*?)(?:\n_+|\n第[一二三四五六七八九十]部分|\nIX\.|\nX\.|$)",
        flags=re.S,
    )
    f_text = materials.get("F", "")
    if f_text:
        f_start = section_text.find(f_text)
        qa_source = section_text[f_start + len(f_text) :]
    else:
        qa_source = section_text
    for match in qa_pattern.finditer(qa_source):
        q_no = int(match.group(1))
        if q_no < 73 or q_no > 75:
            continue
        qa_rows.append(
            {
                "question_no": q_no,
                "stem": " ".join(match.group(2).split()),
                "material_label": "F",
            }
        )
    return mcq_rows, materials, qa_rows


def parse_explanation_entries(section_text: str, section_end_markers: List[str]) -> Dict[int, Dict[str, str]]:
    result: Dict[int, Dict[str, str]] = {}
    end_idx = len(section_text)
    for marker in section_end_markers:
        pos = section_text.find(marker)
        if pos != -1:
            end_idx = min(end_idx, pos)
    body = section_text[:end_idx]
    pattern = re.compile(
        r"(?ms)(\d{1,3})\.\s*(.*?)(?=(?:\n\s*\d{1,3}\.\s)|(?:\n\s*[A-F]\)\s*【主旨大意】)|(?:\n\s*[IVX]+\.)|$)"
    )
    for match in pattern.finditer(body):
        q_no = int(match.group(1))
        raw = " ".join(match.group(2).split())
        result[q_no] = {"raw": raw}
    normalized = dict(result)
    for q_no in sorted(result.keys()):
        raw = result[q_no].get("raw", "")
        carry_match = re.match(r"^([A-G])\s+(\d{1,3})\.\s*([A-G])\s*$", raw)
        if carry_match:
            normalized[q_no] = {"raw": carry_match.group(1)}
            next_no = int(carry_match.group(2))
            if next_no == q_no + 1 and next_no not in normalized:
                normalized[next_no] = {"raw": carry_match.group(3)}
    return normalized


def parse_main_idea_entries(section_text: str, section_end_markers: List[str]) -> Dict[str, str]:
    result: Dict[str, str] = {}
    end_idx = len(section_text)
    for marker in section_end_markers:
        pos = section_text.find(marker)
        if pos != -1:
            end_idx = min(end_idx, pos)
    body = section_text[:end_idx]
    pattern = re.compile(r"([A-F])\)\s*【主旨大意】(.*?)(?=(?:\n\s*[A-F]\)\s*【主旨大意】)|(?:\n\s*\d{1,3}\.)|$)", flags=re.S)
    for match in pattern.finditer(body):
        result[match.group(1)] = " ".join(match.group(2).split())
    return result


def parse_answer_and_explanation(raw: str, expect_choice: bool = True) -> Tuple[str, str]:
    raw = (raw or "").strip()
    if not raw:
        return "", ""
    if expect_choice:
        match = re.match(r"([A-G])(?:\s*[/／]\s*([A-G]))?\s*(.*)$", raw)
        if match:
            ans = match.group(1)
            if match.group(2):
                ans = f"{ans}/{match.group(2)}"
            explanation = match.group(3).strip()
            return ans, explanation
    return raw, ""


def parse_seven_choice_answers(section_text: str) -> Dict[int, Dict[str, str]]:
    match = re.search(r"51-55\s*([A-G]{5})", section_text)
    if not match:
        return {}
    letters = list(match.group(1))
    return {
        51 + idx: {"answer": letter, "explanation": ""}
        for idx, letter in enumerate(letters)
    }


def parse_qa_answers(section_text: str) -> Dict[int, Dict[str, str]]:
    result: Dict[int, Dict[str, str]] = {}
    pattern = re.compile(r"(?ms)(7[3-5])\.\s*(.*?)(?=(?:\n\s*7[3-5]\.\s)|(?:\n\s*IX\.)|(?:\n\s*X\.)|$)")
    for match in pattern.finditer(section_text):
        q_no = int(match.group(1))
        answer = " ".join(match.group(2).split())
        result[q_no] = {"answer": answer, "explanation": ""}
    return result


def build_meta_row(source_meta: Dict[str, str], source_file: str, has_teacher_copy: bool) -> Dict[str, object]:
    return {
        "record_type": "meta",
        "source_type": "sync_exam",
        "paper_type": "同步测试题",
        "book_version": source_meta.get("book_version", ""),
        "grade": source_meta.get("grade", ""),
        "semester": source_meta.get("semester", ""),
        "unit": source_meta.get("unit", ""),
        "unit_no": source_meta.get("unit_no", ""),
        "source_file": source_file,
        "source_title": f"{source_meta.get('unit', '')} 单元拔尖检测".strip(),
        "contains_teacher_copy": bool(has_teacher_copy),
    }


def material_row(material_id: str, label: str, question_type: str, material_text: str, meta: Dict[str, str], explanation: str = "") -> Dict[str, object]:
    return {
        "record_type": "material",
        "material_id": material_id,
        "material_label": label,
        "question_type": question_type,
        "material_text": " ".join((material_text or "").split()),
        "material_explanation": explanation or "",
        "book_version": meta.get("book_version", ""),
        "grade": meta.get("grade", ""),
        "semester": meta.get("semester", ""),
        "unit": meta.get("unit", ""),
    }


def build_material_id(meta: Dict[str, str], question_type: str, label: str) -> str:
    return make_id(
        f"{meta.get('book_version', '')}|{meta.get('grade', '')}|{meta.get('semester', '')}|{meta.get('unit', '')}|{question_type}|{label}"
    )


def question_row(
    question_no: int,
    question_type: str,
    stem: str,
    options: Optional[Dict[str, str]],
    meta: Dict[str, str],
    material_id: str = "",
    answer: str = "",
    explanation: str = "",
) -> Dict[str, object]:
    row = {
        "record_type": "question",
        "question_id": make_id(f"{meta.get('book_version')}|{meta.get('grade')}|{meta.get('semester')}|{meta.get('unit')}|{question_no}|{question_type}"),
        "question_no": question_no,
        "question_type": question_type,
        "stem": stem,
        "material_id": material_id,
        "answer": answer,
        "explanation": explanation,
        "book_version": meta.get("book_version", ""),
        "grade": meta.get("grade", ""),
        "semester": meta.get("semester", ""),
        "unit": meta.get("unit", ""),
    }
    if options:
        row["options"] = [{"key": key, "text": text} for key, text in options.items()]
    else:
        row["options"] = []
    return row


def extract_paper_rows(path: str) -> List[Dict[str, object]]:
    source_meta = parse_source_meta_from_filename(os.path.basename(path))
    full_text = read_doc_text(path)
    paper_text, teacher_text = split_paper_and_teacher_text(full_text, source_meta.get("unit", ""))

    rows: List[Dict[str, object]] = [
        build_meta_row(source_meta, os.path.basename(path), bool(teacher_text))
    ]

    paper_v = section_by_regex(paper_text, r"\bV\.\s*单项填空", r"\bVI\.\s*完形填空")
    paper_vi = section_by_regex(paper_text, r"\bVI\.\s*完形填空", r"\bVII\.\s*.*补全对话|\b第三部分\s*阅读|\bVIII\.\s*阅读理解")
    paper_vii = section_by_regex(paper_text, r"\bVII\.\s*.*补全对话", r"\b第三部分\s*阅读|\bVIII\.\s*阅读理解")
    paper_viii = section_by_regex(paper_text, r"\bVIII\.\s*阅读理解", r"\b第四部分\s*写|\bIX\.\s*单词拼写")

    teacher_v = section_by_regex(teacher_text, r"\bV\.", r"\bVI\.")
    teacher_vi = section_by_regex(teacher_text, r"\bVI\.", r"\bVII\.")
    teacher_vii = section_by_regex(teacher_text, r"\bVII\.", r"\bVIII\.")
    teacher_viii = section_by_regex(teacher_text, r"\bVIII\.", r"\bIX\.|\bX\.")

    # V 单项填空
    single_answers_raw = parse_explanation_entries(teacher_v, ["VI."])
    for item in parse_single_choice_section(paper_v):
        answer, explanation = parse_answer_and_explanation(single_answers_raw.get(item["question_no"], {}).get("raw", ""), expect_choice=True)
        rows.append(
            question_row(
                question_no=item["question_no"],
                question_type="single_choice",
                stem=item["stem"],
                options=item["options"],
                meta=source_meta,
                answer=answer,
                explanation=explanation,
            )
        )

    # VI 完形填空
    cloze_rows, cloze_materials = parse_cloze_section(paper_vi)
    cloze_answers_raw = parse_explanation_entries(teacher_vi, ["VII."])
    cloze_main_ideas = parse_main_idea_entries(teacher_vi, ["VII."])
    cloze_material_ids = {
        "A": build_material_id(source_meta, "cloze", "A"),
        "B": build_material_id(source_meta, "cloze", "B"),
    }
    for label, material_text in cloze_materials.items():
        rows.append(
            material_row(
                material_id=cloze_material_ids[label],
                label=label,
                question_type="cloze",
                material_text=material_text,
                meta=source_meta,
                explanation=cloze_main_ideas.get(label, ""),
            )
        )
    for item in cloze_rows:
        label = "A" if item["question_no"] <= 40 else "B"
        answer, explanation = parse_answer_and_explanation(cloze_answers_raw.get(item["question_no"], {}).get("raw", ""), expect_choice=True)
        rows.append(
            question_row(
                question_no=item["question_no"],
                question_type="cloze",
                stem=item["stem"],
                options=item["options"],
                meta=source_meta,
                material_id=cloze_material_ids.get(label, ""),
                answer=answer,
                explanation=explanation,
            )
        )

    # VII 七选五/补全对话
    seven_rows, seven_dialogue, _ = parse_seven_choice_section(paper_vii)
    seven_answers = parse_seven_choice_answers(teacher_vii)
    seven_material_id = build_material_id(source_meta, "seven_choice", "dialogue")
    if seven_dialogue:
        rows.append(
            material_row(
                material_id=seven_material_id,
                label="dialogue",
                question_type="seven_choice",
                material_text=seven_dialogue,
                meta=source_meta,
                explanation="",
            )
        )
    for item in seven_rows:
        ans_info = seven_answers.get(item["question_no"], {})
        rows.append(
            question_row(
                question_no=item["question_no"],
                question_type="seven_choice",
                stem=item["stem"],
                options=item["options"],
                meta=source_meta,
                material_id=seven_material_id,
                answer=ans_info.get("answer", ""),
                explanation=ans_info.get("explanation", ""),
            )
        )

    # VIII 阅读理解
    reading_mcq_rows, reading_materials, reading_qa_rows = parse_reading_section(paper_viii)
    reading_answers_raw = parse_explanation_entries(teacher_viii, ["IX.", "X."])
    reading_main_ideas = parse_main_idea_entries(teacher_viii, ["IX.", "X."])
    reading_qa_answers = parse_qa_answers(teacher_viii)
    reading_material_ids = {label: build_material_id(source_meta, "reading", label) for label in reading_materials.keys()}

    for label, material_text in reading_materials.items():
        q_type = "reading_qa" if label == "F" else "reading_mcq"
        rows.append(
            material_row(
                material_id=reading_material_ids[label],
                label=label,
                question_type=q_type,
                material_text=material_text,
                meta=source_meta,
                explanation=reading_main_ideas.get(label, ""),
            )
        )

    for item in reading_mcq_rows:
        answer, explanation = parse_answer_and_explanation(reading_answers_raw.get(item["question_no"], {}).get("raw", ""), expect_choice=True)
        rows.append(
            question_row(
                question_no=item["question_no"],
                question_type="reading_mcq",
                stem=item["stem"],
                options=item["options"],
                meta=source_meta,
                material_id=reading_material_ids.get(item.get("material_label", ""), ""),
                answer=answer,
                explanation=explanation,
            )
        )

    for item in reading_qa_rows:
        ans_info = reading_qa_answers.get(item["question_no"], {})
        rows.append(
            question_row(
                question_no=item["question_no"],
                question_type="reading_qa",
                stem=item["stem"],
                options=None,
                meta=source_meta,
                material_id=reading_material_ids.get("F", ""),
                answer=ans_info.get("answer", ""),
                explanation=ans_info.get("explanation", ""),
            )
        )

    return rows


def write_jsonl(rows: List[Dict[str, object]], output_path: str) -> None:
    with open(output_path, "w", encoding="utf-8") as wf:
        for row in rows:
            wf.write(json.dumps(row, ensure_ascii=False) + "\n")


def process_one_file(path: str, output_dir: str, task_id: str) -> str:
    rows = extract_paper_rows(path)
    meta = rows[0] if rows else {}
    output_name = build_output_filename(
        meta.get("book_version", ""),
        meta.get("grade", ""),
        meta.get("semester", ""),
        meta.get("unit", ""),
        task_id,
    )
    output_path = os.path.join(output_dir, output_name)
    write_jsonl(rows, output_path)
    return output_path


def main() -> None:
    parser = argparse.ArgumentParser(description="将同步题试卷抽取为 JSONL（含题目、答案、解析）")
    parser.add_argument("--input-dir", default=DEFAULT_INPUT_DIR, help="试卷目录")
    parser.add_argument("--output-dir", default=DEFAULT_OUTPUT_DIR, help="输出目录")
    args = parser.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)
    task_id = make_task_id()
    files = sorted(
        os.path.join(args.input_dir, name)
        for name in os.listdir(args.input_dir)
        if name.lower().endswith(".doc") and not name.startswith("~$")
    )

    if not files:
        print("未找到 .doc 试卷文件。")
        return

    success = 0
    for path in files:
        try:
            out = process_one_file(path, args.output_dir, task_id)
            success += 1
            print(f"[OK] {os.path.basename(path)} -> {out}")
        except Exception as exc:
            print(f"[ERR] {os.path.basename(path)} -> {exc}")

    print(f"完成：{success}/{len(files)}")


if __name__ == "__main__":
    ensure_dirs()
    main()
