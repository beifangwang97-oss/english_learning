import argparse
import json
import os
from collections import OrderedDict
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
WORD_DATA_DIR = BASE_DIR / "word_data"
UNRECORDED_DIR = WORD_DATA_DIR / "\u672a\u5f55\u97f3"
RECORDED_DIR = WORD_DATA_DIR / "\u5df2\u5f55\u97f3"
TARGET_DIRS = (UNRECORDED_DIR, RECORDED_DIR)

CURRENT_BOOK_TAG = "current_book"
REVIEW_TAG = "primary_school_review"
WORD_LIST_LABEL = "\u5355\u8bcd\u8868"
PHRASE_LIST_LABEL = "\u77ed\u8bed\u8868"
PASSAGE_LABEL = "\u8bfe\u6587"
LEXICON_LABELS = (WORD_LIST_LABEL, PHRASE_LIST_LABEL)


def parse_legacy_lexicon_filename(filename: str):
    stem = Path(filename).stem
    parts = stem.split("_")
    if len(parts) < 5:
        return None
    if CURRENT_BOOK_TAG in parts or REVIEW_TAG in parts:
        return None

    list_idx = None
    for idx, part in enumerate(parts):
        if part in LEXICON_LABELS:
            list_idx = idx
            break

    if list_idx is None or list_idx < 3:
        return None

    return {
        "stem": stem,
        "parts": parts,
        "list_idx": list_idx,
    }


def build_normalized_filename(filename: str):
    parsed = parse_legacy_lexicon_filename(filename)
    if not parsed:
        return None
    parts = list(parsed["parts"])
    list_idx = parsed["list_idx"]
    new_parts = parts[:list_idx] + [CURRENT_BOOK_TAG] + parts[list_idx:]
    return "_".join(new_parts) + Path(filename).suffix


def reorder_meaning_fields(meaning: dict):
    ordered = OrderedDict()
    for key in ("pos", "meaning", "example", "example_zh", "example_audio"):
        if key in meaning:
            ordered[key] = meaning[key]
    for key, value in meaning.items():
        if key not in ordered:
            ordered[key] = value
    return ordered


def reorder_row_fields(row: dict):
    ordered = OrderedDict()
    preferred_keys = (
        "word",
        "phonetic",
        "meanings",
        "unit",
        "type",
        "book_version",
        "grade",
        "semester",
        "source_tag",
        "id",
        "word_audio",
        "phrase_audio",
    )
    for key in preferred_keys:
        if key == "source_tag":
            ordered[key] = row.get(key, CURRENT_BOOK_TAG)
            continue
        if key == "meanings" and isinstance(row.get("meanings"), list):
            ordered[key] = [
                reorder_meaning_fields(item) if isinstance(item, dict) else item
                for item in row.get("meanings", [])
            ]
            continue
        if key in row:
            ordered[key] = row[key]

    for key, value in row.items():
        if key not in ordered:
            ordered[key] = value
    return ordered


def should_process_jsonl(path: Path):
    name = path.name
    if PASSAGE_LABEL in name:
        return False
    if REVIEW_TAG in path.stem:
        return False
    if CURRENT_BOOK_TAG in path.stem:
        return True
    return parse_legacy_lexicon_filename(name) is not None


def normalize_jsonl_file(path: Path, apply_changes: bool):
    changed = False
    rows = []
    with path.open("r", encoding="utf-8-sig") as rf:
        for line in rf:
            text = line.strip()
            if not text:
                continue
            row = json.loads(text)
            if str(row.get("source_tag", "") or "").strip() != CURRENT_BOOK_TAG:
                row["source_tag"] = CURRENT_BOOK_TAG
                changed = True
            ordered = reorder_row_fields(row)
            if list(ordered.keys()) != list(row.keys()):
                changed = True
            rows.append(ordered)

    if changed and apply_changes:
        with path.open("w", encoding="utf-8") as wf:
            for row in rows:
                wf.write(json.dumps(row, ensure_ascii=False) + "\n")

    return changed, len(rows)


def main():
    parser = argparse.ArgumentParser(
        description="Normalize legacy lexicon JSONL filenames and inject source_tag=current_book."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Apply changes in place. Without this flag, only print a dry-run summary.",
    )
    args = parser.parse_args()

    rename_count = 0
    update_count = 0

    for target_dir in TARGET_DIRS:
        if not target_dir.exists():
            continue

        for path in sorted(target_dir.glob("*.jsonl")):
            if not should_process_jsonl(path):
                continue

            current_path = path
            new_name = build_normalized_filename(path.name)
            if new_name:
                rename_count += 1
                new_path = path.with_name(new_name)
                print(f"RENAME: {path.name} -> {new_name}")
                if args.apply:
                    os.replace(path, new_path)
                    current_path = new_path

            changed, row_count = normalize_jsonl_file(current_path, args.apply)
            if changed:
                update_count += 1
                print(f"UPDATE: {current_path.name} ({row_count} rows)")

    mode = "APPLY" if args.apply else "DRY-RUN"
    print(f"[{mode}] renamed files: {rename_count}")
    print(f"[{mode}] updated jsonl files: {update_count}")


if __name__ == "__main__":
    main()
