import json
import re
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"

PASSAGE_KEEP_KEYS = [
    "id",
    "type",
    "unit",
    "unit_no",
    "is_starter",
    "section",
    "label",
    "labels",
    "display_label",
    "task_kind",
    "target_id",
    "title",
    "passage_text",
    "sentences",
    "matched_labels",
    "source_pages",
    "source_line",
    "raw_scope_line",
    "book_version",
    "grade",
    "semester",
    "_source_file",
]

BLANK_EN_REPLACEMENTS = {
    "It’s ________ in Chongqing, China.": "It’s nighttime in Chongqing, China.",
    "In Nairobi, Kenya, it’s ________.": "In Nairobi, Kenya, it’s daytime.",
    "It’s ________ in New York, USA.": "It’s morning in New York, USA.",
    "10 December 20_____": "10 December 2025",
    "__________________": "The Students' Union",
}

BLANK_ZH_REPLACEMENTS = {
    "在中国重庆，________。": "在中国重庆，现在是夜晚。",
    "在肯尼亚内罗毕，________。": "在肯尼亚内罗毕，现在是白天。",
    "在美国纽约，________。": "在美国纽约，现在是早晨。",
    "20_____年12月10日": "2025年12月10日",
    "__________________": "学生会",
}

ABBREVIATIONS = {
    "a.m.": "__AM__",
    "p.m.": "__PM__",
}

ENUM_ONLY_RE = re.compile(r"^\(?\d+[\).]?$")
EN_SPEAKER_LINE_RE = re.compile(
    r"^(?P<name>[A-Z][A-Za-z'\.\-]*(?:\s+[A-Z][A-Za-z'\.\-]*){0,3})(?P<sep>\s*:\s*)(?P<rest>.+)$"
)
ZH_SPEAKER_LINE_RE = re.compile(
    r"^(?P<name>(?:[A-Za-z][A-Za-z'\.\-]*(?:\s+[A-Za-z][A-Za-z'\.\-]*){0,3}|[\u4e00-\u9fff]{1,12}))(?P<sep>\s*[：:]\s*)(?P<rest>.+)$"
)
EN_SPEAKER_BOUNDARY_RE = re.compile(
    r"(?<=[.!?])\s+(?=(?:[A-Z][A-Za-z'\.\-]*(?:\s+[A-Z][A-Za-z'\.\-]*){0,3})\s*:\s*)"
)
ZH_SPEAKER_BOUNDARY_RE = re.compile(
    r"(?<=[。！？!?])\s*(?=(?:(?:[A-Za-z][A-Za-z'\.\-]*(?:\s+[A-Za-z][A-Za-z'\.\-]*){0,3})|(?:[\u4e00-\u9fff]{1,12}))\s*[：:]\s*)"
)


def protect_special_tokens(text: str) -> str:
    value = text
    for source, token in ABBREVIATIONS.items():
        value = value.replace(source, token)
    leading_enum = re.match(r"^(\(?\d+[\).]?)(\s+)(.+)$", value)
    if leading_enum:
        head, gap, tail = leading_enum.groups()
        safe_head = head.replace(".", "__DOT__")
        value = f"{safe_head}{gap}{tail}"
    return value


def restore_special_tokens(text: str) -> str:
    value = text.replace("__DOT__", ".")
    for source, token in ABBREVIATIONS.items():
        value = value.replace(token, source)
    return value


def split_core_text(text: str, is_zh: bool) -> list[str]:
    cleaned = (text or "").strip()
    if not cleaned:
        return []
    protected = protect_special_tokens(cleaned)
    split_pattern = r"(?<=[。！？])\s*|(?<=[.!?])\s+" if is_zh else r"(?<=[.!?])\s+"
    parts = re.split(split_pattern, protected)
    results = []
    for part in parts:
        restored = restore_special_tokens((part or "").strip())
        if restored:
            results.append(restored)
    return results if results else [cleaned]


def split_text_with_speaker(text: str, is_zh: bool) -> list[str]:
    cleaned = (text or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    if not cleaned:
        return []
    boundary_re = ZH_SPEAKER_BOUNDARY_RE if is_zh else EN_SPEAKER_BOUNDARY_RE
    line_re = ZH_SPEAKER_LINE_RE if is_zh else EN_SPEAKER_LINE_RE
    normalized = boundary_re.sub("\n", cleaned)
    results: list[str] = []
    for raw_line in normalized.split("\n"):
        line = raw_line.strip()
        if not line:
            continue
        match = line_re.match(line)
        if not match:
            results.extend(split_core_text(line, is_zh=is_zh))
            continue
        prefix = f"{match.group('name')}{match.group('sep')}"
        rest = match.group("rest").strip()
        pieces = split_core_text(rest, is_zh=is_zh)
        if not pieces:
            results.append(line)
            continue
        for piece in pieces:
            results.append(f"{prefix}{piece}")
    return results


def apply_blank_replacements(text: str, replacements: dict[str, str]) -> str:
    value = text
    for old, new in replacements.items():
        value = value.replace(old, new)
    return value


def merge_enumerator_rows(sentences: list[dict]) -> list[dict]:
    merged: list[dict] = []
    index = 0
    while index < len(sentences):
        current = dict(sentences[index])
        en_text = str(current.get("en") or "").strip()
        zh_text = str(current.get("zh") or "").strip()
        if ENUM_ONLY_RE.fullmatch(en_text) and index + 1 < len(sentences):
            nxt = dict(sentences[index + 1])
            next_en = str(nxt.get("en") or "").strip()
            next_zh = str(nxt.get("zh") or "").strip()
            current["en"] = f"{en_text} {next_en}".strip()
            current["zh"] = f"{zh_text} {next_zh}".strip() if zh_text else next_zh
            current["audio"] = ""
            merged.append(current)
            index += 2
            continue
        merged.append(current)
        index += 1
    return merged


def merge_continuation_rows(sentences: list[dict]) -> list[dict]:
    merged: list[dict] = []
    for sent in sentences:
        current = dict(sent)
        en_text = str(current.get("en") or "").strip()
        zh_text = str(current.get("zh") or "").strip()
        if merged:
            prev_en = str(merged[-1].get("en") or "").strip()
            prev_zh = str(merged[-1].get("zh") or "").strip()
            starts_with_lower = bool(en_text) and en_text[0].islower()
            needs_join = prev_en.endswith(("a.m.", "p.m.", "...", "…"))
            if starts_with_lower and needs_join:
                merged[-1]["en"] = f"{prev_en} {en_text}".strip()
                merged[-1]["zh"] = f"{prev_zh}{zh_text}".strip()
                merged[-1]["audio"] = ""
                continue
        merged.append(current)
    return merged


def split_sentence_pair(en_text: str, zh_text: str) -> list[dict]:
    en_chunks = split_text_with_speaker(en_text, is_zh=False)
    zh_chunks = split_text_with_speaker(zh_text, is_zh=True)
    if not en_chunks:
        return []
    if not zh_chunks:
        return [{"en": chunk, "zh": "", "audio": ""} for chunk in en_chunks]
    if len(en_chunks) == len(zh_chunks):
        return [{"en": en_chunks[i], "zh": zh_chunks[i], "audio": ""} for i in range(len(en_chunks))]
    return [{"en": en_text.strip(), "zh": zh_text.strip(), "audio": ""}]


def normalize_passage_text(text: str) -> str:
    cleaned = (text or "").replace("\r\n", "\n").replace("\r", "\n")
    cleaned = apply_blank_replacements(cleaned, BLANK_EN_REPLACEMENTS)
    lines = []
    for raw_line in cleaned.split("\n"):
        line = raw_line.strip()
        if not line:
            lines.append("")
            continue
        line = EN_SPEAKER_BOUNDARY_RE.sub("\n", line)
        lines.extend(part.strip() for part in line.split("\n"))
    normalized = "\n".join(lines).strip()
    normalized = re.sub(r"\n{3,}", "\n\n", normalized)
    return normalized


def fix_passage_record(record: dict) -> tuple[dict, dict]:
    fixed = dict(record)
    original_passage = str(record.get("passage_text") or "")
    fixed_passage = normalize_passage_text(original_passage)
    fixed["passage_text"] = fixed_passage

    original_sentences = record.get("sentences") or []
    merged_sentences = merge_enumerator_rows(original_sentences)

    fixed_sentences = []
    merges = 0
    splits = 0
    blank_fills = 0

    if len(merged_sentences) != len(original_sentences):
        merges = len(original_sentences) - len(merged_sentences)

    for sent in merged_sentences:
        original_en = str(sent.get("en") or "").strip()
        original_zh = str(sent.get("zh") or "").strip()
        updated_en = apply_blank_replacements(original_en, BLANK_EN_REPLACEMENTS)
        updated_zh = apply_blank_replacements(original_zh, BLANK_ZH_REPLACEMENTS)
        if updated_en != original_en or updated_zh != original_zh:
            blank_fills += 1
        pieces = split_sentence_pair(updated_en, updated_zh)
        if len(pieces) > 1:
            splits += len(pieces) - 1
        fixed_sentences.extend(pieces)

    fixed_sentences = merge_continuation_rows(fixed_sentences)
    fixed["sentences"] = fixed_sentences
    summary = {
        "passage_changed": fixed_passage != original_passage,
        "merges": merges,
        "splits": splits,
        "blank_fills": blank_fills,
        "sentence_count_before": len(original_sentences),
        "sentence_count_after": len(fixed_sentences),
    }
    return fixed, summary


def rewrite_file(path: Path) -> tuple[bool, dict]:
    changed = False
    stats = {
        "records_changed": 0,
        "passage_changed": 0,
        "merges": 0,
        "splits": 0,
        "blank_fills": 0,
    }
    output_lines = []
    with path.open("r", encoding="utf-8-sig") as handle:
        for raw in handle:
            if not raw.strip():
                continue
            record = json.loads(raw)
            if record.get("type") != "passage":
                output_lines.append(json.dumps(record, ensure_ascii=False))
                continue
            fixed, summary = fix_passage_record(record)
            if fixed != record:
                changed = True
                stats["records_changed"] += 1
            if summary["passage_changed"]:
                stats["passage_changed"] += 1
            stats["merges"] += summary["merges"]
            stats["splits"] += summary["splits"]
            stats["blank_fills"] += summary["blank_fills"]
            ordered = {key: fixed[key] for key in PASSAGE_KEEP_KEYS if key in fixed}
            for key, value in fixed.items():
                if key not in ordered:
                    ordered[key] = value
            output_lines.append(json.dumps(ordered, ensure_ascii=False))
    if changed:
        path.write_text("\n".join(output_lines) + "\n", encoding="utf-8")
    return changed, stats


def main():
    files = sorted(DATA_DIR.rglob("课文/*.jsonl"))
    total = {
        "files_changed": 0,
        "records_changed": 0,
        "passage_changed": 0,
        "merges": 0,
        "splits": 0,
        "blank_fills": 0,
    }
    for path in files:
        changed, stats = rewrite_file(path)
        if not changed:
            continue
        total["files_changed"] += 1
        for key in ("records_changed", "passage_changed", "merges", "splits", "blank_fills"):
            total[key] += stats[key]
        rel = path.relative_to(BASE_DIR)
        print(f"{rel} :: {stats}")
    print(f"TOTAL :: {total}")


if __name__ == "__main__":
    main()
