@echo off`r`ncd /d %~dp0`r`nconda run -n english_book streamlit run mode0_pdf_preprocess.py --server.port 8501`r`n
