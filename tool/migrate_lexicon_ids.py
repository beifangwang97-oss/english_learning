import argparse
import copy
import hashlib
import json
import shutil
from collections import defaultdict
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
WORD_DATA_DIR = BASE_DIR / "word_data"
UNRECORDED_DIR = WORD_DATA_DIR / "\u672a\u5f55\u97f3"
RECORDED_DIR = WORD_DATA_DIR / "\u5df2\u5f55\u97f3"
AUDIO_DIR = BASE_DIR / "audio"

CURRENT_BOOK_TAG = "current_book"
REVIEW_TAG = "primary_school_review"
SOURCE_TAGS = (CURRENT_BOOK_TAG, REVIEW_TAG)
WORD_LIST_LABEL = "\u5355\u8bcd\u8868"
PHRASE_LIST_LABEL = "\u77ed\u8bed\u8868"
PASSAGE_LABEL = "\u8bfe\u6587"
LEXICON_TYPES = {"word", "phrase"}


def sanitize_word_for_filename(word: str) -> str:
    cleaned = "".join(
        [char for char in str(word or "") if char.isalpha() or char.isspace() or char == "'"]
    ).strip().replace(" ", "_")
    return cleaned or "item"


def compute_id(word_clean: str, unit: str, grade: str, semester: str = "", book_version: str = "", source_tag: str = "") -> str:
    raw_str = f"{word_clean}_{unit}_{grade}_{semester}_{book_version}_{source_tag}"
    return hashlib.md5(raw_str.encode("utf-8")).hexdigest()[:10]


def infer_source_tag_from_filename(filename: str) -> str:
    stem = Path(filename).stem
    for source_tag in SOURCE_TAGS:
        if f"_{source_tag}_" in stem or stem.endswith(f"_{source_tag}"):
            return source_tag
    return ""


def build_rel_audio_path(filename: str) -> str:
    return f"./audio/{filename}"


def parse_jsonl(path: Path):
    rows = []
    with path.open("r", encoding="utf-8-sig") as rf:
        for line_no, line in enumerate(rf, start=1):
            text = line.strip()
            if not text:
                continue
            try:
                rows.append(json.loads(text))
            except json.JSONDecodeError as exc:
                raise RuntimeError(f"{path} line {line_no} JSON decode failed: {exc}") from exc
    return rows


def write_jsonl(path: Path, rows):
    with path.open("w", encoding="utf-8") as wf:
        for row in rows:
            wf.write(json.dumps(row, ensure_ascii=False) + "\n")


def should_process_file(path: Path) -> bool:
    name = path.name
    if PASSAGE_LABEL in name:
        return False
    return WORD_LIST_LABEL in name or PHRASE_LIST_LABEL in name


def extract_audio_name(audio_rel: str) -> str:
    cleaned = str(audio_rel or "").strip().replace("\\", "/")
    if not cleaned:
        return ""
    return Path(cleaned).name


def collect_jsonl_files():
    files = []
    for root_dir in (UNRECORDED_DIR, RECORDED_DIR):
        if not root_dir.exists():
            continue
        for path in sorted(root_dir.glob("*.jsonl")):
            if should_process_file(path):
                files.append(path)
    return files


def queue_audio_rename(old_rel: str, new_rel: str, rename_ops: list[tuple[Path, Path]], warnings: list[str]):
    if not old_rel or not new_rel or old_rel == new_rel:
        return

    old_name = extract_audio_name(old_rel)
    new_name = extract_audio_name(new_rel)
    if not old_name or not new_name:
        return

    old_abs = AUDIO_DIR / old_name
    new_abs = AUDIO_DIR / new_name
    rename_ops.append((old_abs, new_abs))


def migrate_row(row: dict, source_tag_from_file: str, rename_ops: list[tuple[Path, Path]], warnings: list[str]):
    item_type = str(row.get("type", "") or "").strip().lower()
    if item_type not in LEXICON_TYPES:
        return False, None

    word = str(row.get("word", "") or "").strip()
    unit = str(row.get("unit", "") or "").strip()
    grade = str(row.get("grade", "") or "").strip()
    semester = str(row.get("semester", "") or "").strip()
    book_version = str(row.get("book_version", "") or "").strip()
    source_tag = str(row.get("source_tag", "") or "").strip() or source_tag_from_file or CURRENT_BOOK_TAG
    row["source_tag"] = source_tag

    word_clean = sanitize_word_for_filename(word)
    new_id = compute_id(word_clean, unit, grade, semester, book_version, source_tag)
    old_id = str(row.get("id", "") or "").strip()
    row["id"] = new_id

    main_field = "word_audio" if item_type == "word" else "phrase_audio"
    old_main_rel = str(row.get(main_field, "") or "").strip()
    new_main_rel = build_rel_audio_path(f"{new_id}_{word_clean}.mp3") if old_main_rel else ""
    if old_main_rel:
        queue_audio_rename(old_main_rel, new_main_rel, rename_ops, warnings)
    row[main_field] = new_main_rel

    meanings = row.get("meanings", [])
    if isinstance(meanings, list):
        for idx, meaning in enumerate(meanings):
            if not isinstance(meaning, dict):
                continue
            old_example_rel = str(meaning.get("example_audio", "") or "").strip()
            new_example_rel = build_rel_audio_path(f"{new_id}_{word_clean}_ex_{idx}.mp3") if old_example_rel else ""
            if old_example_rel:
                queue_audio_rename(old_example_rel, new_example_rel, rename_ops, warnings)
            meaning["example_audio"] = new_example_rel

    changed = old_id != new_id
    if old_main_rel != row.get(main_field, ""):
        changed = True
    return changed, new_id


def dedupe_rename_ops(rename_ops: list[tuple[Path, Path]]):
    deduped = []
    seen = set()
    for old_abs, new_abs in rename_ops:
        key = (str(old_abs), str(new_abs))
        if key in seen:
            continue
        seen.add(key)
        deduped.append((old_abs, new_abs))
    return deduped


def validate_rename_ops(rename_ops: list[tuple[Path, Path]], warnings: list[str]):
    target_map = {}
    source_map = {}

    for old_abs, new_abs in rename_ops:
        source_map.setdefault(str(old_abs), set()).add(str(new_abs))
        target_map.setdefault(str(new_abs), set()).add(str(old_abs))

    for target, sources in target_map.items():
        if len(sources) > 1:
            warnings.append(f"Multiple source audios map to the same target: {sorted(sources)} -> {target}")


def collect_global_audio_plan(planned_results: list[dict]):
    source_to_targets = defaultdict(set)
    target_to_sources = defaultdict(set)
    for result in planned_results:
        for old_abs, new_abs in result["rename_ops"]:
            if old_abs == new_abs:
                continue
            source_to_targets[old_abs].add(new_abs)
            target_to_sources[new_abs].add(old_abs)
    return source_to_targets, target_to_sources


def resolve_existing_audio_source(old_abs: Path, targets: set[Path]):
    if old_abs.exists():
        return old_abs
    for target in sorted(targets, key=lambda item: str(item)):
        if target.exists():
            return target
    return None


def validate_global_audio_plan(planned_results: list[dict]):
    warnings = []
    infos = []
    source_to_targets, target_to_sources = collect_global_audio_plan(planned_results)

    for old_abs, targets in source_to_targets.items():
        if len(targets) > 1:
            infos.append(f"Shared source audio will be replicated: {old_abs} -> {sorted(str(t) for t in targets)}")
        existing_source = resolve_existing_audio_source(old_abs, targets)
        if existing_source is None:
            warnings.append(f"Missing audio source and no migrated target available: {old_abs}")

    for new_abs, sources in target_to_sources.items():
        if len(sources) > 1:
            warnings.append(f"Multiple source audios map to the same target: {sorted(str(s) for s in sources)} -> {new_abs}")

    return warnings, infos, source_to_targets


def apply_global_audio_plan(source_to_targets: dict[Path, set[Path]]):
    for old_abs, targets in source_to_targets.items():
        if not targets:
            continue
        existing_source = resolve_existing_audio_source(old_abs, targets)
        if existing_source is None:
            raise FileNotFoundError(f"Audio source not found for migration group: {old_abs}")

        ordered_targets = sorted(targets, key=lambda item: str(item))
        for target in ordered_targets:
            if target.exists():
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            if existing_source == old_abs and len(ordered_targets) == 1 and not any(t.exists() for t in ordered_targets):
                shutil.move(str(old_abs), str(target))
                existing_source = target
            else:
                shutil.copy2(str(existing_source), str(target))

        if old_abs.exists() and old_abs not in targets:
            old_abs.unlink()


def classify_storage_group(path: Path) -> str:
    path_str = str(path)
    if str(UNRECORDED_DIR) in path_str:
        return "unrecorded"
    if str(RECORDED_DIR) in path_str:
        return "recorded"
    return "unknown"


def validate_duplicate_ids(planned_results: list[dict]):
    id_map = {}
    warnings = []
    infos = []
    for result in planned_results:
        for new_id, file_path, row_index, word in result["id_records"]:
            id_map.setdefault(new_id, []).append((file_path, row_index, word))

    for new_id, rows in id_map.items():
        if len(rows) <= 1:
            continue
        details = [f"{file_path.name}#L{row_index}:{word}" for file_path, row_index, word in rows]
        storage_groups = {classify_storage_group(file_path) for file_path, _, _ in rows}
        if storage_groups == {"unrecorded", "recorded"} and len(rows) == 2:
            infos.append(f"Expected duplicate id across unrecorded/recorded pair {new_id}: {' | '.join(details)}")
        else:
            warnings.append(f"Duplicate migrated id {new_id}: {' | '.join(details)}")
    return warnings, infos


def plan_file_migration(path: Path):
    original_rows = parse_jsonl(path)
    migrated_rows = copy.deepcopy(original_rows)
    source_tag_from_file = infer_source_tag_from_filename(path.name)
    rename_ops: list[tuple[Path, Path]] = []
    warnings: list[str] = []
    changed_rows = 0
    id_records = []

    for row_index, row in enumerate(migrated_rows, start=1):
        changed, new_id = migrate_row(row, source_tag_from_file, rename_ops, warnings)
        if changed:
            changed_rows += 1
        item_type = str(row.get("type", "") or "").strip().lower()
        if item_type in LEXICON_TYPES and new_id:
            id_records.append((new_id, path, row_index, str(row.get("word", "") or "").strip()))

    rename_ops = dedupe_rename_ops(rename_ops)
    validate_rename_ops(rename_ops, warnings)

    return {
        "file": path,
        "rows": len(migrated_rows),
        "changed_rows": changed_rows,
        "rename_ops": rename_ops,
        "warnings": warnings,
        "original_rows": original_rows,
        "migrated_rows": migrated_rows,
        "touched": changed_rows > 0 or bool(rename_ops),
        "id_records": id_records,
    }


def main():
    parser = argparse.ArgumentParser(
        description="Safely migrate lexicon JSONL ids and audio filenames to the source_tag-aware scheme."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Apply changes in place. Without this flag, only print a dry-run report.",
    )
    args = parser.parse_args()

    jsonl_files = collect_jsonl_files()
    if not jsonl_files:
        print("No lexicon JSONL files found in word_data directories.")
        return

    planned_results = [plan_file_migration(path) for path in jsonl_files]
    duplicate_warnings, duplicate_infos = validate_duplicate_ids(planned_results)
    global_audio_warnings, global_audio_infos, source_to_targets = validate_global_audio_plan(planned_results)
    all_warnings = (
        duplicate_warnings
        + global_audio_warnings
        + [warning for result in planned_results for warning in result["warnings"]]
    )

    total_changed_rows = sum(result["changed_rows"] for result in planned_results)
    total_renames = sum(len(result["rename_ops"]) for result in planned_results)

    mode = "APPLY" if args.apply else "DRY-RUN"
    print(f"[{mode}] scanned files: {len(planned_results)}")
    print(f"[{mode}] changed rows: {total_changed_rows}")
    print(f"[{mode}] audio renames: {total_renames}")
    print(f"[{mode}] warnings: {len(all_warnings)}")
    print(f"[{mode}] info duplicates: {len(duplicate_infos)}")
    print(f"[{mode}] shared audio groups: {len(global_audio_infos)}")

    for result in planned_results:
        if not result["touched"] and not result["warnings"]:
            continue
        print(
            f"- {result['file']}: rows={result['rows']}, "
            f"changed_rows={result['changed_rows']}, audio_renames={len(result['rename_ops'])}"
        )
        for warning in result["warnings"][:10]:
            print(f"  warning: {warning}")
        if len(result["warnings"]) > 10:
            print(f"  ... {len(result['warnings']) - 10} more warnings")

    for warning in duplicate_warnings[:20]:
        print(f"GLOBAL WARNING: {warning}")
    if len(duplicate_warnings) > 20:
        print(f"GLOBAL WARNING: ... {len(duplicate_warnings) - 20} more duplicate id warnings")

    for warning in global_audio_warnings[:20]:
        print(f"GLOBAL WARNING: {warning}")
    if len(global_audio_warnings) > 20:
        print(f"GLOBAL WARNING: ... {len(global_audio_warnings) - 20} more audio warnings")

    for info in duplicate_infos[:20]:
        print(f"GLOBAL INFO: {info}")
    if len(duplicate_infos) > 20:
        print(f"GLOBAL INFO: ... {len(duplicate_infos) - 20} more expected duplicate id infos")

    for info in global_audio_infos[:20]:
        print(f"GLOBAL INFO: {info}")
    if len(global_audio_infos) > 20:
        print(f"GLOBAL INFO: ... {len(global_audio_infos) - 20} more shared audio infos")

    if not args.apply:
        return

    if all_warnings:
        print("Apply aborted because warnings were detected. Resolve warnings and rerun.")
        return

    apply_global_audio_plan(source_to_targets)

    for result in planned_results:
        if result["touched"]:
            write_jsonl(result["file"], result["migrated_rows"])

    print("[APPLY] migration completed successfully.")


if __name__ == "__main__":
    main()
