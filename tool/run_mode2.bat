@echo off`r`ncd /d %~dp0`r`nconda run -n english_book streamlit run mode2_jsonl_audio.py --server.port 8503`r`n
