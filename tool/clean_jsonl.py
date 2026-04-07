import os
import json
import re

DATA_DIR = "word_data"

POS_STANDARD = {
    "n": "n.",
    "v": "v.",
    "adj": "adj.",
    "adv": "adv.",
    "pron": "pron.",
    "prep": "prep.",
    "conj": "conj.",
    "interj": "interj.",
    "num": "num.",
    "art": "art.",
    "phr": "phr.",
    "n.": "n.",
    "v.": "v.",
    "adj.": "adj.",
    "adv.": "adv.",
    "pron.": "pron.",
    "prep.": "prep.",
    "conj.": "conj.",
    "interj.": "interj.",
    "num.": "num.",
    "art.": "art.",
    "phr.": "phr.",
}

def clean_phonetic(phonetic):
    if not phonetic:
        return ""
    
    phonetic = phonetic.strip()
    
    match = re.search(r'/[^/]+/', phonetic)
    if match:
        return match.group(0)
    
    if phonetic.startswith('/'):
        return phonetic
    
    return phonetic

def clean_pos(pos):
    if not pos:
        return ""
    
    pos = pos.strip()
    
    if pos in POS_STANDARD:
        return POS_STANDARD[pos]
    
    if pos.endswith('.'):
        base = pos[:-1]
        if base in POS_STANDARD:
            return POS_STANDARD[pos]
    
    return pos

def clean_jsonl_file(filepath):
    cleaned_lines = []
    stats = {
        "example_audio_removed": 0,
        "phonetic_cleaned": 0,
        "pos_cleaned": 0
    }
    
    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            if line.strip():
                item = json.loads(line)
                
                if "example_audio" in item and item["example_audio"] == "":
                    del item["example_audio"]
                    stats["example_audio_removed"] += 1
                
                if "phonetic" in item:
                    original = item["phonetic"]
                    cleaned = clean_phonetic(original)
                    if cleaned != original:
                        item["phonetic"] = cleaned
                        stats["phonetic_cleaned"] += 1
                
                if "meanings" in item:
                    for m in item["meanings"]:
                        if "pos" in m:
                            original = m["pos"]
                            cleaned = clean_pos(original)
                            if cleaned != original:
                                m["pos"] = cleaned
                                stats["pos_cleaned"] += 1
                
                cleaned_lines.append(json.dumps(item, ensure_ascii=False))
    
    with open(filepath, 'w', encoding='utf-8') as f:
        for line in cleaned_lines:
            f.write(line + '\n')
    
    return stats

def main():
    print("=" * 60)
    print("JSONL 文件清理工具")
    print("功能：")
    print("  1. 删除顶层多余的 example_audio 字段")
    print("  2. 清理音标格式（只保留 /.../ 部分）")
    print("  3. 统一词性格式（添加点号）")
    print("=" * 60)
    
    if not os.path.exists(DATA_DIR):
        print(f"错误：目录 {DATA_DIR} 不存在")
        return
    
    jsonl_files = [f for f in os.listdir(DATA_DIR) if f.endswith('.jsonl')]
    
    if not jsonl_files:
        print(f"在 {DATA_DIR} 目录下没有找到 jsonl 文件")
        return
    
    print(f"\n找到 {len(jsonl_files)} 个 jsonl 文件：")
    for f in jsonl_files:
        print(f"  - {f}")
    
    print("\n开始处理...\n")
    
    total_stats = {
        "example_audio_removed": 0,
        "phonetic_cleaned": 0,
        "pos_cleaned": 0
    }
    
    for filename in jsonl_files:
        filepath = os.path.join(DATA_DIR, filename)
        stats = clean_jsonl_file(filepath)
        
        for key in total_stats:
            total_stats[key] += stats[key]
        
        print(f"✓ {filename}:")
        print(f"    - 删除顶层 example_audio: {stats['example_audio_removed']} 个")
        print(f"    - 清理音标格式: {stats['phonetic_cleaned']} 个")
        print(f"    - 统一词性格式: {stats['pos_cleaned']} 个")
    
    print("\n" + "=" * 60)
    print("处理完成！总计：")
    print(f"  - 删除顶层 example_audio: {total_stats['example_audio_removed']} 个")
    print(f"  - 清理音标格式: {total_stats['phonetic_cleaned']} 个")
    print(f"  - 统一词性格式: {total_stats['pos_cleaned']} 个")
    print("=" * 60)

if __name__ == "__main__":
    main()
