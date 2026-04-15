import asyncio
import json
import os
import re
import time
from typing import Any

import edge_tts
import streamlit as st
from openai import OpenAI


st.set_page_config(page_title="Tiger English - Phoneme Examples Tool", layout="wide", page_icon="T")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
AUDIO_DIR = os.path.join(BASE_DIR, "audio")
PHONETIC_AUDIO_DIR = os.path.join(AUDIO_DIR, "phonetics")
PHONETIC_DATA_DIR = os.path.join(BASE_DIR, "word_data", "phonetics_data")
DEFAULT_INPUT_PATH = os.path.join(PHONETIC_DATA_DIR, "english_phonemes_seed.jsonl")
DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_MODEL = "openai/gpt-4o-mini"
DEFAULT_VOICE = "en-GB-SoniaNeural"

PHONEME_TTS_TEXT_MAP = {
    "/i:/": "ee",
    "/ɪ/": "ih",
    "/e/": "eh",
    "/æ/": "aeh",
    "/ɜ:/": "er",
    "/ə/": "uh",
    "/ʌ/": "uh",
    "/u:/": "oo",
    "/ʊ/": "uu",
    "/ɔ:/": "or",
    "/ɒ/": "o",
    "/ɑ:/": "ah",
    "/eɪ/": "ay",
    "/aɪ/": "eye",
    "/ɔɪ/": "oy",
    "/ɪə/": "ear",
    "/eə/": "air",
    "/ʊə/": "poor",
    "/aʊ/": "ow",
    "/əʊ/": "oh",
    "/p/": "p",
    "/b/": "b",
    "/t/": "t",
    "/d/": "d",
    "/k/": "k",
    "/g/": "g",
    "/f/": "fff",
    "/v/": "vvv",
    "/θ/": "th",
    "/ð/": "this",
    "/s/": "sss",
    "/z/": "zzz",
    "/ʃ/": "sh",
    "/ʒ/": "vision",
    "/h/": "h",
    "/ts/": "ts",
    "/dz/": "dz",
    "/tr/": "tr",
    "/dr/": "dr",
    "/tʃ/": "ch",
    "/dʒ/": "j",
    "/m/": "mmm",
    "/n/": "nnn",
    "/ŋ/": "ng",
    "/l/": "lll",
    "/r/": "rrr",
    "/j/": "y",
    "/w/": "w",
}


def ensure_dirs():
    os.makedirs(AUDIO_DIR, exist_ok=True)
    os.makedirs(PHONETIC_AUDIO_DIR, exist_ok=True)
    os.makedirs(PHONETIC_DATA_DIR, exist_ok=True)


def make_task_id():
    return time.strftime("%Y%m%d_%H%M%S")


def normalize_phonetic(value: str) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    if text.startswith("/") and text.endswith("/"):
        return text
    return f"/{text.strip('/')}/"


def safe_text(value: Any) -> str:
    return "" if value is None else str(value).strip()


def load_jsonl(path: str) -> list[dict]:
    rows: list[dict] = []
    with open(path, "r", encoding="utf-8") as rf:
        for line in rf:
            line = line.strip()
            if not line:
                continue
            rows.append(json.loads(line))
    return rows


def save_jsonl(path: str, rows: list[dict]):
    with open(path, "w", encoding="utf-8") as wf:
        for row in rows:
            wf.write(json.dumps(row, ensure_ascii=False) + "\n")


def build_default_output_path(input_path: str) -> str:
    stem, ext = os.path.splitext(input_path)
    return f"{stem}_mode6_working{ext}"


def load_working_rows(input_path: str, output_path: str) -> list[dict]:
    if os.path.exists(output_path):
        return load_jsonl(output_path)
    return load_jsonl(input_path)


def resolve_output_path(input_path: str, output_path: str, overwrite_source: bool) -> str:
    if overwrite_source:
        return input_path
    return output_path.strip() or build_default_output_path(input_path)


def to_abs_media_path(rel_path: str) -> str:
    cleaned = safe_text(rel_path)
    if not cleaned:
        return ""
    if cleaned.startswith("./"):
        cleaned = cleaned[2:]
    cleaned = cleaned.replace("/", os.sep)
    return os.path.join(BASE_DIR, cleaned)


def read_audio_bytes(rel_path: str) -> bytes | None:
    abs_path = to_abs_media_path(rel_path)
    if not abs_path or not os.path.exists(abs_path):
        return None
    with open(abs_path, "rb") as rf:
        return rf.read()


def validate_examples(raw_examples: Any) -> list[dict]:
    if not isinstance(raw_examples, list):
        raise RuntimeError("模型返回的 example_words 不是数组")
    cleaned: list[dict] = []
    for item in raw_examples[:3]:
        if not isinstance(item, dict):
            continue
        word = safe_text(item.get("word"))
        phonetic = normalize_phonetic(safe_text(item.get("phonetic")))
        zh = safe_text(item.get("zh"))
        if not word or not zh or not phonetic:
            continue
        if not re.fullmatch(r"[A-Za-z][A-Za-z\s'\-]*", word):
            continue
        cleaned.append({
            "word": word,
            "phonetic": phonetic,
            "zh": zh,
            "word_audio": "",
        })
    if len(cleaned) != 3:
        raise RuntimeError("模型未返回 3 个有效例词")
    return cleaned


def get_phoneme_tts_text(phonetic: str) -> str:
    normalized = normalize_phonetic(phonetic)
    return PHONEME_TTS_TEXT_MAP.get(normalized, normalized.strip("/"))


def create_client(base_url: str, api_key: str) -> OpenAI:
    return OpenAI(base_url=base_url.strip(), api_key=api_key.strip())


def generate_examples(client: OpenAI, model_name: str, phonetic: str, category: str) -> list[dict]:
    prompt = f"""
你是英语中小学教学教研助手。
现在需要为一个英语音标生成 3 个非常常见、非常简单、适合中国中小学生学习的例词。

要求：
1. 目标音标：{phonetic}
2. 分类：{category}
3. 必须返回恰好 3 个例词
4. 单词必须尽量简单、常见、适合中小学
5. 不要专有名词，不要冷僻词，不要复杂派生词
6. 每个例词都要给出：
   - word：英文单词
   - phonetic：该单词的完整音标，必须使用双斜线包裹，如 /kæt/
   - zh：中文释义，尽量简短
7. 只返回 JSON，不要解释

返回格式：
{{
  "example_words": [
    {{"word": "...", "phonetic": "/.../", "zh": "..."}},
    {{"word": "...", "phonetic": "/.../", "zh": "..."}},
    {{"word": "...", "phonetic": "/.../", "zh": "..."}}
  ]
}}
""".strip()

    response = client.chat.completions.create(
        model=model_name,
        messages=[
            {"role": "system", "content": "你只输出合法 JSON。"},
            {"role": "user", "content": prompt},
        ],
        temperature=0.2,
        response_format={"type": "json_object"},
    )
    content = response.choices[0].message.content or "{}"
    payload = json.loads(content)
    return validate_examples(payload.get("example_words"))


async def generate_word_audio(text: str, output_path: str, voice: str):
    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(output_path)


def maybe_generate_word_audio(text: str, output_path: str, voice: str, overwrite_audio: bool):
    if overwrite_audio and os.path.exists(output_path):
        try:
            os.remove(output_path)
        except OSError:
            pass
    if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
        return
    asyncio.run(generate_word_audio(text, output_path, voice))


def update_meta(rows: list[dict], action_name: str):
    for row in rows:
        if row.get("record_type") == "meta":
            row["updated_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
            row["generator_mode"] = "mode6_phoneme_examples_audio"
            row["last_action"] = action_name
            row["word_audio_dir"] = "./audio/phonetics/"
            break


def run_generate_examples(
    rows: list[dict],
    output_path: str,
    client: OpenAI,
    model_name: str,
    progress_bar,
    status_placeholder,
    overwrite_examples: bool,
) -> list[dict]:
    phoneme_rows = [row for row in rows if row.get("record_type") != "meta"]
    total = len(phoneme_rows)
    done = 0
    update_meta(rows, "generate_examples")
    save_jsonl(output_path, rows)

    for row in rows:
        if row.get("record_type") == "meta":
            continue
        done += 1
        phonetic = normalize_phonetic(row.get("phonetic"))
        category = safe_text(row.get("category")) or "phoneme"
        row_id = safe_text(row.get("id"))
        status_placeholder.info(f"[补例词 {done}/{total}] {phonetic} ({row_id})")

        existing_examples = row.get("example_words")
        if overwrite_examples or not isinstance(existing_examples, list) or len(existing_examples) != 3:
            row["example_words"] = generate_examples(client, model_name, phonetic, category)
            save_jsonl(output_path, rows)

        progress_bar.progress(done / max(1, total))
    return rows


def run_generate_audio(
    rows: list[dict],
    output_path: str,
    voice: str,
    progress_bar,
    status_placeholder,
    overwrite_audio: bool,
) -> list[dict]:
    phoneme_rows = [row for row in rows if row.get("record_type") != "meta"]
    total = len(phoneme_rows)
    done = 0
    update_meta(rows, "generate_word_audio")
    save_jsonl(output_path, rows)

    for row in rows:
        if row.get("record_type") == "meta":
            continue
        done += 1
        phonetic = normalize_phonetic(row.get("phonetic"))
        row_id = safe_text(row.get("id"))
        status_placeholder.info(f"[录音 {done}/{total}] {phonetic} ({row_id})")

        examples = row.get("example_words")
        if not isinstance(examples, list) or len(examples) == 0:
            progress_bar.progress(done / max(1, total))
            continue

        for idx, example in enumerate(examples, start=1):
            word = safe_text(example.get("word"))
            if not word:
                continue
            audio_rel = f"./audio/phonetics/{row_id}_word_{idx}.mp3"
            audio_abs = os.path.join(PHONETIC_AUDIO_DIR, f"{row_id}_word_{idx}.mp3")
            maybe_generate_word_audio(word, audio_abs, voice, overwrite_audio)
            example["word_audio"] = audio_rel
            example["phonetic"] = normalize_phonetic(example.get("phonetic"))
            example["zh"] = safe_text(example.get("zh"))
            example["word"] = word

        save_jsonl(output_path, rows)
        progress_bar.progress(done / max(1, total))
    return rows


def run_generate_phoneme_audio(
    rows: list[dict],
    output_path: str,
    voice: str,
    progress_bar,
    status_placeholder,
    overwrite_audio: bool,
) -> list[dict]:
    phoneme_rows = [row for row in rows if row.get("record_type") != "meta"]
    total = len(phoneme_rows)
    done = 0
    update_meta(rows, "generate_phoneme_audio")
    save_jsonl(output_path, rows)

    for row in rows:
        if row.get("record_type") == "meta":
            continue
        done += 1
        phonetic = normalize_phonetic(row.get("phonetic"))
        row_id = safe_text(row.get("id"))
        status_placeholder.info(f"[音标录音 {done}/{total}] {phonetic} ({row_id})")

        audio_rel = f"./audio/phonetics/{row_id}_phoneme.mp3"
        audio_abs = os.path.join(PHONETIC_AUDIO_DIR, f"{row_id}_phoneme.mp3")
        tts_text = get_phoneme_tts_text(phonetic)
        maybe_generate_word_audio(tts_text, audio_abs, voice, overwrite_audio)
        row["phoneme_audio"] = audio_rel

        save_jsonl(output_path, rows)
        progress_bar.progress(done / max(1, total))
    return rows


ensure_dirs()

st.title("模式六：音标例词与单词录音")
st.caption("将例词补全与单词录音拆成两个独立步骤，并按音标逐条同步写入 JSONL。")

with st.sidebar:
    st.subheader("模式六配置")
    input_path = st.text_input("输入 JSONL 路径", value=DEFAULT_INPUT_PATH)
    overwrite_source = st.checkbox("直接覆盖源文件", value=True)
    output_path_input = st.text_input("输出 JSONL 路径", value=build_default_output_path(DEFAULT_INPUT_PATH if os.path.exists(DEFAULT_INPUT_PATH) else DEFAULT_INPUT_PATH), disabled=overwrite_source)
    base_url = st.text_input("LLM Base URL", value=DEFAULT_BASE_URL)
    model_name = st.text_input("LLM Model", value=DEFAULT_MODEL)
    api_key = st.text_input("API Key", type="password")
    voice = st.text_input("TTS Voice", value=DEFAULT_VOICE)
    overwrite_examples = st.checkbox("补例词时覆盖已有 example_words", value=False)
    overwrite_audio = st.checkbox("录音时覆盖已有单词音频", value=False)
    overwrite_phoneme_audio = st.checkbox("录制音标音频时覆盖已有 phoneme_audio", value=False)

if not os.path.exists(input_path):
    st.error(f"输入文件不存在：{input_path}")
    st.stop()

output_path = resolve_output_path(input_path, output_path_input, overwrite_source)
rows = load_working_rows(input_path, output_path)
phoneme_rows = [row for row in rows if row.get("record_type") != "meta"]
preview_rows = []
for row in phoneme_rows:
    examples = row.get("example_words") if isinstance(row.get("example_words"), list) else []
    audio_count = 0
    for item in examples:
        if isinstance(item, dict) and safe_text(item.get("word_audio")):
            audio_count += 1
    preview_rows.append({
        "id": safe_text(row.get("id")),
        "phonetic": normalize_phonetic(row.get("phonetic")),
        "category": safe_text(row.get("category")),
        "example_count": len(examples),
        "audio_count": audio_count,
        "phoneme_audio": "yes" if safe_text(row.get("phoneme_audio")) else "",
    })

st.write(f"当前工作文件：`{output_path}`")
st.write(f"已加载 {len(phoneme_rows)} 条音标记录。")
st.dataframe(preview_rows, width="stretch", hide_index=True)

st.subheader("试听表")
st.caption("每一行展示一个音标及其 3 个例词；有音频时可直接在对应单元格试听。")

header_cols = st.columns([1.1, 1.4, 2.1, 2.1, 2.1])
header_cols[0].markdown("**音标**")
header_cols[1].markdown("**音标试听**")
header_cols[2].markdown("**例词 1**")
header_cols[3].markdown("**例词 2**")
header_cols[4].markdown("**例词 3**")

for row in phoneme_rows:
    examples = row.get("example_words") if isinstance(row.get("example_words"), list) else []
    cols = st.columns([1.1, 1.4, 2.1, 2.1, 2.1])
    cols[0].markdown(f"`{normalize_phonetic(row.get('phonetic'))}`")

    phoneme_audio_bytes = read_audio_bytes(safe_text(row.get("phoneme_audio")))
    if phoneme_audio_bytes:
        cols[1].audio(phoneme_audio_bytes, format="audio/mp3")
    else:
        cols[1].caption("未生成")

    for idx in range(3):
        cell = cols[idx + 2]
        if idx < len(examples) and isinstance(examples[idx], dict):
            example = examples[idx]
            word = safe_text(example.get("word"))
            phonetic = normalize_phonetic(example.get("phonetic"))
            zh = safe_text(example.get("zh"))
            cell.markdown(f"**{word or '-'}**")
            if phonetic:
                cell.caption(f"{phonetic} {zh}".strip())
            else:
                cell.caption(zh or "未补全")
            word_audio_bytes = read_audio_bytes(safe_text(example.get("word_audio")))
            if word_audio_bytes:
                cell.audio(word_audio_bytes, format="audio/mp3")
            else:
                cell.caption("未生成")
        else:
            cell.caption("未补全")

st.info("说明：音标单独录音为实验性功能，当前通过音标到近似可读文本的映射交给 TTS 生成，便于后续先联调功能。")

col1, col2, col3 = st.columns(3)
btn_examples = col1.button("步骤一：补全例词", type="primary", use_container_width=True)
btn_audio = col2.button("步骤二：生成单词录音", use_container_width=True)
btn_phoneme_audio = col3.button("步骤三：生成音标录音", use_container_width=True)

progress_bar = st.progress(0)
status_placeholder = st.empty()

if btn_examples:
    if not api_key.strip():
        st.error("补全例词前请先输入 API Key。")
        st.stop()
    try:
        client = create_client(base_url, api_key)
        rows = run_generate_examples(
            rows=rows,
            output_path=output_path,
            client=client,
            model_name=model_name,
            progress_bar=progress_bar,
            status_placeholder=status_placeholder,
            overwrite_examples=overwrite_examples,
        )
        status_placeholder.success(f"例词补全完成，已同步写入：{output_path}")
        st.success("步骤一完成。")
    except Exception as exc:
        status_placeholder.error(f"补全例词失败：{exc}")
        raise

if btn_audio:
    try:
        rows = run_generate_audio(
            rows=rows,
            output_path=output_path,
            voice=voice,
            progress_bar=progress_bar,
            status_placeholder=status_placeholder,
            overwrite_audio=overwrite_audio,
        )
        status_placeholder.success(f"单词录音完成，已同步写入：{output_path}")
        st.success("步骤二完成。")
    except Exception as exc:
        status_placeholder.error(f"生成录音失败：{exc}")
        raise

if btn_phoneme_audio:
    try:
        rows = run_generate_phoneme_audio(
            rows=rows,
            output_path=output_path,
            voice=voice,
            progress_bar=progress_bar,
            status_placeholder=status_placeholder,
            overwrite_audio=overwrite_phoneme_audio,
        )
        status_placeholder.success(f"音标录音完成，已同步写入：{output_path}")
        st.success("步骤三完成。")
    except Exception as exc:
        status_placeholder.error(f"生成音标录音失败：{exc}")
        raise
