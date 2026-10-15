$ErrorActionPreference = 'Stop'
$root = "$env:ProgramData\ONE80\GateAgent"
$agent = "$env:ProgramFiles\ONE80 Gate Agent\One80.GateAgent.ps1"
$source = Get-Content -LiteralPath $agent -Raw
$old = '    $commands = @(Invoke-GateApi -Method GET -Path "commands")'
$new = '    $commands = @(Invoke-GateApi -Method GET -Path "commands" | ForEach-Object { $_ } | Where-Object { $null -ne $_ })'
$loop = '    foreach ($command in $commands) {'
$guard = @'
        if ($null -eq $command.PSObject.Properties['id'] -or [string]$command.id -notmatch '^[1-9][0-9]*$') {
            Write-AgentLog "Ignored malformed command without a valid id" "WARN"
            continue
        }
'@
foreach ($anchor in @($old, $loop)) {
    if ([regex]::Matches($source, [regex]::Escape($anchor)).Count -ne 1) { throw 'Unexpected agent version. No files changed.' }
}
$source = $source.Replace($old, $new).Replace($loop, $loop + "`r`n" + $guard)
$tokens=$null; $errors=$null
[void][Management.Automation.Language.Parser]::ParseInput($source, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw 'Syntax check failed. No files changed.' }
Disable-ScheduledTask -TaskName 'ONE80 Gate Agent' | Out-Null
Stop-ScheduledTask -TaskName 'ONE80 Gate Agent'
Start-Sleep -Seconds 2
if ((Get-ScheduledTask -TaskName 'ONE80 Gate Agent').State -eq 'Running') { throw 'Agent is still running.' }
Copy-Item -LiteralPath $agent -Destination (Join-Path $root ('agent-before-command-fix-' + (Get-Date -Format 'yyyyMMddHHmmss') + '.ps1'))
Set-Content -LiteralPath $agent -Value $source -Encoding UTF8
$log = Join-Path $root 'gate-agent.log'
$logStart = @(Get-Content -LiteralPath $log).Count
Enable-ScheduledTask -TaskName 'ONE80 Gate Agent' | Out-Null
Start-ScheduledTask -TaskName 'ONE80 Gate Agent'
Start-Sleep -Seconds 20
Get-ScheduledTask -TaskName 'ONE80 Gate Agent' | Select-Object TaskName, State | Format-List
Get-Content -LiteralPath $log | Select-Object -Skip $logStart
