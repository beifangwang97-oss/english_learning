@echo off
cd /d %~dp0
conda run -n english_book streamlit run mode8_phrase_excel_merge.py --server.port 8509
