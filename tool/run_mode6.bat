@echo off
cd /d %~dp0
conda run -n english_book streamlit run mode6_phoneme_examples_audio.py --server.port 8507
