@echo off
cd /d %~dp0
conda run -n english_book streamlit run mode3_word_syllable_fill.py --server.port 8504
