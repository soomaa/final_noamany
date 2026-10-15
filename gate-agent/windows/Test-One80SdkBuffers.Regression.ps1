[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$NativeLibrary)
$ErrorActionPreference = 'Stop'
$sourcePath = Join-Path $PSScriptRoot 'One80.GateAgent.ps1'
$source = Get-Content -LiteralPath $sourcePath -Raw
$match = [regex]::Match($source, '(?s)Add-Type -TypeDefinition @"\r?\n(.*?)\r?\n"@')
if (-not $match.Success) { throw 'Missing SDK interop declarations' }
$libraryPath = (Resolve-Path -LiteralPath $NativeLibrary).Path.Replace('\', '\\')
$declarations = $match.Groups[1].Value.Replace('plcommpro.dll', $libraryPath)
Add-Type -TypeDefinition $declarations

# Exercise the real P/Invoke declarations against native code that writes the
# entire advertised capacity. A scalar ref cannot safely satisfy this contract.
foreach ($method in @('GetDeviceParam', 'GetDeviceData', 'GetRTLog')) {
    $buffer = New-Object byte[] 4096
    for ($index = 0; $index -lt $buffer.Length; $index++) { $buffer[$index] = 165 }
    $result = switch ($method) {
        GetDeviceParam { [One80PullSdk]::GetDeviceParam([IntPtr]::Zero, $buffer, $buffer.Length, 'test') }
        GetDeviceData { [One80PullSdk]::GetDeviceData([IntPtr]::Zero, $buffer, $buffer.Length, 'transaction', '*', '', '') }
        GetRTLog { [One80PullSdk]::GetRTLog([IntPtr]::Zero, $buffer, $buffer.Length) }
    }
    if ($result -lt 0 -or $buffer[32] -eq 165 -or $buffer[4095] -ne 0) {
        throw "$method did not marshal the complete writable buffer"
    }
}

# Exercise the actual PowerShell call sites, including parsing and event reads.
$invalidOptionBuffer = New-Object byte[] 4096
if ([One80PullSdk]::GetDeviceData([IntPtr]::Zero, $invalidOptionBuffer, $invalidOptionBuffer.Length, 'transaction', '*', '', 'New Record') -ne -108) {
    throw 'Test SDK must reject the invalid spaced option.'
}
$tokens = $null
$parseErrors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($sourcePath, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw ($parseErrors | Out-String) }
foreach ($name in @('Get-ControllerInfo', 'Read-HistoricalTransactions', 'Read-RealtimeEvents')) {
    $fn = $ast.FindAll({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name }, $true)[0]
    . ([ScriptBlock]::Create($fn.Extent.Text))
}
$script:Handle = [IntPtr]::Zero
$script:HistoryCount = 0
$script:RealtimeCount = 0
function Convert-TransactionLine {
    param([string]$Line)
    if ($Line -ne 'history-buffer-payload-longer-than-one-byte') { throw 'Historical buffer was corrupted' }
    return @{ kind = 'history' }
}
function Convert-RtLogLine {
    param([string]$Line)
    if ($Line -ne 'realtime-buffer-payload-longer-than-one-byte') { throw 'Realtime buffer was corrupted' }
    return @{ kind = 'realtime' }
}
function Send-Event {
    param($Event, [switch]$QueueOnFailure)
    if ($Event.kind -eq 'history') { $script:HistoryCount++ } else { $script:RealtimeCount++ }
}
$info = Get-ControllerInfo
if ($info['~DeviceName'] -ne 'C3-200' -or $info['~SerialNumber'] -ne 'BUFFER-TEST-123456789') {
    throw 'Controller identity output was corrupted'
}
Read-HistoricalTransactions
Read-RealtimeEvents
if ($script:HistoryCount -ne 1 -or $script:RealtimeCount -ne 1) { throw 'Missing or duplicated buffer events' }
Write-Host 'PASS: native output buffers and all three PowerShell SDK read call sites.'
