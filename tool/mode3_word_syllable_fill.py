import json
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from queue import Empty, Queue

import pandas as pd
import streamlit as st
from openai import OpenAI


st.set_page_config(
    page_title="Tiger English - AI Syllable Fill",
    layout="wide",
    page_icon="T",
)

st.markdown(
    """
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
""",
    unsafe_allow_html=True,
)


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
LEGACY_DATA_DIR = os.path.join(BASE_DIR, "word_data")
DEFAULT_RECENT_ROWS = 20
DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_MODEL = "openai/gpt-4o-mini"
LLM_CLIENT_CACHE = {}
MAX_RETRIES = 3

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


def _model_label(option):
    return (
        f"{option['name']} | {option['id']} | "
        f"输入 {option['input_price']} 输出 {option['output_price']}"
    )


OPENROUTER_MODEL_LABEL_TO_ID = {_model_label(opt): opt["id"] for opt in OPENROUTER_MODEL_OPTIONS}
OPENROUTER_MODEL_ID_TO_LABEL = {opt["id"]: _model_label(opt) for opt in OPENROUTER_MODEL_OPTIONS}
OPENROUTER_MODEL_LABELS = list(OPENROUTER_MODEL_LABEL_TO_ID.keys())


def sanitize_text(value):
    return str(value or "").strip()


def rel_path(path):
    return os.path.relpath(path, BASE_DIR).replace("\\", "/")


def ensure_syllable_fields(item):
    item["syllable_text"] = sanitize_text(item.get("syllable_text"))
    value = item.get("syllable_pronunciation")
    if not isinstance(value, list):
        value = []
    item["syllable_pronunciation"] = [sanitize_text(part) for part in value if sanitize_text(part)]
    item["memory_tip"] = sanitize_text(item.get("memory_tip"))
    proper_noun_type = item.get("proper_noun_type")
    if proper_noun_type is None:
        item["proper_noun_type"] = None
    else:
        proper_noun_type = sanitize_text(proper_noun_type).lower()
        item["proper_noun_type"] = (
            proper_noun_type
            if proper_noun_type in {"person", "place", "country_region", "organization", "other"}
            else None
        )
    return item


def build_empty_fill_payload():
    return {
        "syllable_text": "",
        "syllable_pronunciation": [],
        "memory_tip": "",
        "proper_noun_type": None,
    }


def build_copy_output_path(source_path):
    root, ext = os.path.splitext(source_path)
    candidate = f"{root}_mode3{ext}"
    if not os.path.exists(candidate):
        return candidate

    index = 2
    while True:
        candidate = f"{root}_mode3_{index}{ext}"
        if not os.path.exists(candidate):
            return candidate
        index += 1


def build_existing_payload(item):
    return {
        "syllable_text": sanitize_text(item.get("syllable_text")),
        "syllable_pronunciation": item.get("syllable_pronunciation", []),
        "memory_tip": sanitize_text(item.get("memory_tip")),
        "proper_noun_type": item.get("proper_noun_type"),
    }


def extract_prompt_meaning_and_pos(item):
    meanings = item.get("meanings")
    if not isinstance(meanings, list) or not meanings:
        return sanitize_text(item.get("meaning")), sanitize_text(item.get("pos"))

    meaning_parts = []
    pos_parts = []
    for meaning_item in meanings:
        if not isinstance(meaning_item, dict):
            continue
        pos_text = sanitize_text(meaning_item.get("pos"))
        meaning_text = sanitize_text(meaning_item.get("meaning"))
        if pos_text and pos_text not in pos_parts:
            pos_parts.append(pos_text)
        if meaning_text and meaning_text not in meaning_parts:
            meaning_parts.append(meaning_text)

    merged_meaning = "；".join(meaning_parts)
    merged_pos = " / ".join(pos_parts)
    return merged_meaning, merged_pos


def discover_word_jsonl_files():
    found = []

    if os.path.isdir(DATA_DIR):
        for root, _, files in os.walk(DATA_DIR):
            for name in files:
                if not name.lower().endswith(".jsonl"):
                    continue
                abs_path = os.path.join(root, name)
                if "/单词/" in rel_path(abs_path):
                    found.append(abs_path)

    if os.path.isdir(LEGACY_DATA_DIR):
        for root, _, files in os.walk(LEGACY_DATA_DIR):
            for name in files:
                if name.lower().endswith(".jsonl") and "单词" in name:
                    found.append(os.path.join(root, name))

    return sorted(set(found))


def load_jsonl_rows(path):
    rows = []
    with open(path, "r", encoding="utf-8-sig") as rf:
        for line_no, line in enumerate(rf, start=1):
            raw = line.rstrip("\n")
            if not raw.strip():
                rows.append(None)
                continue
            try:
                row = json.loads(raw)
            except Exception as exc:
                raise ValueError(f"{path} 第 {line_no} 行不是合法 JSON: {exc}") from exc
            if not isinstance(row, dict):
                raise ValueError(f"{path} 第 {line_no} 行不是 JSON 对象。")
            rows.append(row)
    return rows


def write_jsonl_rows(path, rows):
    with open(path, "w", encoding="utf-8") as wf:
        for row in rows:
            if row is None:
                wf.write("\n")
            else:
                wf.write(json.dumps(row, ensure_ascii=False) + "\n")


def render_model_selector(widget_label, default_model_id, picker_key):
    safe_default_id = default_model_id if default_model_id in OPENROUTER_MODEL_ID_TO_LABEL else DEFAULT_MODEL
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
    first = sanitize_text(primary_key)
    if first:
        keys.append(first)
    for line in str(multi_text or "").splitlines():
        key = sanitize_text(line)
        if key and key not in keys:
            keys.append(key)
    return keys


def pick_api_key_for_job(api_keys, job_idx):
    if not api_keys:
        return ""
    return api_keys[job_idx % len(api_keys)]


def build_api_slot_label(api_keys, job_idx):
    if not api_keys:
        return "API-1"
    return f"API-{(job_idx % len(api_keys)) + 1}"


def normalize_word_item_for_prompt(item, line_no):
    meaning_text, pos_text = extract_prompt_meaning_and_pos(item)
    return {
        "line_no": int(line_no),
        "word": sanitize_text(item.get("word")),
        "phonetic": sanitize_text(item.get("phonetic")),
        "meaning": meaning_text,
        "pos": pos_text,
        "type": sanitize_text(item.get("type")) or "word",
    }


def build_prompt_payload(items):
    return json.dumps(items, ensure_ascii=False)


def extract_json_object(text):
    content = sanitize_text(text)
    if not content:
        return {}
    try:
        return json.loads(content)
    except Exception:
        match = re.search(r"\{.*\}", content, flags=re.S)
        if match:
            return json.loads(match.group(0))
    return {}


IPA_VOWEL_PATTERN = re.compile(r"[aeiouyɑæʌəɜɛɪiɔɒuʊɚɝœɒɨɐ]")
TAIL_ONLY_SEGMENTS = {
    "r", "n", "m", "l", "s", "z", "t", "d", "k", "g", "f", "v", "p", "b",
    "nt", "nd", "st", "rd", "ld", "rt", "mp", "ŋ", "ʃ", "ʒ", "θ", "ð",
}
FORCE_FILL_SUFFIXES = (
    "tion", "sion", "cian", "ture", "sure", "able", "ible", "ment", "ness",
    "ship", "hood", "ward", "wise", "ing", "edly", "fully", "ously", "ally",
    "ical", "icle", "ify", "ise", "ize", "ous",
    "ive", "ant", "ent", "ary", "ory", "eer", "er", "or",
    "ly", "ty", "fy", "age", "ism", "ist",
)


def normalize_alpha_word(word):
    return re.sub(r"[^A-Za-z]", "", sanitize_text(word))


def estimate_spelling_syllable_groups(word):
    alpha = normalize_alpha_word(word).lower()
    if not alpha:
        return 0
    groups = re.findall(r"[aeiouy]+", alpha)
    return len(groups)


def ipa_part_has_vowel(part):
    return bool(IPA_VOWEL_PATTERN.search(sanitize_text(part).lower()))


def is_tail_only_pronunciation_part(part):
    cleaned = sanitize_text(part).lower().replace("ˈ", "").replace("ˌ", "")
    cleaned = cleaned.replace("(", "").replace(")", "")
    if not cleaned:
        return False
    if ipa_part_has_vowel(cleaned):
        return False
    return cleaned in TAIL_ONLY_SEGMENTS or len(cleaned) <= 2


def should_force_fill_word(item):
    word = sanitize_text(item.get("word"))
    alpha = normalize_alpha_word(word)
    if not alpha or len(alpha) <= 4 or alpha.isupper():
        return False

    phonetic = sanitize_text(item.get("phonetic"))
    lower_alpha = alpha.lower()
    vowel_groups = estimate_spelling_syllable_groups(alpha)
    has_stress_mark = any(mark in phonetic for mark in ["ˈ", "ˌ", "'"])
    long_word = len(alpha) >= 6
    rich_suffix = lower_alpha.endswith(FORCE_FILL_SUFFIXES)

    if rich_suffix and vowel_groups >= 2:
        return True
    if has_stress_mark and (long_word or vowel_groups >= 2):
        return True
    if len(alpha) >= 7 and vowel_groups >= 2:
        return True
    return False


def validate_syllable_result(item, original_word=""):
    word = sanitize_text(original_word)
    syllable_text = sanitize_text(item.get("syllable_text"))
    memory_tip = sanitize_text(item.get("memory_tip"))
    pronunciation = item.get("syllable_pronunciation")
    proper_noun_type = item.get("proper_noun_type")
    if proper_noun_type is not None:
        proper_noun_type = sanitize_text(proper_noun_type).lower() or None
    if proper_noun_type not in {"person", "place", "country_region", "organization", "other", None}:
        proper_noun_type = None

    if not word:
        return build_empty_fill_payload(), "invalid_original_word"

    if not syllable_text or not isinstance(pronunciation, list) or not memory_tip:
        if proper_noun_type is not None:
            return {
                "syllable_text": "",
                "syllable_pronunciation": [],
                "memory_tip": "",
                "proper_noun_type": proper_noun_type,
            }, "proper_only"
        return {
            "syllable_text": "",
            "syllable_pronunciation": [],
            "memory_tip": "",
            "proper_noun_type": proper_noun_type,
        }, "empty_result"

    clean_parts = [sanitize_text(part) for part in pronunciation if sanitize_text(part)]
    text_parts = [part for part in syllable_text.split("-") if sanitize_text(part)]
    if len(clean_parts) < 2 or len(text_parts) < 2 or len(clean_parts) != len(text_parts):
        return {
            "syllable_text": "",
            "syllable_pronunciation": [],
            "memory_tip": "",
            "proper_noun_type": proper_noun_type,
        }, "invalid_alignment"

    if any(not ipa_part_has_vowel(part) for part in clean_parts):
        return {
            "syllable_text": "",
            "syllable_pronunciation": [],
            "memory_tip": "",
            "proper_noun_type": proper_noun_type,
        }, "invalid_pronunciation_part"

    if any(is_tail_only_pronunciation_part(part) for part in clean_parts):
        return {
            "syllable_text": "",
            "syllable_pronunciation": [],
            "memory_tip": "",
            "proper_noun_type": proper_noun_type,
        }, "tail_only_segment"

    return {
        "syllable_text": syllable_text,
        "syllable_pronunciation": clean_parts,
        "memory_tip": memory_tip,
        "proper_noun_type": proper_noun_type,
    }, "valid"


def call_syllable_fill_api(batch_items, api_key, base_url, model_name, force_fill=False):
    client = get_openai_client(api_key, base_url)
    payload = build_prompt_payload(batch_items)
    extra_force_rules = ""
    if force_fill:
        extra_force_rules = """
18. 本批词条是系统二次复核后判定“较可能需要分音节学习”的词，请比第一次更积极地补全分音节，但前提仍然是准确。
19. 像 family、mother、father、teacher、student、rabbit、giraffe、school、twenty 这类教材常见双音节或多音节词，通常应给出分音节结果，而不是直接置空。
20. 严禁把尾辅音或辅音簇单独当成一个音节，例如 `r`、`n`、`nt`、`l`、`s` 不能单独作为 syllable_pronunciation 的一项。
21. syllable_pronunciation 的每一项都必须对应一个真正可发音的音节核，不能只是词尾残片。
""".strip()
    prompt = f"""
你是一个英语教学内容质检专家。请根据每个单词的拼写、音标、词义，补全适合中国学生记忆的分音节学习字段。

要求：
1. 只输出 JSON 对象。
2. 返回格式必须是：
{{
  "items": [
    {{
      "line_no": 1,
      "syllable_text": "ba-na-na",
      "syllable_pronunciation": ["bə", "næ", "nə"],
      "memory_tip": "共3个音节，重读第2个音节，像 ba-NA-na。",
      "proper_noun_type": null
    }}
  ]
}}
3. 必须按输入 line_no 原样返回。
4. `proper_noun_type` 只能填写 `person`、`place`、`country_region`、`organization`、`other` 或 `null`。
5. 如果是明确的人名，填 `person`；如果是明确的地名，填 `place`；如果是明确的国家、地区、政治实体，填 `country_region`；如果是明确的机构、组织、学校、政府组织、国际组织、军队、考试体系等，填 `organization`。
6. 如果是其他专有名词，但不属于以上四类，例如作品名、节日名、天体名、专有项目名、专有称谓缩写等，填 `other`；如果不是专有名词，填 `null`。
7. 称谓类如 `Mr`、`Mrs`、`Ms`、`Dr` 不单独设类型，一般归入 `other`；如果语境不足、把握不高，也可以填 `null`。
8. 专有名词判断不能只看首字母大写，要结合词义、词性和常见教材语境判断。
9. 如果单词过短、过简单、拼读路径非常直接，普通学生通常不需要借助分音节学习也能掌握，请不要生成分音节学习内容，直接把 `syllable_text`、`syllable_pronunciation`、`memory_tip` 置空。
10. 以下情况通常不需要生成分音节学习内容：单音节词、超短词、常见高频基础词、虽然可机械拆分但拆分后对记忆帮助很小的简单词。
11. 只有当“分音节拆分确实有助于学生记忆、拼读或重音把握”时，才生成分音节三个字段；不要为了覆盖率给简单词硬做拆分。
12. 如果某个词不适合做分音节学习，或者你无法高置信度判断，请把分音节三个字段置空；`proper_noun_type` 仍按最稳妥结果返回，没把握就填 `null`。
13. syllable_text 必须使用连字符 `-` 连接。
14. syllable_pronunciation 必须是数组，并且和 syllable_text 的音节数量一一对应。
15. memory_tip 必须是自然、简洁、适合学生记忆的中文提示；如果置空，则三个分音节字段一起置空。
16. 优先保证准确率，不要为了覆盖率强行猜测。
17. 对于多读音、缩写、词组化项目，也请谨慎；无把握就把分音节字段置空，专有名词字段填 `null`。
{extra_force_rules}

输入数据：
{payload}
""".strip()

    response = client.chat.completions.create(
        model=model_name,
        messages=[
            {"role": "system", "content": "你只返回合法 JSON，不要输出额外说明。"},
            {"role": "user", "content": prompt},
        ],
        temperature=0.1,
        response_format={"type": "json_object"},
    )
    content = response.choices[0].message.content or "{}"
    parsed = extract_json_object(content)
    items = parsed.get("items", [])
    if not isinstance(items, list):
        return []
    return items


def enrich_batch_with_retry(batch_items, api_key, base_url, model_name):
    last_error = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            raw_items = call_syllable_fill_api(batch_items, api_key, base_url, model_name)
            result_map = {}
            reason_map = {}
            source_by_line = {int(item.get("line_no", 0)): item for item in batch_items}
            for raw in raw_items:
                if not isinstance(raw, dict):
                    continue
                line_no = raw.get("line_no")
                try:
                    line_no = int(line_no)
                except Exception:
                    continue
                original_item = next((item for item in batch_items if int(item.get("line_no", 0)) == line_no), {})
                payload, reason = validate_syllable_result(
                    raw,
                    original_word=original_item.get("word", ""),
                )
                result_map[line_no] = payload
                reason_map[line_no] = reason

            retry_items = []
            for line_no, source_item in source_by_line.items():
                payload = result_map.get(line_no)
                reason = reason_map.get(line_no, "")
                if payload is None:
                    continue
                if payload.get("syllable_text"):
                    continue
                if not should_force_fill_word(source_item):
                    continue
                if reason not in {"empty_result", "invalid_alignment", "invalid_pronunciation_part", "tail_only_segment"}:
                    continue
                retry_items.append(source_item)

            if retry_items:
                retry_raw_items = call_syllable_fill_api(
                    retry_items,
                    api_key,
                    base_url,
                    model_name,
                    force_fill=True,
                )
                for raw in retry_raw_items:
                    if not isinstance(raw, dict):
                        continue
                    line_no = raw.get("line_no")
                    try:
                        line_no = int(line_no)
                    except Exception:
                        continue
                    original_item = source_by_line.get(line_no, {})
                    payload, reason = validate_syllable_result(
                        raw,
                        original_word=original_item.get("word", ""),
                    )
                    if payload.get("syllable_text"):
                        result_map[line_no] = payload
                        reason_map[line_no] = f"retry_{reason}"
            return result_map, reason_map
        except Exception as exc:
            last_error = exc
            time.sleep(attempt)
    raise RuntimeError(f"批次补全失败：{last_error}")


def process_file_with_api(
    source_file_path,
    output_file_path,
    api_key,
    api_label,
    base_url,
    model_name,
    batch_size,
    event_queue=None,
    job_uid="",
):
    rows = load_jsonl_rows(source_file_path)
    total_rows = len(rows)
    candidates = []
    for idx, row in enumerate(rows):
        if row is None or not isinstance(row, dict):
            continue
        item_type = sanitize_text(row.get("type")).lower()
        if item_type and item_type != "word":
            row.update(build_empty_fill_payload())
            continue
        candidates.append((idx, normalize_word_item_for_prompt(row, idx + 1)))

    total_candidates = len(candidates)
    if total_candidates == 0:
        write_jsonl_rows(output_file_path, rows)
        if event_queue:
            event_queue.put(
                {
                    "type": "job_done",
                    "uid": job_uid,
                    "processed_rows": 0,
                    "updated_rows": 0,
                    "filled_rows": 0,
                    "failed_rows": 0,
                    "output_file": output_file_path,
                }
            )
        return {
            "source_file": source_file_path,
            "output_file": output_file_path,
            "rows": total_rows,
            "processed_rows": 0,
            "updated_rows": 0,
            "filled_rows": 0,
            "failed_rows": 0,
            "finished_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        }

    detail_records = []
    debug_records = []
    updated_rows = 0
    filled_rows = 0
    failed_rows = 0
    chunks = [candidates[i : i + batch_size] for i in range(0, total_candidates, batch_size)]

    if event_queue:
        event_queue.put(
            {
                "type": "job_started",
                "uid": job_uid,
                "api_label": api_label,
                "total_batches": len(chunks),
                "total_candidates": total_candidates,
                "output_file": output_file_path,
            }
        )

    for chunk_idx, chunk in enumerate(chunks):
        request_items = [item for _, item in chunk]
        result_map = {}
        reason_map = {}
        batch_error = None
        try:
            result_map, reason_map = enrich_batch_with_retry(request_items, api_key, base_url, model_name)
        except Exception as exc:
            batch_error = str(exc)

        debug_records.append(
            {
                "文件": rel_path(output_file_path),
                "批次": chunk_idx + 1,
                "API": api_label,
                "状态": "API异常" if batch_error else "API完成",
                "说明": batch_error or f"本批请求 {len(chunk)} 条，模型已返回结果。",
            }
        )

        for row_index, prompt_item in chunk:
            line_no = prompt_item["line_no"]
            row = dict(rows[row_index])
            original = dict(row)
            if batch_error:
                payload = build_existing_payload(original)
                debug_status = "保留原值"
                debug_reason = "批次请求失败，未覆盖原有字段。"
                failed_rows += 1
            else:
                payload = result_map.get(line_no)
                if payload is None:
                    payload = build_existing_payload(original)
                    debug_status = "保留原值"
                    debug_reason = "模型返回中缺少该 line_no，未覆盖原有字段。"
                else:
                    reason = reason_map.get(line_no, "unknown")
                    debug_reason_map = {
                        "valid": "模型结果通过校验，已写入。",
                        "retry_valid": "二次补请求结果通过校验，已写入。",
                        "proper_only": "仅专有名词判断有效，分音节字段置空。",
                        "empty_result": "模型明确返回空结果。",
                        "invalid_alignment": "模型返回的音节拆分和发音数量不匹配，已置空。",
                        "invalid_pronunciation_part": "模型返回了不完整的发音片段，已置空。",
                        "tail_only_segment": "模型把尾辅音或辅音簇单独拆成音节，已置空。",
                        "invalid_original_word": "原始词条缺少 word，已置空。",
                        "unknown": "结果已处理。",
                    }
                    debug_status = "已写入" if reason in {"valid", "retry_valid"} else "已校正"
                    debug_reason = debug_reason_map.get(reason, "结果已处理。")
            row.update(payload)
            rows[row_index] = ensure_syllable_fields(row)
            if rows[row_index] != original:
                updated_rows += 1
            if rows[row_index].get("syllable_text"):
                filled_rows += 1

            detail_records.append(
                {
                    "文件": rel_path(output_file_path),
                    "序号": line_no,
                    "单词": sanitize_text(rows[row_index].get("word")),
                    "音标": sanitize_text(rows[row_index].get("phonetic")),
                    "分音节": sanitize_text(rows[row_index].get("syllable_text")),
                    "发音拆分": " | ".join(rows[row_index].get("syllable_pronunciation", [])),
                    "记忆提示": sanitize_text(rows[row_index].get("memory_tip")),
                    "专名标签": rows[row_index].get("proper_noun_type"),
                }
            )
            debug_records.append(
                {
                    "文件": rel_path(output_file_path),
                    "序号": line_no,
                    "单词": sanitize_text(rows[row_index].get("word")),
                    "API": api_label,
                    "状态": debug_status,
                    "说明": debug_reason,
                }
            )

            if event_queue:
                event_queue.put(
                    {
                        "type": "item",
                        "uid": job_uid,
                        "row": detail_records[-1],
                    }
                )
                event_queue.put(
                    {
                        "type": "debug",
                        "uid": job_uid,
                        "row": debug_records[-1],
                    }
                )

        write_jsonl_rows(output_file_path, rows)

        completed = min((chunk_idx + 1) * batch_size, total_candidates)
        if event_queue:
            event_queue.put(
                {
                    "type": "batch_done",
                    "uid": job_uid,
                    "batch_idx": chunk_idx + 1,
                    "total_batches": len(chunks),
                    "completed_rows": completed,
                    "total_candidates": total_candidates,
                    "filled_rows": filled_rows,
                    "failed_rows": failed_rows,
                    "updated_rows": updated_rows,
                    "api_label": api_label,
                    "last_error": batch_error or "",
                }
            )

    if event_queue:
        event_queue.put(
            {
                "type": "job_done",
                "uid": job_uid,
                "processed_rows": total_candidates,
                "updated_rows": updated_rows,
                "filled_rows": filled_rows,
                "failed_rows": failed_rows,
                "output_file": output_file_path,
            }
        )
    return {
        "source_file": source_file_path,
        "output_file": output_file_path,
        "rows": total_rows,
        "processed_rows": total_candidates,
        "updated_rows": updated_rows,
        "filled_rows": filled_rows,
        "failed_rows": failed_rows,
        "finished_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    }


def render_summary(summary_rows):
    if not summary_rows:
        return
    table = pd.DataFrame(
        [
            {
                "源文件": rel_path(item["source_file"]),
                "输出文件": rel_path(item["output_file"]),
                "总行数": item["rows"],
                "处理词条": item["processed_rows"],
                "发生写入": item["updated_rows"],
                "成功填充": item["filled_rows"],
                "失败行数": item["failed_rows"],
                "完成时间": item["finished_at"],
            }
            for item in summary_rows
        ]
    )
    st.dataframe(table, use_container_width=True, hide_index=True)


def main():
    with st.sidebar:
        st.header("补全 API 配置")
        base_url = st.text_input("补全 Base URL", value=DEFAULT_BASE_URL, key="mode3_base_url")
        model_name = render_model_selector(
            "补全模型（下拉勾选，单选）",
            st.session_state.get("mode3_model_name", DEFAULT_MODEL),
            "mode3_model_picker",
        )
        st.session_state.mode3_model_name = model_name
        st.caption(f"补全模型ID：`{model_name}`")

        if "mode3_api_key_count" not in st.session_state:
            st.session_state.mode3_api_key_count = 1

        key_col, add_col = st.columns([6, 1])
        with key_col:
            st.text_input("补全 API Key", type="password", key="mode3_api_key_1")
        with add_col:
            st.write("")
            st.write("")
            if st.button("＋", key="btn_mode3_add_api", help="新增一个 API Key 输入框"):
                st.session_state.mode3_api_key_count += 1
                st.rerun()

        for idx in range(2, int(st.session_state.mode3_api_key_count) + 1):
            row_col, del_col = st.columns([6, 1])
            with row_col:
                st.text_input(f"补全 API Key {idx}", type="password", key=f"mode3_api_key_{idx}")
            with del_col:
                st.write("")
                st.write("")
                if st.button("－", key=f"btn_mode3_del_api_{idx}", help=f"删除 API Key {idx}"):
                    total = int(st.session_state.mode3_api_key_count)
                    for j in range(idx, total):
                        st.session_state[f"mode3_api_key_{j}"] = st.session_state.get(f"mode3_api_key_{j+1}", "")
                    st.session_state.pop(f"mode3_api_key_{total}", None)
                    st.session_state.mode3_api_key_count = max(1, total - 1)
                    st.rerun()

        api_keys = []
        for idx in range(1, int(st.session_state.mode3_api_key_count) + 1):
            value = sanitize_text(st.session_state.get(f"mode3_api_key_{idx}", ""))
            if value and value not in api_keys:
                api_keys.append(value)

        st.caption(f"当前可用补全 Key 数量：{len(api_keys)}")

        if st.button("一键测试全部 API", key="btn_mode3_test_all_api"):
            if not api_keys:
                st.warning("请先输入至少一个 API Key。")
            else:
                test_rows = []
                with st.spinner("正在测试 API 连通性..."):
                    for i, api_key in enumerate(api_keys, start=1):
                        ok = False
                        msg = ""
                        try:
                            client = get_openai_client(api_key, base_url)
                            _ = client.chat.completions.create(
                                model=model_name,
                                messages=[{"role": "user", "content": "ping"}],
                                temperature=0,
                                max_tokens=1,
                                timeout=20,
                            )
                            ok = True
                            msg = f"第{i}个API可用"
                        except Exception as exc:
                            msg = f"第{i}个API不可用：{exc}"
                        test_rows.append((ok, msg))

                for ok, msg in test_rows:
                    if ok:
                        st.success(msg)
                    else:
                        st.error(msg)

        output_mode = st.radio(
            "输出方式",
            options=["原文件写回", "同目录新建副本"],
            horizontal=False,
            key="mode3_output_mode",
        )
        st.caption("选择“同目录新建副本”时，会在源文件同目录生成 `_mode3.jsonl`，如重名则自动顺延为 `_mode3_2.jsonl`、`_mode3_3.jsonl`。")

        batch_size = st.number_input("每批次词条数", min_value=5, max_value=50, value=20, step=5, key="mode3_batch_size")

    tab1 = st.tabs(["模式三：单词分音节 AI 补全"])[0]

    with tab1:
        st.subheader("模式三：单词 JSONL 分音节补全（AI 批量补全 + 写回或副本输出）")
        st.caption(
            "扫描本地单词 JSONL 文件，调用 API 批量补全 "
            "`syllable_text`、`syllable_pronunciation`、`memory_tip`、`proper_noun_type`，"
            "并按所选输出方式分批写回。"
        )

        discovered_files = discover_word_jsonl_files()
        file_options = {rel_path(path): path for path in discovered_files}

        st.markdown("**文件选择**")
        select_all = st.checkbox("默认全选当前扫描到的单词文件", value=False, key="mode3_select_all")
        selected_labels = st.multiselect(
            "选择要处理的本地单词 JSONL 文件",
            options=list(file_options.keys()),
            default=list(file_options.keys()) if select_all else [],
            key="mode3_file_selector",
        )
        st.info(
            "这一版直接调用模型做分音节补全，不再依赖本地规则。"
            "如果模型对某个词没有把握，应返回空的分音节字段；"
            "专有名词标签仅允许为 `person`、`place`、`other` 或 `null`。"
        )
        if discovered_files:
            st.success(f"当前共扫描到 {len(discovered_files)} 个单词 JSONL 文件。")
        else:
            st.warning("当前未扫描到可处理的本地单词 JSONL 文件。")

        if "mode3_last_summary" not in st.session_state:
            st.session_state.mode3_last_summary = []

        c_start, c_info = st.columns([3, 2])
        with c_start:
            run_button = st.button(
                "开始批量补全（模式三）",
                type="primary",
                disabled=(not selected_labels or not api_keys),
                key="btn_mode3_fill",
            )
        with c_info:
            st.caption("处理过程中会按批次持续写出到你选择的目标文件。")

        status_placeholder = st.empty()
        mode3_progress = st.empty()
        mode3_table_placeholder = st.empty()
        mode3_detail_placeholder = st.empty()

        if run_button:
            selected_files = [file_options[label] for label in selected_labels]
            summary_rows = []
            event_queue = Queue()
            jobs = []
            total_batches = 0
            live_rows = {}
            live_recent = {}
            live_debug = {}
            detail_placeholders = {}
            debug_placeholders = {}

            for file_index, file_path in enumerate(selected_files):
                file_label = selected_labels[file_index]
                output_file_path = file_path if output_mode == "原文件写回" else build_copy_output_path(file_path)
                row_count = len(load_jsonl_rows(file_path))
                candidate_count = 0
                for row in load_jsonl_rows(file_path):
                    if row is None or not isinstance(row, dict):
                        continue
                    item_type = sanitize_text(row.get("type")).lower()
                    if item_type and item_type != "word":
                        continue
                    candidate_count += 1
                total_job_batches = max(1, (candidate_count + int(batch_size) - 1) // int(batch_size)) if candidate_count else 1
                total_batches += total_job_batches
                api_key = pick_api_key_for_job(api_keys, file_index)
                api_label = build_api_slot_label(api_keys, file_index)
                job_uid = f"mode3_{file_index}_{abs(hash(file_path))}"
                jobs.append(
                    {
                        "uid": job_uid,
                        "label": file_label,
                        "source_file": file_path,
                        "output_file": output_file_path,
                        "api_key": api_key,
                        "api_label": api_label,
                        "row_count": row_count,
                        "candidate_count": candidate_count,
                        "total_batches": total_job_batches,
                    }
                )
                live_rows[job_uid] = {
                    "教材": file_label,
                    "状态": "queued",
                    "API序号": api_label,
                    "总批次": total_job_batches,
                    "已完成": 0,
                    "候选词条": candidate_count,
                    "已填充": 0,
                    "失败行数": 0,
                    "输出文件": rel_path(output_file_path),
                }
                live_recent[job_uid] = []
                live_debug[job_uid] = []

            with mode3_detail_placeholder.container():
                st.markdown("**实时回传（按教材分组，逐条追加）**")
                for job in jobs:
                    with st.expander(job["label"], expanded=False):
                        st.caption(f"输出：`{rel_path(job['output_file'])}` | 分配 {job['api_label']}")
                        with st.expander("结果明细", expanded=True):
                            detail_placeholders[job["uid"]] = st.empty()
                        with st.expander("调试日志", expanded=False):
                            debug_placeholders[job["uid"]] = st.empty()

            def render_mode3_live():
                with mode3_table_placeholder.container():
                    st.markdown("**提取进度（按教材）**")
                    st.dataframe(pd.DataFrame(list(live_rows.values())), use_container_width=True, hide_index=True)

            def push_recent(uid, row):
                rows = live_recent.setdefault(uid, [])
                rows.append(row)
                if len(rows) > 200:
                    live_recent[uid] = rows[-200:]
                    rows = live_recent[uid]
                ph = detail_placeholders.get(uid)
                if ph:
                    ph.dataframe(pd.DataFrame(rows), use_container_width=True, hide_index=True)

            def push_debug(uid, row):
                rows = live_debug.setdefault(uid, [])
                rows.append(row)
                if len(rows) > 300:
                    live_debug[uid] = rows[-300:]
                    rows = live_debug[uid]
                ph = debug_placeholders.get(uid)
                if ph:
                    ph.dataframe(pd.DataFrame(rows), use_container_width=True, hide_index=True)

            def worker_run(job):
                return process_file_with_api(
                    source_file_path=job["source_file"],
                    output_file_path=job["output_file"],
                    api_key=job["api_key"],
                    api_label=job["api_label"],
                    base_url=base_url,
                    model_name=model_name,
                    batch_size=int(batch_size),
                    event_queue=event_queue,
                    job_uid=job["uid"],
                )

            max_workers = max(1, min(len(api_keys), len(jobs)))
            done_batches = 0
            render_mode3_live()
            mode3_progress.progress(0.0)
            status_placeholder.info(f"开始并行处理：教材 {len(jobs)} 本，API {len(api_keys)} 个，并发 {max_workers}。")

            executor = ThreadPoolExecutor(max_workers=max_workers)
            futures = {executor.submit(worker_run, job): job for job in jobs}
            while True:
                had_event = False
                while True:
                    try:
                        event = event_queue.get_nowait()
                    except Empty:
                        break
                    had_event = True
                    uid = event.get("uid")
                    row_ref = live_rows.get(uid)
                    if not row_ref:
                        continue
                    event_type = event.get("type")
                    if event_type == "job_started":
                        row_ref["状态"] = "running"
                        row_ref["API序号"] = event.get("api_label", row_ref.get("API序号", ""))
                    elif event_type == "item":
                        push_recent(uid, event.get("row", {}))
                    elif event_type == "debug":
                        push_debug(uid, event.get("row", {}))
                    elif event_type == "batch_done":
                        row_ref["状态"] = "running"
                        row_ref["已完成"] = int(event.get("batch_idx", row_ref.get("已完成", 0)))
                        row_ref["已填充"] = int(event.get("filled_rows", row_ref.get("已填充", 0)))
                        row_ref["失败行数"] = int(event.get("failed_rows", row_ref.get("失败行数", 0)))
                        done_batches += 1
                        mode3_progress.progress(min(1.0, done_batches / max(1, total_batches)))
                        status_text = (
                            f"当前任务：`{row_ref['教材']}`\n\n"
                            f"分配接口：{row_ref['API序号']}\n\n"
                            f"批次进度：{row_ref['已完成']}/{row_ref['总批次']}，"
                            f"已填充 {row_ref['已填充']} 行，失败 {row_ref['失败行数']} 行。"
                        )
                        if event.get("last_error"):
                            status_text += f"\n\n最近批次异常：{event.get('last_error')}"
                        status_placeholder.info(status_text)
                    elif event_type == "job_done":
                        row_ref["状态"] = "done"
                        row_ref["已填充"] = int(event.get("filled_rows", row_ref.get("已填充", 0)))
                        row_ref["失败行数"] = int(event.get("failed_rows", row_ref.get("失败行数", 0)))
                    render_mode3_live()

                if all(f.done() for f in futures):
                    break
                if not had_event:
                    time.sleep(0.08)

            for future, job in futures.items():
                try:
                    summary_rows.append(future.result())
                except Exception as exc:
                    live_rows[job["uid"]]["状态"] = "error"
                    push_debug(
                        job["uid"],
                        {
                            "文件": rel_path(job["output_file"]),
                            "序号": "",
                            "单词": "",
                            "API": job["api_label"],
                            "状态": "任务失败",
                            "说明": str(exc),
                        },
                    )
                    st.error(f"`{rel_path(job['source_file'])}` 处理失败：{exc}")

            render_mode3_live()
            st.session_state.mode3_last_summary = summary_rows
            status_placeholder.success("本轮处理已完成，所有任务队列都已执行结束。")

        if st.session_state.mode3_last_summary:
            st.markdown("**最近一次处理结果**")
            render_summary(st.session_state.mode3_last_summary)


if __name__ == "__main__":
    main()
