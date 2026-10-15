& {
    $ErrorActionPreference = 'Stop'
    $root = "$env:ProgramData\ONE80\GateAgent"
    $agent = "$env:ProgramFiles\ONE80 Gate Agent\One80.GateAgent.ps1"
    $source = Get-Content -LiteralPath $agent -Raw
    $anchor = '        $response = Invoke-GateApi -Method POST -Path "events" -Body $Event'
    $extra = @'
        if ($null -ne $response -and $null -ne $response.PSObject.Properties['reasonCode']) {
            Write-AgentLog ("Gate decision: type={0}; reason={1}; eventUtc={2}; pcUtc={3}" -f $Event.eventType, $response.reasonCode, $Event.occurredAt, [DateTime]::UtcNow.ToString('o'))
        }
'@
    if (-not $source.Contains('Gate decision: type=')) {
        if ([regex]::Matches($source, [regex]::Escape($anchor)).Count -ne 1) {
            throw 'Unexpected agent version. No files changed.'
        }
        $source = $source.Replace($anchor, $anchor + "`r`n" + $extra)
        $parseErrors = $null
        [void][Management.Automation.Language.Parser]::ParseInput($source, [ref]$null, [ref]$parseErrors)
        if ($parseErrors.Count) { throw 'Syntax check failed. No files changed.' }
        Copy-Item -LiteralPath $agent -Destination (Join-Path $root ('before-decision-log-' + (Get-Date -Format 'yyyyMMddHHmmss') + '.ps1'))
        Disable-ScheduledTask -TaskName 'ONE80 Gate Agent' | Out-Null
        Stop-ScheduledTask -TaskName 'ONE80 Gate Agent'
        Start-Sleep -Seconds 2
        if ((Get-ScheduledTask -TaskName 'ONE80 Gate Agent').State -eq 'Running') { throw 'Agent is still running. No files changed.' }
        Set-Content -LiteralPath $agent -Value $source -Encoding UTF8
        Enable-ScheduledTask -TaskName 'ONE80 Gate Agent' | Out-Null
        Start-ScheduledTask -TaskName 'ONE80 Gate Agent'
    }
    Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz'
    Get-TimeZone | Select-Object Id, DisplayName
    Write-Host 'Decision logging enabled. Scan one member QR, then read the log.'
}
