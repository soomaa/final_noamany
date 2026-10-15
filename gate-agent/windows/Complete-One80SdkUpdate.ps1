# Run after the isolated official SDK live-event probe has succeeded.
$ErrorActionPreference = 'Stop'
$root = "$env:ProgramData\ONE80\GateAgent"
$trial = Join-Path $root 'sdk-2.2.1.4-test'
$native = Join-Path $trial 'native-x64'
if ((Get-ScheduledTask -TaskName 'ONE80 Gate Agent').State -eq 'Running') {
    throw 'Stop the scheduled agent before this test.'
}
$text = Get-Content (Join-Path $trial 'ReadProbe.ps1') -Raw
$marker = "Write-Host 'History skipped for this diagnostic only'"
if (([regex]::Matches($text, [regex]::Escape($marker))).Count -ne 1) { throw 'Unexpected probe version.' }
$history = @'
Write-Host 'HISTORY BEGIN'
$historyBuffer = New-Object byte[] (4MB)
$historyResult = [One80PullSdk]::GetDeviceData($script:Handle, $historyBuffer, $historyBuffer.Length, 'transaction', '*', '', 'NewRecord')
Write-Host "HISTORY END; result=$historyResult"
if ($historyResult -lt 0) { throw "History read failed: $historyResult" }
'@
$text = $text.Replace($marker, $history)
$text = $text.Replace('Write-Host "STEP 2: Live events END; result=$r"', 'Write-Host "STEP 2: Live events END; result=$r"; if ($r -lt 0) { throw "Live read failed: $r" }')
$probe = Join-Path $trial 'FullReadProbe.ps1'
Set-Content $probe -Value $text -Encoding UTF8
$cfg = Get-Content (Join-Path $root 'config.json') -Raw | ConvertFrom-Json
$installedSdk = [Environment]::ExpandEnvironmentVariables([string]$cfg.sdkPath)
$cfg.sdkPath = $native
$cfg.runtimePath = $trial
$testConfig = Join-Path $trial 'probe-config.json'
try {
    $cfg | ConvertTo-Json -Depth 8 | Set-Content $testConfig -Encoding UTF8
    & "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File $probe -ConfigPath $testConfig -ProbeOnly
    $probeExit = $LASTEXITCODE
    Write-Host "FULL_READ_EXIT=$probeExit"
} finally {
    Remove-Item $testConfig -Force -ErrorAction SilentlyContinue
}
if ($probeExit -ne 0) { throw 'Read test failed. Installed SDK was not changed.' }
if (-not (Test-Path -LiteralPath $installedSdk -PathType Container)) { throw 'Installed SDK directory is missing.' }
$files = @(Get-ChildItem -LiteralPath $native -Filter '*.dll' -File)
if ($files.Count -ne 7) { throw 'Expected all seven official SDK libraries.' }
$agentPath = "$env:ProgramFiles\ONE80 Gate Agent\One80.GateAgent.ps1"
$agentText = Get-Content -LiteralPath $agentPath -Raw
if ($agentText.Contains('ref byte buffer')) { throw 'Apply the buffer fix before activating this SDK.' }
$agentText = $agentText.Replace('"New Record"', '"NewRecord"')
Disable-ScheduledTask -TaskName 'ONE80 Gate Agent' | Out-Null
Stop-ScheduledTask -TaskName 'ONE80 Gate Agent'
if ((Get-ScheduledTask -TaskName 'ONE80 Gate Agent').State -eq 'Running') { throw 'Agent is still running.' }
$backup = Join-Path $root ('sdk-backup-' + (Get-Date -Format 'yyyyMMddHHmmss'))
Copy-Item -LiteralPath $installedSdk -Destination $backup -Recurse
Copy-Item -LiteralPath $agentPath -Destination (Join-Path $backup 'One80.GateAgent.ps1')
Set-Content -LiteralPath $agentPath -Value $agentText -Encoding UTF8
$files | Copy-Item -Destination $installedSdk -Force
Enable-ScheduledTask -TaskName 'ONE80 Gate Agent' | Out-Null
Start-ScheduledTask -TaskName 'ONE80 Gate Agent'
Start-Sleep -Seconds 15
$task = Get-ScheduledTask -TaskName 'ONE80 Gate Agent'
if ($task.State -ne 'Running') {
    Disable-ScheduledTask -TaskName 'ONE80 Gate Agent' | Out-Null
    Stop-ScheduledTask -TaskName 'ONE80 Gate Agent'
    Write-Host 'Agent stopped again. Task left disabled for diagnosis.'
}
$task | Select-Object TaskName, State | Format-List
Get-ScheduledTaskInfo -TaskName 'ONE80 Gate Agent' | Select-Object LastRunTime, LastTaskResult | Format-List
Get-Content (Join-Path $root 'gate-agent.log') -Tail 12
