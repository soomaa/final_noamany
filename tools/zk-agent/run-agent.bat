@echo off
cd /d "%~dp0"
if exist "%~dp0python\python.exe" (set PY="%~dp0python\python.exe") else (set PY=python)
:loop
%PY% noamany_zk_agent.py
echo Agent stopped, restarting in 30 seconds...
timeout /t 30 /nobreak >nul
goto loop
