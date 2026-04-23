@echo off
cd /d %~dp0
conda run -n english_book streamlit run mode7_exam_extract.py --server.port 8510
