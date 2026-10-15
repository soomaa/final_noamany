@echo off
setlocal
echo ONE80 Gate Agent - safe basic check
echo Run this file as Administrator to read the saved configuration.
echo This check does not open the gate or restart the agent.
echo.
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0Test-One80GateAgent.ps1" -OutputPath "%~dp0ONE80-GATE-CHECK.txt"
set "One80CheckExit=%ERRORLEVEL%"
echo.
echo Check exit code: %One80CheckExit%
echo Send ONE80-GATE-CHECK.txt from this folder to support.
echo If no report exists, send a photo of this window only.
pause
exit /b %One80CheckExit%
