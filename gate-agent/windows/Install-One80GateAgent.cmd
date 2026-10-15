@echo off
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-One80GateAgent.ps1"
if errorlevel 1 (
  echo Installation did not complete. Read the error above.
) else (
  echo Check Gate Access, then test one member QR at the gate.
)
pause
