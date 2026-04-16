@echo off
cd /d %~dp0
conda run -n english_book python mode7_exam_extract.py
