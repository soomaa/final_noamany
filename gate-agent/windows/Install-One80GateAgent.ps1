[CmdletBinding()]
param(
    [string]$SetupFile = "$PSScriptRoot\one80-gate-setup.json",
    [string]$ApiBaseUrl,
    [int]$ControllerId,
    [string]$AgentToken,
    [string]$ControllerIp,
    [int]$ControllerPort = 4370,
    [string]$CommunicationPassword = "",
    [string]$ControllerModel,
    [string]$SdkSourcePath = "$PSScriptRoot\sdk",
    [string]$InstallPath = "$env:ProgramFiles\ONE80 Gate Agent",
    [string]$RuntimePath = "$env:ProgramData\ONE80\GateAgent"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run PowerShell as Administrator, then run this installer again."
}
if (-not [Environment]::Is64BitProcess) {
    throw "Use 64-bit Windows PowerShell. The package is configured for Pull SDK X64."
}
if (Test-Path -LiteralPath $SetupFile) {
    $setup = Get-Content -LiteralPath $SetupFile -Raw -Encoding UTF8 | ConvertFrom-Json
    $ApiBaseUrl = [string]$setup.apiBaseUrl
    $ControllerId = [int]$setup.controllerId
    $AgentToken = [string]$setup.agentToken
    $ControllerIp = [string]$setup.controllerIp
    $ControllerPort = [int]$setup.controllerPort
    $ControllerModel = [string]$setup.controllerModel
    if ($setup.communicationPassword) { $CommunicationPassword = [string]$setup.communicationPassword }
}
if ($ControllerId -lt 1 -or $ControllerModel -notin @('C3-200', 'INBIO160-PRO', 'INBIO260-PRO')) {
    throw "Download one80-gate-setup.json from Gate Access and place it beside this installer."
}
$parsedIp = $null
if (-not [Net.IPAddress]::TryParse($ControllerIp, [ref]$parsedIp) -or $parsedIp.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork -or $ControllerPort -lt 1 -or $ControllerPort -gt 65535) { throw "Invalid controller IPv4 address or port." }
if ($CommunicationPassword -match '[,\r\n]') { throw "Communication password contains unsupported delimiters." }
if ($AgentToken.Length -lt 32) { throw "AgentToken is invalid or incomplete." }
if (-not [Uri]::IsWellFormedUriString($ApiBaseUrl, [UriKind]::Absolute)) {
    throw "ApiBaseUrl must be a full HTTPS URL."
}
if (-not $ApiBaseUrl.StartsWith("https://", [StringComparison]::OrdinalIgnoreCase)) {
    throw "ApiBaseUrl must use HTTPS."
}

$requiredDlls = @("plcommpro.dll", "plcomms.dll", "plrscomm.dll", "pltcpcomm.dll")
foreach ($dll in $requiredDlls) {
    if (-not (Test-Path -LiteralPath (Join-Path $SdkSourcePath $dll))) {
        throw "Official Pull SDK X64 file is missing: $dll"
    }
}
if (
    -not (Test-Path -LiteralPath (Join-Path $SdkSourcePath "rscagent.dll")) -and
    -not (Test-Path -LiteralPath (Join-Path $SdkSourcePath "plrscagent.dll"))
) {
    throw "Official Pull SDK dependency is missing: rscagent.dll/plrscagent.dll"
}

# Validate API + actual SDK identity before replacing an existing installation.
$probeRoot = Join-Path $env:ProgramData ("ONE80-Gate-Probe-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $probeRoot -Force | Out-Null
& icacls.exe $probeRoot /inheritance:r /grant:r "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-544:(OI)(CI)F" | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Could not secure preflight folder." }
try {
    $probeConfig = @{ apiBaseUrl = $ApiBaseUrl.TrimEnd('/'); controllerId = $ControllerId; agentToken = $AgentToken;
        controllerIp = $ControllerIp; controllerPort = $ControllerPort; controllerModel = $ControllerModel;
        communicationPassword = $CommunicationPassword; sdkPath = $SdkSourcePath; runtimePath = $probeRoot;
        syncIntervalSeconds = 60; pollIntervalMs = 250 }
    $probeFile = Join-Path $probeRoot 'config.json'
    $probeConfig | ConvertTo-Json | Set-Content -LiteralPath $probeFile -Encoding UTF8
    & "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'One80.GateAgent.ps1') -ConfigPath $probeFile -ProbeOnly
    if ($LASTEXITCODE -ne 0) { throw "Preflight failed. No new agent installed. Correct the IP/model/port or API setup and retry." }
} finally { Remove-Item -LiteralPath $probeRoot -Recurse -Force }
$existingTask = Get-ScheduledTask -TaskName 'ONE80 Gate Agent' -ErrorAction SilentlyContinue
if ($existingTask) { Stop-ScheduledTask -TaskName 'ONE80 Gate Agent' }

New-Item -ItemType Directory -Path $InstallPath -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $InstallPath "sdk") -Force | Out-Null
New-Item -ItemType Directory -Path $RuntimePath -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "One80.GateAgent.ps1") `
    -Destination (Join-Path $InstallPath "One80.GateAgent.ps1") -Force
foreach ($dll in Get-ChildItem -LiteralPath $SdkSourcePath -Filter "*.dll" -File) {
    Copy-Item -LiteralPath $dll.FullName -Destination (Join-Path $InstallPath "sdk") -Force
}

# The token must be readable only by SYSTEM and local administrators.
& icacls.exe $RuntimePath /inheritance:r /grant:r "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-544:(OI)(CI)F" | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Could not secure the Gate Agent configuration folder." }


$config = [ordered]@{
    apiBaseUrl = $ApiBaseUrl.TrimEnd("/")
    controllerId = $ControllerId
    agentToken = $AgentToken
    controllerIp = $ControllerIp
    controllerModel = $ControllerModel
    controllerPort = $ControllerPort
    communicationPassword = $CommunicationPassword
    sdkPath = (Join-Path $InstallPath "sdk")
    runtimePath = $RuntimePath
    syncIntervalSeconds = 60
    pollIntervalMs = 250
}
$configPath = Join-Path $RuntimePath "config.json"
ConvertTo-Json -InputObject $config -Depth 5 |
    Set-Content -LiteralPath $configPath -Encoding UTF8

$taskName = "ONE80 Gate Agent"
$action = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" `
    -Argument "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$InstallPath\One80.GateAgent.ps1`" -ConfigPath `"$configPath`""
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable
$principalTask = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
    -Settings $settings -Principal $principalTask -Force | Out-Null
Start-ScheduledTask -TaskName $taskName

Start-Sleep -Seconds 4
$task = Get-ScheduledTask -TaskName $taskName
$info = Get-ScheduledTaskInfo -TaskName $taskName
Write-Host ""
Write-Host "ONE80 Gate Agent installed. Final acceptance requires a member QR scan at the gate." -ForegroundColor Green
Write-Host "Task state: $($task.State)"
Write-Host "Last task result: $($info.LastTaskResult)"
Write-Host "Log: $RuntimePath\gate-agent.log"
Write-Host "Config: $configPath"
Write-Host "Controller: ${ControllerIp}:${ControllerPort}"
