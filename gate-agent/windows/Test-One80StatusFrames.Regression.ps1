$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$sourcePath = Join-Path $PSScriptRoot 'One80.GateAgent.ps1'
$tokens = $null
$errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($sourcePath, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw ($errors | Out-String) }
foreach ($name in @('Convert-RtLogLine', 'New-GateEvent', 'Read-RealtimeEvents', 'Flush-PendingEvents')) {
    $function = $ast.FindAll({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name }, $true)[0]
    . ([ScriptBlock]::Create($function.Extent.Text))
}
Add-Type -TypeDefinition @'
using System;
using System.Text;
public static class One80PullSdk {
    public static string[] Lines;
    public static int Reads;
    public static int GetRTLog(IntPtr handle, byte[] buffer, int size) {
        if (++Reads > 20) throw new Exception("Realtime reader did not yield");
        byte[] text = Encoding.ASCII.GetBytes(Lines[Math.Min(Reads - 1, Lines.Length - 1)]);
        Array.Clear(buffer, 0, buffer.Length);
        Array.Copy(text, buffer, text.Length);
        return 1;
    }
}
'@
$script:ControllerId = 2
$script:Handle = [IntPtr]::Zero
$script:Sent = [Collections.Generic.List[object]]::new()
$script:AcceptEvents = $true
function Send-Event { param($Event, [switch]$QueueOnFailure) $script:Sent.Add($Event); return $script:AcceptEvents }
function Write-AgentLog { param($Message, $Level) throw "Unexpected log: $Message" }
$status = '2026-10-03 19:48:23,0,0,0,255,0,0'
$scan = '2026-10-03 19:48:24,1001,123456789,1,27,0,4'
if ($null -ne (Convert-RtLogLine $status)) { throw 'Status snapshot became an attendance event' }
$parsed = Convert-RtLogLine $scan
if ($parsed.eventType -ne 27 -or $parsed.doorNo -ne 1 -or $parsed.credentialNo -ne '123456789') { throw 'QR scan was altered' }
if ((Convert-RtLogLine $scan.Replace(',27,', ',200,')).eventType -ne 200) { throw 'Real door event was filtered' }

[One80PullSdk]::Lines = @($status)
[One80PullSdk]::Reads = 0
Read-RealtimeEvents
if ([One80PullSdk]::Reads -ne 1 -or $script:Sent.Count -ne 0) { throw 'Status-only read must yield immediately without posting' }
[One80PullSdk]::Lines = @($scan, $status)
[One80PullSdk]::Reads = 0
Read-RealtimeEvents
if ([One80PullSdk]::Reads -ne 2 -or $script:Sent.Count -ne 1) { throw 'Scan/status sequence lost or repeated a scan' }
$script:Sent.Clear()
[One80PullSdk]::Lines = @($scan)
[One80PullSdk]::Reads = 0
Read-RealtimeEvents
if ([One80PullSdk]::Reads -ne 8 -or $script:Sent.Count -ne 8) { throw 'Continuous activity must yield after eight batches' }

$script:RuntimeRoot = Join-Path ([IO.Path]::GetTempPath()) ('one80-status-test-' + [Guid]::NewGuid().ToString('N'))
$script:QueuePath = Join-Path $script:RuntimeRoot 'queue'
New-Item -ItemType Directory -Path $script:QueuePath -Force | Out-Null
try {
    $statusPath = Join-Path $script:QueuePath 'a-status.json'
    '{"eventType":255,"doorNo":0}' | Set-Content $statusPath -Encoding UTF8
    $statusHash = (Get-FileHash $statusPath).Hash
    $scanPath = Join-Path $script:QueuePath 'b-scan.json'
    $parsed | ConvertTo-Json | Set-Content $scanPath -Encoding UTF8
    $script:Sent.Clear()
    $script:AcceptEvents = $false
    Flush-PendingEvents
    $archived = Join-Path $script:RuntimeRoot 'status-snapshots/a-status.json'
    if (-not (Test-Path $archived) -or (Get-FileHash $archived).Hash -ne $statusHash) { throw 'Status snapshot was not preserved' }
    if (Test-Path $statusPath) { throw 'Status snapshot is still blocking the queue' }
    if (-not (Test-Path $scanPath) -or $script:Sent.Count -ne 1 -or $script:Sent[0].eventType -ne 27) { throw 'Queued QR scan was lost or status was posted' }
} finally { Remove-Item $script:RuntimeRoot -Recurse -Force }
Write-Host 'PASS: status filtering, QR preservation, bounded polling and lossless status quarantine.'
