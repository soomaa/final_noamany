@echo off
rem Double-click once on the gym PC. Asks for the Comm Key and device number, tests both,
rem adds the agent to Windows startup and starts it.
cd /d "%~dp0"
if exist "%~dp0python\python.exe" (set PY="%~dp0python\python.exe") else (set PY=python)
%PY% --version >nul 2>&1 || goto nopython
if not exist config.ini copy config.example.ini config.ini >nul
%PY% noamany_zk_agent.py --setup
if errorlevel 1 (pause & exit /b 1)
start "Noamany fingerprint" /min cmd /c ""%~dp0run-agent.bat""
pause
exit /b 0
:nopython
echo.
echo Python could not start on this PC.
echo This Windows is missing updates that Python needs. Install from Windows Update:
echo   KB2999226  (Universal C Runtime)
echo   KB2533623
echo then run setup.bat again.
pause
exit /b 1
