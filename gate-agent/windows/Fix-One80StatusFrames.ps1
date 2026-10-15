$ErrorActionPreference = 'Stop'
$root = "$env:ProgramData\ONE80\GateAgent"
$agent = "$env:ProgramFiles\ONE80 Gate Agent\One80.GateAgent.ps1"
$source = Get-Content -LiteralPath $agent -Raw
$changes = [ordered]@{
    '    $parts = $Line.Trim() -split ","' = '    $parts = $Line.Trim() -split ","' + "`r`n" + '    if ($parts.Count -ge 5 -and $parts[4].Trim() -eq ''255'') { return $null }'
    '    while ($true) {' = '    for ($readBatch = 0; $readBatch -lt 8; $readBatch++) {'
    '        foreach ($line in ($text -split "`r?`n")) {' = '        $batchEventCount = 0' + "`r`n" + '        foreach ($line in ($text -split "`r?`n")) {'
    '                [void](Send-Event -Event $event -QueueOnFailure)' = '                $batchEventCount++' + "`r`n" + '                [void](Send-Event -Event $event -QueueOnFailure)'
    '        if ($result -eq 0) { break }' = '        if ($result -eq 0 -or $batchEventCount -eq 0) { break }'
}
foreach ($old in $changes.Keys) {
    if ([regex]::Matches($source, [regex]::Escape($old)).Count -ne 1) { throw 'Unexpected agent version. No files changed.' }
    $source = $source.Replace($old, $changes[$old])
}
$tokens = $null
$errors = $null
[void][Management.Automation.Language.Parser]::ParseInput($source, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw 'Patch syntax check failed. No files changed.' }
Disable-ScheduledTask -TaskName 'ONE80 Gate Agent' | Out-Null
Stop-ScheduledTask -TaskName 'ONE80 Gate Agent'
Start-Sleep -Seconds 2
if ((Get-ScheduledTask -TaskName 'ONE80 Gate Agent').State -eq 'Running') { throw 'Agent is still running.' }
$backup = Join-Path $root ('agent-before-status-fix-' + (Get-Date -Format 'yyyyMMddHHmmss') + '.ps1')
Copy-Item -LiteralPath $agent -Destination $backup
Set-Content -LiteralPath $agent -Value $source -Encoding UTF8
$archive = Join-Path $root 'status-snapshots'
New-Item -ItemType Directory -Path $archive -Force | Out-Null
$moved = 0
foreach ($file in Get-ChildItem (Join-Path $root 'queue') -Filter '*.json' -File) {
    $event = Get-Content -LiteralPath $file.FullName -Raw | ConvertFrom-Json
    if ([int]$event.eventType -eq 255) {
        Move-Item -LiteralPath $file.FullName -Destination (Join-Path $archive $file.Name) -Force
        $moved++
    }
}
Write-Host "Status snapshots archived: $moved"
$logStart = (Get-Content (Join-Path $root 'gate-agent.log') | Measure-Object -Line).Lines
Enable-ScheduledTask -TaskName 'ONE80 Gate Agent' | Out-Null
Start-ScheduledTask -TaskName 'ONE80 Gate Agent'
Start-Sleep -Seconds 20
Get-ScheduledTask -TaskName 'ONE80 Gate Agent' | Select-Object TaskName, State | Format-List
Get-Content (Join-Path $root 'gate-agent.log') | Select-Object -Skip $logStart
