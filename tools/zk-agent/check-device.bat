@echo off
cd /d "%~dp0"
if exist "%~dp0python\python.exe" (set PY="%~dp0python\python.exe") else (set PY=python)
%PY% noamany_zk_agent.py --check
pause
