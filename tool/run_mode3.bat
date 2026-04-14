@echo off`r`ncd /d %~dp0`r`nconda run -n english_book streamlit run mode3_jsonl_to_pdf.py --server.port 8504`r`n
