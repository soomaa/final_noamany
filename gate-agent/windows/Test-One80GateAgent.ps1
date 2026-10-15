#requires -Version 5.1
[CmdletBinding()]
param(
    [string]$InstallPath = "$env:ProgramFiles\ONE80 Gate Agent",
    [string]$RuntimePath = "$env:ProgramData\ONE80\GateAgent",
    [string]$OutputPath = (Join-Path $PSScriptRoot 'ONE80-GATE-CHECK.txt')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$lines = [Collections.Generic.List[string]]::new()
$script:NeedsAttention = $false
$lines.Add('ONE80 GATE AGENT - BASIC DIAGNOSTICS')
$lines.Add("Generated UTC: $([DateTime]::UtcNow.ToString('yyyy-MM-dd HH:mm:ss'))")
$lines.Add('Task/config preserved. No SDK session, sync, event replay, heartbeat, or door command is sent.')
$lines.Add('')

function Add-Check {
    param([ValidateSet('PASS', 'FAIL', 'INFO')][string]$Status, [string]$Name, [string]$Detail)
    $lines.Add("[$Status] ${Name}: $Detail")
    if ($Status -eq 'FAIL') { $script:NeedsAttention = $true }
}

function Get-ConfigValue {
    param([object]$Config, [string]$Name, [object]$Default = $null)
    $property = $Config.PSObject.Properties[$Name]
    if ($null -eq $property) { return $Default }
    return $property.Value
}

function Test-X64Dll {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
    $stream = [IO.File]::OpenRead($Path)
    $reader = [IO.BinaryReader]::new($stream)
    try {
        if ($stream.Length -lt 64 -or $reader.ReadUInt16() -ne 0x5a4d) { return $false }
        $stream.Position = 60
        $offset = $reader.ReadInt32()
        if ($offset -lt 64 -or $offset -gt ($stream.Length - 6)) { return $false }
        $stream.Position = $offset
        return ($reader.ReadUInt32() -eq 0x00004550 -and $reader.ReadUInt16() -eq 0x8664)
    } finally { $reader.Dispose(); $stream.Dispose() }
}

if ([Environment]::Is64BitProcess) {
    Add-Check PASS 'PowerShell' '64-bit process.'
} else {
    Add-Check FAIL 'PowerShell' 'Use 64-bit Windows PowerShell.'
}
if (Test-Path -LiteralPath (Join-Path $InstallPath 'One80.GateAgent.ps1') -PathType Leaf) {
    Add-Check PASS 'Installation' 'Installed agent script found.'
} else {
    Add-Check FAIL 'Installation' 'Installed agent script not found at the selected location.'
}

try {
    $task = Get-ScheduledTask -TaskName 'ONE80 Gate Agent' -ErrorAction Stop
    $info = Get-ScheduledTaskInfo -TaskName 'ONE80 Gate Agent' -ErrorAction Stop
    if ([string]$task.State -eq 'Running') {
        Add-Check PASS 'Scheduled task' "Running; last result $([long]$info.LastTaskResult)."
    } else {
        Add-Check FAIL 'Scheduled task' 'Not running. Its state has been preserved; ask support before restarting.'
    }
} catch {
    Add-Check FAIL 'Scheduled task' 'Cannot read the task. Run the check as Administrator; if repeated, ask support.'
}

$configValid = $false
try {
    $config = Get-Content -LiteralPath (Join-Path $RuntimePath 'config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($null -eq $config) { throw 'Empty config' }
    $apiBaseUrl = ([string](Get-ConfigValue $config 'apiBaseUrl')).TrimEnd('/')
    $apiUri = $null
    if (-not [Uri]::TryCreate($apiBaseUrl, [UriKind]::Absolute, [ref]$apiUri) -or
        $apiUri.Scheme -ne 'https' -or $apiUri.UserInfo -or $apiUri.Query -or $apiUri.Fragment) {
        throw 'Invalid API URL'
    }
    $controllerId = 0
    if (-not [int]::TryParse([string](Get-ConfigValue $config 'controllerId'), [ref]$controllerId) -or $controllerId -lt 1) { throw 'Invalid controller ID' }
    $token = [string](Get-ConfigValue $config 'agentToken')
    if ([string]::IsNullOrWhiteSpace($token) -or $token.Length -lt 32) { throw 'Invalid saved token' }
    $controllerIp = $null
    if (-not [Net.IPAddress]::TryParse([string](Get-ConfigValue $config 'controllerIp'), [ref]$controllerIp)) { throw 'Invalid controller IP' }
    $controllerPort = 0
    if (-not [int]::TryParse([string](Get-ConfigValue $config 'controllerPort' 4370), [ref]$controllerPort) -or
        $controllerPort -lt 1 -or $controllerPort -gt 65535) { throw 'Invalid controller port' }
    $sdkPath = [Environment]::ExpandEnvironmentVariables([string](Get-ConfigValue $config 'sdkPath'))
    if ([string]::IsNullOrWhiteSpace($sdkPath)) { throw 'Missing SDK path' }
    $configValid = $true
    Add-Check PASS 'Saved configuration' "Loaded for controller $controllerId; saved token reused without changes."
} catch {
    Add-Check FAIL 'Saved configuration' 'Missing, unreadable, or invalid config. Run as Administrator. Do not reinstall or rotate the token.'
}

if ($configValid) {
    $status = $null
    $apiStatusError = $null
    try {
        $status = Invoke-RestMethod -Method GET -Uri "$apiBaseUrl/gate-agent/$controllerId/status" `
            -Headers @{ 'X-Gate-Agent-Token' = $token } -TimeoutSec 20 -MaximumRedirection 0 -ErrorAction Stop
        $live = $status.PSObject.Properties['controller']
        if ($null -ne $live -and $null -ne $live.Value) {
            $controllerIp = [Net.IPAddress]::Parse([string]$live.Value.staticIp)
            $controllerPort = [int]$live.Value.port
        }
    } catch { $apiStatusError = $_ }
    try {
        $missing = [Collections.Generic.List[string]]::new()
        foreach ($name in @('plcommpro.dll', 'plcomms.dll', 'plrscomm.dll', 'pltcpcomm.dll')) {
            if (-not (Test-X64Dll (Join-Path $sdkPath $name))) { $missing.Add($name) }
        }
        if (-not (Test-X64Dll (Join-Path $sdkPath 'rscagent.dll')) -and
            -not (Test-X64Dll (Join-Path $sdkPath 'plrscagent.dll'))) { $missing.Add('rscagent.dll/plrscagent.dll') }
        if ($missing.Count -gt 0) {
            Add-Check FAIL 'SDK files' "Missing or invalid x64 DLL: $($missing -join ', ')."
        } else { Add-Check PASS 'SDK files' 'Required x64 DLL headers found. Loading and SDK login are not tested.' }
    } catch { Add-Check FAIL 'SDK files' 'Cannot inspect installed SDK files.' }

    $tcp = [Net.Sockets.TcpClient]::new()
    $pending = $null
    try {
        $pending = $tcp.BeginConnect($controllerIp, $controllerPort, $null, $null)
        if (-not $pending.AsyncWaitHandle.WaitOne(3000)) { throw 'TCP timeout' }
        $tcp.EndConnect($pending)
        Add-Check PASS 'Controller TCP' 'Saved address accepts TCP. Controller identity, password, and SDK connection are not tested.'
    } catch {
        Add-Check FAIL 'Controller TCP' 'Saved address/port is unreachable. Check controller power and the gym network cable.'
    } finally {
        if ($null -ne $pending) { $pending.AsyncWaitHandle.Close() }
        $tcp.Dispose()
    }

    try {
        # Reuse the safe status read already used for the current web address.
        if ($null -ne $apiStatusError) { throw $apiStatusError }
        if ([int]$status.id -ne $controllerId -or $status.isActive -ne $true) { throw 'Unexpected status response' }
        Add-Check PASS 'API authentication' 'Saved token accepted by the read-only status endpoint.'
        if ($null -eq $status.lastSeenAt) {
            Add-Check FAIL 'Agent heartbeat' 'No heartbeat has been recorded.'
        } else {
            $seen = [DateTimeOffset]::Parse([string]$status.lastSeenAt).UtcDateTime
            $age = ([DateTime]::UtcNow - $seen).TotalSeconds
            if ([string]$status.status -eq 'online' -and $age -ge -60 -and $age -le 45) {
                Add-Check PASS 'Agent heartbeat' "Online; last seen UTC $($seen.ToString('yyyy-MM-dd HH:mm:ss'))."
            } else {
                Add-Check FAIL 'Agent heartbeat' "Not online, stale, or computer clock differs; last seen UTC $($seen.ToString('yyyy-MM-dd HH:mm:ss'))."
            }
        }
        if ($null -ne $status.lastSyncAt) {
            $synced = [DateTimeOffset]::Parse([string]$status.lastSyncAt).UtcDateTime
            Add-Check INFO 'Last recorded sync' "UTC $($synced.ToString('yyyy-MM-dd HH:mm:ss')); a physical card/QR test is still required."
        } else { Add-Check INFO 'Online authorization' 'No offline sync recorded. Agent 1.1 validates each QR through ONE80 without replacing device users.' }
    } catch {
        $httpCode = 0
        $responseProperty = $_.Exception.PSObject.Properties['Response']
        if ($null -ne $responseProperty -and $null -ne $responseProperty.Value) {
            try { $httpCode = [int]$responseProperty.Value.StatusCode } catch {}
        }
        switch ($httpCode) {
            401 { Add-Check FAIL 'API authentication' 'HTTP 401: saved token/controller rejected. Send this report; do not rotate the token.' }
            403 { Add-Check FAIL 'API authentication' 'HTTP 403: controller disabled or access refused. Send this report.' }
            404 { Add-Check FAIL 'API authentication' 'HTTP 404: status endpoint unavailable. Web API update may be needed; this does not prove the saved token is wrong.' }
            default { Add-Check FAIL 'API status' 'Cannot verify API status. Check internet, Windows date/time, and server availability. No raw error or response was recorded.' }
        }
    }
}

$lines.Add('')
if ($script:NeedsAttention) { $lines.Add('RESULT: ATTENTION NEEDED - send this report to support.') }
else { $lines.Add('RESULT: BASIC CHECKS PASSED - this is not proof that a card/QR opens the physical gate.') }
$lines.Add('Physical opening, card/QR decoding, wiring, relay timing, and SDK login are not tested.')
$lines.Add('Share only this report. Do not share config.json, tokens, passwords, or full logs.')
try { $lines | Set-Content -LiteralPath $OutputPath -Encoding UTF8 }
catch {
    Write-Host 'Could not save report. Extract the ZIP to a writable folder and run again.' -ForegroundColor Red
    exit 2
}
$lines | ForEach-Object { Write-Host $_ }
Write-Host "Report saved to: $OutputPath"
if ($script:NeedsAttention) { exit 1 }
exit 0
