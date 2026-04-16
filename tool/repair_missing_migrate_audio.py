import asyncio
import hashlib
import json
from pathlib import Path

import edge_tts


BASE_DIR = Path(__file__).resolve().parent
AUDIO_DIR = BASE_DIR / "audio"
TARGET_JSONL = next((BASE_DIR / "word_data").glob("*/*20260414_115346.jsonl"))
VOICE = "en-US-GuyNeural"
TARGET_WORDS = {"admire", "correct", "suggest", "produce", "complete", "widely"}


def word_clean(word: str) -> str:
    return "".join([c for c in str(word or "") if c.isalpha() or c.isspace() or c == "'"]).strip().replace(" ", "_") or "item"


def compute_new_id(row: dict) -> str:
    cleaned = word_clean(row.get("word", ""))
    raw = (
        f"{cleaned}_{row.get('unit', '')}_{row.get('grade', '')}_"
        f"{row.get('semester', '')}_{row.get('book_version', '')}_{row.get('source_tag', '')}"
    )
    return hashlib.md5(raw.encode("utf-8")).hexdigest()[:10]


async def generate_audio(text: str, target: Path):
    if not text or not str(text).strip():
        return True

    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and target.stat().st_size > 0:
        return True
    if target.exists():
        target.unlink()

    for attempt in range(3):
        try:
            communicate = edge_tts.Communicate(str(text), VOICE)
            await asyncio.wait_for(communicate.save(str(target)), timeout=30)
            if target.exists() and target.stat().st_size > 0:
                return True
            if target.exists():
                target.unlink()
        except asyncio.TimeoutError:
            print(f"TTS timeout [{text}] attempt {attempt + 1}/3")
        except Exception as exc:
            error_msg = str(exc)
            if "403" in error_msg or "Invalid response status" in error_msg:
                wait_time = 10 * (attempt + 1)
                print(f"TTS 403 [{text}] wait {wait_time}s retry {attempt + 1}/3")
                await asyncio.sleep(wait_time)
                continue
            if "503" in error_msg or "Cannot connect" in error_msg or "Connection timeout" in error_msg:
                wait_time = 6 * (attempt + 1)
                print(f"TTS unavailable [{text}] wait {wait_time}s retry {attempt + 1}/3")
                await asyncio.sleep(wait_time)
                continue
            print(f"TTS failed [{text}] attempt {attempt + 1}/3: {exc}")

        if attempt < 2:
            await asyncio.sleep(2 * (attempt + 1))

    return False


async def main():
    generated = []
    rows = TARGET_JSONL.read_text(encoding="utf-8-sig").splitlines()
    for line in rows:
        if not line.strip():
            continue
        row = json.loads(line)
        if row.get("word") not in TARGET_WORDS:
            continue
        cleaned = word_clean(row.get("word", ""))
        new_id = compute_new_id(row)

        current_main = AUDIO_DIR / Path(str(row.get("word_audio", "")).replace("./audio/", "").replace("audio/", "")).name
        target_main = AUDIO_DIR / f"{new_id}_{cleaned}.mp3"
        if (
            str(row.get("word_audio", "")).strip()
            and (
                (not current_main.exists() and not target_main.exists())
                or (target_main.exists() and target_main.stat().st_size <= 0)
            )
        ):
            if await generate_audio(row.get("word", ""), target_main):
                generated.append(target_main.name)

        for idx, meaning in enumerate(row.get("meanings", [])):
            if not isinstance(meaning, dict):
                continue
            current_ex = AUDIO_DIR / Path(str(meaning.get("example_audio", "")).replace("./audio/", "").replace("audio/", "")).name
            target_ex = AUDIO_DIR / f"{new_id}_{cleaned}_ex_{idx}.mp3"
            example_text = str(meaning.get("example", "") or "").strip()
            if (
                example_text
                and str(meaning.get("example_audio", "")).strip()
                and (
                    (not current_ex.exists() and not target_ex.exists())
                    or (target_ex.exists() and target_ex.stat().st_size <= 0)
                )
            ):
                if await generate_audio(example_text, target_ex):
                    generated.append(target_ex.name)

    print(f"generated={len(generated)}")
    for name in generated:
        print(name)


if __name__ == "__main__":
    asyncio.run(main())
