@echo off`r`ncd /d %~dp0`r`nconda run -n english_book streamlit run mode5_passage_extract.py --server.port 8506`r`n
