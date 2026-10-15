# Developer checks. Run with pwsh or Windows PowerShell; no gym hardware needed.
[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ([Guid]::NewGuid().ToString('N'))
$install = Join-Path $testRoot 'install'
$runtime = Join-Path $testRoot 'runtime'
$sdk = Join-Path $install 'sdk'
$report = Join-Path $testRoot 'report.txt'
$global:One80TestTaskMutations = 0
$global:One80TestApiMode = 'online'
$global:One80TestTaskState = 'Running'
$global:One80TestApiCalls = 0
$token = 'one80g_test_secret_never_report_1234567890'
$password = 'communication_password_never_report'

function Assert-True([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}
function Stop-ScheduledTask { param($TaskName, $ErrorAction); $global:One80TestTaskMutations++ }
function Start-ScheduledTask { param($TaskName); $global:One80TestTaskMutations++ }
function Get-ScheduledTask { param($TaskName, $ErrorAction); [pscustomobject]@{ State = $global:One80TestTaskState } }
function Get-ScheduledTaskInfo { param($TaskName, $ErrorAction); [pscustomobject]@{ LastTaskResult = 267009 } }
function Invoke-RestMethod {
    param($Method, $Uri, $Headers, $TimeoutSec, $ErrorAction, $MaximumRedirection)
    $global:One80TestApiCalls++
    Assert-True ($Method -eq 'GET') 'Diagnostic attempted an API write.'
    Assert-True ($Uri -eq 'https://one80.invalid/api/gate-agent/7/status') 'Diagnostic accessed a non-status endpoint.'
    Assert-True ($Headers['X-Gate-Agent-Token'] -eq $token) 'Saved token was not reused.'
    Assert-True ($MaximumRedirection -eq 0) 'Saved token may be forwarded by a redirect.'
    if ($global:One80TestApiMode -eq 'failure') { throw "HTTP failed: $token $password" }
    if ($global:One80TestApiMode -eq 'missing') {
        $exception = [Exception]::new('not found')
        $exception | Add-Member -NotePropertyName Response -NotePropertyValue ([pscustomobject]@{ StatusCode = 404 })
        throw $exception
    }
    $seen = if ($global:One80TestApiMode -eq 'stale') { [DateTime]::UtcNow.AddMinutes(-5) } else { [DateTime]::UtcNow }
    return [pscustomobject]@{ id = 7; isActive = $true; status = 'online'; lastSeenAt = $seen.ToString('o'); lastSyncAt = $seen.ToString('o') }
}

try {
    New-Item -ItemType Directory -Path $runtime, $sdk -Force | Out-Null
    Set-Content -LiteralPath (Join-Path $install 'One80.GateAgent.ps1') -Value '# Installed agent fixture'
    # Minimal PE header: x64 machine code. The diagnostic only inspects files.
    $pe = New-Object byte[] 128
    $pe[0] = 0x4d; $pe[1] = 0x5a; $pe[60] = 64
    $pe[64] = 0x50; $pe[65] = 0x45; $pe[68] = 0x64; $pe[69] = 0x86
    foreach ($name in @('plcommpro.dll', 'plcomms.dll', 'plrscomm.dll', 'pltcpcomm.dll', 'plrscagent.dll')) {
        [IO.File]::WriteAllBytes((Join-Path $sdk $name), $pe)
    }
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
    $listener.Start()
    $config = @{ apiBaseUrl = 'https://one80.invalid/api'; controllerId = 7; agentToken = $token; controllerIp = '127.0.0.1'; controllerPort = $listener.LocalEndpoint.Port; sdkPath = $sdk; communicationPassword = $password }
    $config | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runtime 'config.json') -Encoding UTF8
    $beforeConfig = [IO.File]::ReadAllBytes((Join-Path $runtime 'config.json'))

    # Old script stops and starts the task even if its test fails.
    try { & (Join-Path $PSScriptRoot 'Test-One80GateAgent.ps1') -InstallPath $install -RuntimePath $runtime -OutputPath $report } catch {}
    Assert-True ($global:One80TestTaskMutations -eq 0) 'Diagnostic changed scheduled-task ownership.'
    Assert-True (Test-Path -LiteralPath $report) 'Diagnostic did not produce a shareable report.'
    $text = Get-Content -LiteralPath $report -Raw
    Assert-True ($LASTEXITCODE -eq 0 -and $text.Contains('BASIC CHECKS PASSED')) 'Healthy basic diagnostics did not pass.'
    Assert-True ($global:One80TestApiCalls -eq 1) 'Expected one safe authenticated status read.'
    Assert-True (-not $text.Contains($token) -and -not $text.Contains($password)) 'Report exposed credentials.'

    foreach ($mode in @('failure', 'stale', 'missing')) {
        $global:One80TestApiMode = $mode
        & (Join-Path $PSScriptRoot 'Test-One80GateAgent.ps1') -InstallPath $install -RuntimePath $runtime -OutputPath $report
        $text = Get-Content -LiteralPath $report -Raw
        Assert-True ($LASTEXITCODE -ne 0 -and $text.Contains('ATTENTION NEEDED')) "API $mode gave false success."
        Assert-True (-not $text.Contains($token) -and -not $text.Contains($password)) 'Error report exposed credentials.'
    }
    $global:One80TestApiMode = 'online'
    $global:One80TestTaskState = 'Disabled'
    & (Join-Path $PSScriptRoot 'Test-One80GateAgent.ps1') -InstallPath $install -RuntimePath $runtime -OutputPath $report
    Assert-True ($LASTEXITCODE -ne 0 -and $global:One80TestTaskMutations -eq 0) 'Disabled task was started or reported healthy.'
    Assert-True ([Convert]::ToBase64String($beforeConfig) -eq [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $runtime 'config.json')))) 'Diagnostic changed saved settings.'

    Remove-Item -LiteralPath (Join-Path $runtime 'config.json')
    & (Join-Path $PSScriptRoot 'Test-One80GateAgent.ps1') -InstallPath $install -RuntimePath $runtime -OutputPath $report
    Assert-True ($LASTEXITCODE -ne 0 -and (Test-Path -LiteralPath $report)) 'Missing config did not produce a failure report.'
    Write-Host 'PASS: safe diagnostics, failure reporting, saved settings, and credential redaction.'
} finally {
    if (Get-Variable listener -ErrorAction SilentlyContinue) { $listener.Stop() }
    Remove-Item -LiteralPath $testRoot -Recurse -Force -ErrorAction SilentlyContinue
}

# Exercise the production polling loop with a failed controller connection.
$ast = [Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'One80.GateAgent.ps1'), [ref]$null, [ref]$null)
$loop = @($ast.EndBlock.Statements | Where-Object { $_ -is [Management.Automation.Language.TryStatementAst] })[-1]
$Once = $true
$ProbeOnly = $false
$script:LastSettings = [DateTime]::UtcNow
function Connect-Controller { throw 'controlled connection failure' }
function Disconnect-Controller {}
function Write-AgentLog { param($Message, $Level) }
function Invoke-GateApi { param($Method, $Path, $Body) }
$AgentVersion = 'test'
$threw = $false
try { & ([ScriptBlock]::Create($loop.Extent.Text)) } catch { $threw = $_.Exception.Message -eq 'controlled connection failure' }
Assert-True $threw '-Once swallowed a controller failure and returned success.'
Write-Host 'PASS: -Once propagates controller failure.'
