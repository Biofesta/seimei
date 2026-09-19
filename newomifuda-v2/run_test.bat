@echo off
cd /d "%~dp0"
start "" "http://127.0.0.1:8001/index.html"
py -m http.server 8001
