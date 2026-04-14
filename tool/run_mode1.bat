@echo off`r`ncd /d %~dp0`r`nconda run -n english_book streamlit run mode1_pdf_extract_review.py --server.port 8502`r`n
