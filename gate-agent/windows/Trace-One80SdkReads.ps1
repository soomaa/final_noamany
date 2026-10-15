[CmdletBinding()]
param(
    [string]$AgentPath = "$env:ProgramFiles\ONE80 Gate Agent\One80.GateAgent.ps1",
    [string]$ConfigPath = "$env:ProgramData\ONE80\GateAgent\config.json"
)
$ErrorActionPreference = 'Stop'
$source = Get-Content -LiteralPath $AgentPath -Raw
$anchors = [regex]::Matches($source, '(?m)^ +Write-Host "PASS: authenticated API and SDK connection\.[^\r\n]*')
if ($anchors.Count -ne 1 -or
    $source -notmatch 'if \(\$ProbeOnly\)' -or $source.Contains('[ref]$buffer[0]')) {
    throw 'Unexpected agent version; diagnostic was not started.'
}
$anchor = $anchors[0].Value

# Extend only the ProbeOnly branch, which exits before event replay, commands,
# or heartbeat. Never print card data, configuration, or credentials.
$checks = @'
                Write-Host 'STEP 1: GetDeviceData (history) BEGIN'
                $probeBuffer = New-Object byte[] (4MB)
                $probeResult = [One80PullSdk]::GetDeviceData($script:Handle, $probeBuffer, $probeBuffer.Length, 'transaction', '*', '', 'NewRecord')
                Write-Host "STEP 1: GetDeviceData END; result=$probeResult"
                Write-Host 'STEP 2: GetRTLog (live events) BEGIN'
                $probeBuffer = New-Object byte[] (64KB)
                $probeResult = [One80PullSdk]::GetRTLog($script:Handle, $probeBuffer, $probeBuffer.Length)
                Write-Host "STEP 2: GetRTLog END; result=$probeResult"
'@
$diagnostic = $source.Replace($anchor, $anchor + "`r`n" + $checks)
$tokens = $null
$parseErrors = $null
[void][Management.Automation.Language.Parser]::ParseInput($diagnostic, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw 'Cannot parse diagnostic; task was not changed.' }
if (-not (Test-Path -LiteralPath $ConfigPath)) { throw 'Installed configuration was not found.' }
$diagnosticPath = Join-Path (Split-Path -Parent $ConfigPath) 'One80.ReadProbe.ps1'
Set-Content -LiteralPath $diagnosticPath -Value $diagnostic -Encoding UTF8

# Keep the scheduled task disabled while diagnosing a crashing native session.
# Re-enable it only after the failure has been resolved, to avoid two SDK owners.
Disable-ScheduledTask -TaskName 'ONE80 Gate Agent' | Out-Null
Stop-ScheduledTask -TaskName 'ONE80 Gate Agent'
Start-Sleep -Seconds 2
$task = Get-ScheduledTask -TaskName 'ONE80 Gate Agent'
if ($task.State -eq 'Running') { throw 'Agent is still running. Probe was not started.' }
Write-Host 'Scheduled agent paused. Probe reads only; no opening command is sent.'
& "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File $diagnosticPath -ConfigPath $ConfigPath -ProbeOnly
Write-Host "SDK_READ_EXIT=$LASTEXITCODE"
Write-Host 'Leave the scheduled task paused until the diagnostic has been reviewed.'
