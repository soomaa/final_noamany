[CmdletBinding()]
param(
    [string]$ConfigPath = "$PSScriptRoot\config.json",
    [switch]$Once,
    [switch]$ProbeOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$AgentVersion = "1.1.0"
$script:Handle = [IntPtr]::Zero
$script:LastHeartbeat = [DateTime]::MinValue
$script:LastSettings = [DateTime]::MinValue
$script:LastTransactionPoll = [DateTime]::MinValue
$script:LastRevision = ""

function Write-AgentLog {
    param([string]$Message, [string]$Level = "INFO")
    $line = "{0} [{1}] {2}" -f (Get-Date).ToString("yyyy-MM-dd HH:mm:ss"), $Level, $Message
    Add-Content -LiteralPath $script:LogPath -Value $line -Encoding UTF8
    if ((Get-Item -LiteralPath $script:LogPath).Length -gt 10MB) {
        $archive = Join-Path $script:RuntimeRoot ("gate-agent-{0}.log" -f (Get-Date).ToString("yyyyMMdd-HHmmss"))
        Move-Item -LiteralPath $script:LogPath -Destination $archive -Force
    }
}

function Get-RequiredConfig {
    param([object]$Config, [string]$Name)
    $value = $Config.$Name
    if ($null -eq $value -or [string]::IsNullOrWhiteSpace([string]$value)) {
        throw "Missing required config value: $Name"
    }
    return $value
}

function Invoke-GateApi {
    param(
        [ValidateSet("GET", "POST")][string]$Method,
        [string]$Path,
        [object]$Body
    )
    $uri = "{0}/gate-agent/{1}/{2}" -f $script:ApiBaseUrl, $script:ControllerId, $Path.TrimStart("/")
    $parameters = @{
        Method      = $Method
        Uri         = $uri
        Headers     = @{ "X-Gate-Agent-Token" = $script:AgentToken }
        TimeoutSec  = 10
        MaximumRedirection = 0
        ErrorAction = "Stop"
    }
    if ($Method -eq "POST") {
        $parameters.ContentType = "application/json; charset=utf-8"
        $parameters.Body = ConvertTo-Json -InputObject $Body -Depth 12 -Compress
    }
    return Invoke-RestMethod @parameters
}

function Initialize-PullSdk {
    $required = @("plcommpro.dll", "plcomms.dll", "plrscomm.dll", "pltcpcomm.dll")
    foreach ($file in $required) {
        $path = Join-Path $script:SdkPath $file
        if (-not (Test-Path -LiteralPath $path)) {
            throw "Missing official ZKTeco Pull SDK file: $path"
        }
    }
    if (
        -not (Test-Path -LiteralPath (Join-Path $script:SdkPath "rscagent.dll")) -and
        -not (Test-Path -LiteralPath (Join-Path $script:SdkPath "plrscagent.dll"))
    ) {
        throw "Missing official Pull SDK dependency: rscagent.dll/plrscagent.dll"
    }

    [Environment]::SetEnvironmentVariable(
        "PATH",
        "$($script:SdkPath);$([Environment]::GetEnvironmentVariable('PATH', 'Process'))",
        "Process"
    )

    if (-not ("One80PullSdk" -as [type])) {
        Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class One80PullSdk
{
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool SetDllDirectory(string lpPathName);

    [DllImport("plcommpro.dll", EntryPoint = "Connect", CharSet = CharSet.Ansi)]
    public static extern IntPtr Connect(string parameters);

    [DllImport("plcommpro.dll", EntryPoint = "Disconnect")]
    public static extern void Disconnect(IntPtr handle);

    [DllImport("plcommpro.dll", EntryPoint = "ControlDevice", CharSet = CharSet.Ansi)]
    public static extern int ControlDevice(
        IntPtr handle, int operationId, int parameter1, int parameter2,
        int parameter3, int options, string extra);

    [DllImport("plcommpro.dll", EntryPoint = "GetRTLog")]
    // PowerShell [ref] wraps a scalar; it does not pin the rest of a byte array.
    // Marshal the complete writable buffer for every SDK output function.
    public static extern int GetRTLog(IntPtr handle, [Out] byte[] buffer, int bufferSize);

    [DllImport("plcommpro.dll", EntryPoint = "GetDeviceData", CharSet = CharSet.Ansi)]
    public static extern int GetDeviceData(
        IntPtr handle, [Out] byte[] buffer, int bufferSize, string tableName,
        string fieldNames, string filter, string options);

    [DllImport("plcommpro.dll", EntryPoint = "GetDeviceParam", CharSet = CharSet.Ansi)]
    public static extern int GetDeviceParam(
        IntPtr handle, [Out] byte[] buffer, int bufferSize, string itemNames);
}
"@
    }
    if (-not [One80PullSdk]::SetDllDirectory($script:SdkPath)) {
        throw "Windows could not activate Pull SDK directory: $($script:SdkPath)"
    }
}

function Connect-Controller {
    if ($script:Handle -ne [IntPtr]::Zero) { return }
    $connection = "protocol=TCP,ipaddress={0},port={1},timeout=5000,passwd={2}" -f `
        $script:ControllerIp, $script:ControllerPort, $script:CommunicationPassword
    $script:Handle = [One80PullSdk]::Connect($connection)
    if ($script:Handle -eq [IntPtr]::Zero) {
        throw "Controller connection failed (Pull SDK TCP) at $($script:ControllerIp):$($script:ControllerPort)"
    }
    Assert-ControllerIdentity (Get-ControllerInfo)
    Write-AgentLog "Connected to controller at $($script:ControllerIp):$($script:ControllerPort)"
}

function Disconnect-Controller {
    if ($script:Handle -ne [IntPtr]::Zero) {
        try { [One80PullSdk]::Disconnect($script:Handle) } catch {}
        $script:Handle = [IntPtr]::Zero
        Write-AgentLog "Disconnected from controller"
    }
}

function Assert-ControllerIdentity {
    param([hashtable]$Info)
    $actual = [string]$Info['~DeviceName']
    $canonical = ($actual -replace '[^a-zA-Z0-9]', '').ToUpperInvariant()
    $expected = ($script:ControllerModel -replace '[^a-zA-Z0-9]', '').ToUpperInvariant()
    if ([string]::IsNullOrWhiteSpace($actual) -or $canonical -ne $expected) {
        throw "Controller identity mismatch. Web model=$($script:ControllerModel); device=$actual. Verify the controller IP/model; MB20 attendance is not an InBio panel."
    }
}

function Update-ControllerSettings {
    $status = Invoke-GateApi -Method GET -Path "status"
    if (-not $status.controller) { throw "Update the ONE80 backend before installing Gate Agent 1.1.0." }
    $next = $status.controller
    if ($next.model -notin @('C3-200', 'INBIO160-PRO', 'INBIO260-PRO')) { throw "Unsupported controller model from server." }
    if ($script:ControllerIp -ne $next.staticIp -or $script:ControllerPort -ne [int]$next.port -or $script:ControllerModel -ne $next.model) {
        Disconnect-Controller
    }
    $script:ControllerIp = [string]$next.staticIp
    $script:ControllerPort = [int]$next.port
    $script:ControllerModel = [string]$next.model
    $script:EntryDoorNo = [int]$next.entryDoorNo
    $script:ExitDoorNo = [int]$next.exitDoorNo
    $maxDoor = if ($script:ControllerModel -eq 'INBIO160-PRO') { 1 } else { 2 }
    if ($script:EntryDoorNo -lt 1 -or $script:EntryDoorNo -gt $maxDoor -or $script:ExitDoorNo -lt 0 -or $script:ExitDoorNo -gt $maxDoor) {
        throw "Invalid relay configuration from server."
    }
    $script:LastSettings = [DateTime]::UtcNow
}

function Open-GateDoor {
    param([int]$DoorNo, [int]$Seconds = 1)
    if ($DoorNo -lt 1 -or $DoorNo -notin @($script:EntryDoorNo, $script:ExitDoorNo)) { throw "Relay is not configured: $DoorNo" }
    $duration = [Math]::Min(5, [Math]::Max(1, $Seconds))
    $result = [One80PullSdk]::ControlDevice(
        $script:Handle, 1, $DoorNo, 1, $duration, 0, ""
    )
    if ($result -lt 0) { throw "Open door $DoorNo failed with SDK code $result" }
    Write-AgentLog "Door $DoorNo opened for $duration second(s)"
}

function Get-ControllerInfo {
    $bufferSize = 4096
    $buffer = New-Object byte[] $bufferSize
    $result = [One80PullSdk]::GetDeviceParam(
        $script:Handle, $buffer, $bufferSize, "~SerialNumber,FirmVer,~DeviceName"
    )
    if ($result -lt 0) { return @{} }
    $text = [Text.Encoding]::Default.GetString($buffer).Trim([char]0)
    $values = @{}
    foreach ($pair in ($text -split "[,`r`n]+")) {
        $parts = $pair -split "=", 2
        if ($parts.Count -eq 2) { $values[$parts[0].Trim()] = $parts[1].Trim() }
    }
    return $values
}

function Save-PendingEvent {
    param([object]$Event)
    $path = Join-Path $script:QueuePath ("{0}.json" -f $Event.fingerprint)
    ConvertTo-Json -InputObject $Event -Depth 8 -Compress |
        Set-Content -LiteralPath $path -Encoding UTF8
}

function Send-Event {
    param([object]$Event, [switch]$QueueOnFailure)
    try {
        $response = Invoke-GateApi -Method POST -Path "events" -Body $Event
        if ($null -ne $response -and $null -ne $response.PSObject.Properties['reasonCode']) {
            Write-AgentLog ("Gate decision: type={0}; reason={1}; eventUtc={2}; pcUtc={3}" -f $Event.eventType, $response.reasonCode, $Event.occurredAt, [DateTime]::UtcNow.ToString('o'))
        }
        if ($response.openDoor -eq $true -and ([DateTime]::UtcNow - [DateTime]::Parse([string]$Event.occurredAt).ToUniversalTime()).TotalSeconds -le 15) {
            Open-GateDoor -DoorNo ([int]$response.doorNo) -Seconds ([int]$response.seconds)
        }
        return $true
    } catch {
        if ($QueueOnFailure) {
            Save-PendingEvent $Event
            Write-AgentLog "Event queued while API unavailable: $($_.Exception.Message)" "WARN"
        }
        return $false
    }
}

function Flush-PendingEvents {
    $files = @(Get-ChildItem -LiteralPath $script:QueuePath -Filter "*.json" -File |
        Sort-Object Name | Select-Object -First 100)
    foreach ($file in $files) {
        try {
            $event = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
            if ([int]$event.eventType -eq 255) {
                $statusArchive = Join-Path $script:RuntimeRoot "status-snapshots"
                New-Item -ItemType Directory -Path $statusArchive -Force | Out-Null
                Move-Item -LiteralPath $file.FullName -Destination (Join-Path $statusArchive $file.Name) -Force
                continue
            }
            if (Send-Event -Event $event) {
                Remove-Item -LiteralPath $file.FullName -Force
            } else {
                break
            }
        } catch {
            Write-AgentLog "Pending event replay failed: $($_.Exception.Message)" "WARN"
            break
        }
    }
}

function Convert-RtLogLine {
    param([string]$Line)
    $parts = $Line.Trim() -split ","
    # Type 255 is a controller status snapshot, not a credential event.
    if ($parts.Count -ge 5 -and $parts[4].Trim() -eq '255') { return $null }
    if ($parts.Count -lt 7) { return $null }
    try {
        $localTime = [DateTime]::Parse($parts[0].Trim())
        $pin = $parts[1].Trim()
        $cardNo = $parts[2].Trim()
        $doorNo = [int]$parts[3]
        $eventType = [int]$parts[4]
        $inOutState = [int]$parts[5]
        $verifyMode = [int]$parts[6]
        return New-GateEvent `
            -LocalTime $localTime `
            -Pin $pin `
            -CardNo $cardNo `
            -DoorNo $doorNo `
            -EventType $eventType `
            -InOutState $inOutState `
            -VerifyMode $verifyMode
    } catch {
        Write-AgentLog "Could not parse RTLog line: $Line" "WARN"
        return $null
    }
}

function New-GateEvent {
    param(
        [DateTime]$LocalTime,
        [string]$Pin,
        [string]$CardNo,
        [int]$DoorNo,
        [int]$EventType,
        [int]$InOutState,
        [int]$VerifyMode
    )
    $occurredAt = $LocalTime.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    # Canonical and deterministic across RTLog + transaction catch-up. This also
    # debounces two identical reads in the same second after reconnect.
    $source = "$($script:ControllerId)|$occurredAt|$Pin|$CardNo|$DoorNo|$EventType|$InOutState|$VerifyMode"
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
        $fingerprint = ([BitConverter]::ToString(
            $sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($source))
        )).Replace("-", "").ToLowerInvariant()
    } finally {
        $sha.Dispose()
    }
    return @{
        fingerprint = $fingerprint
        occurredAt = $occurredAt
        pin = $Pin
        credentialNo = $CardNo
        doorNo = $DoorNo
        eventType = $EventType
        inOutState = $InOutState
        verifyMode = $VerifyMode
    }
}

function Convert-TransactionLine {
    param([string]$Line)
    $values = @{}
    foreach ($field in ($Line.Trim() -split "`t")) {
        $parts = $field -split "=", 2
        if ($parts.Count -eq 2) { $values[$parts[0].Trim()] = $parts[1].Trim() }
    }
    try {
        if (-not $values.ContainsKey("Time_second")) { return $null }
        return New-GateEvent `
            -LocalTime ([DateTime]::Parse([string]$values["Time_second"])) `
            -Pin ([string]$values["Pin"]) `
            -CardNo ([string]$values["Cardno"]) `
            -DoorNo ([int]$values["DoorID"]) `
            -EventType ([int]$values["EventType"]) `
            -InOutState ([int]$values["InOutState"]) `
            -VerifyMode ([int]$values["Verified"])
    } catch {
        Write-AgentLog "Could not parse transaction line: $Line" "WARN"
        return $null
    }
}

function Read-HistoricalTransactions {
    $bufferSize = 4MB
    $buffer = New-Object byte[] $bufferSize
    $result = [One80PullSdk]::GetDeviceData(
        $script:Handle, $buffer, $bufferSize,
        "transaction", "*", "", "NewRecord"
    )
    if ($result -lt 0) { throw "Transaction catch-up failed with SDK code $result" }
    if ($result -eq 0) { return }
    $text = [Text.Encoding]::Default.GetString($buffer).Trim([char]0).Trim()
    foreach ($line in ($text -split "`r?`n")) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        $event = Convert-TransactionLine $line
        if ($null -ne $event) {
            [void](Send-Event -Event $event -QueueOnFailure)
        }
    }
}

function Read-RealtimeEvents {
    for ($readBatch = 0; $readBatch -lt 8; $readBatch++) {
        $bufferSize = 64KB
        $buffer = New-Object byte[] $bufferSize
        $result = [One80PullSdk]::GetRTLog($script:Handle, $buffer, $bufferSize)
        if ($result -lt 0) { throw "GetRTLog failed with SDK code $result" }
        $text = [Text.Encoding]::Default.GetString($buffer).Trim([char]0).Trim()
        if ([string]::IsNullOrWhiteSpace($text)) { break }
        $batchEventCount = 0
        foreach ($line in ($text -split "`r?`n")) {
            if ([string]::IsNullOrWhiteSpace($line)) { continue }
            $event = Convert-RtLogLine $line
            if ($null -ne $event) {
                $batchEventCount++
                [void](Send-Event -Event $event -QueueOnFailure)
            }
        }
        if ($result -eq 0 -or $batchEventCount -eq 0) { break }
    }
}

function Process-Commands {
    $commands = @(Invoke-GateApi -Method GET -Path "commands" | ForEach-Object { $_ } | Where-Object { $null -ne $_ })
    foreach ($command in $commands) {
        if ($null -eq $command.PSObject.Properties['id'] -or [string]$command.id -notmatch '^[1-9][0-9]*$') {
            Write-AgentLog "Ignored malformed command without a valid id" "WARN"
            continue
        }
        $status = "completed"
        $result = @{}
        try {
            switch ([string]$command.type) {
                "open_door" {
                    if ([string]$command.payload.controllerIp -ne $script:ControllerIp -or [int]$command.payload.controllerPort -ne $script:ControllerPort -or [string]$command.payload.controllerModel -ne $script:ControllerModel) { throw "Controller settings changed; retry after the next heartbeat." }
                    if (([DateTime]::UtcNow - [DateTime]::Parse([string]$command.createdAt).ToUniversalTime()).TotalSeconds -gt 15) { throw "Open command expired." }
                    Open-GateDoor -DoorNo ([int]$command.payload.doorNo) `
                        -Seconds ([int]$command.payload.seconds)
                    $result = @{ opened = $true; doorNo = [int]$command.payload.doorNo }
                }
                default { throw "Unsupported command: $($command.type)" }
            }
        } catch {
            $status = "failed"
            $result = @{ error = $_.Exception.Message }
        }
        [void](Invoke-GateApi -Method POST -Path "commands/$($command.id)/result" -Body @{
            status = $status
            result = $result
        })
    }
}

if (-not (Test-Path -LiteralPath $ConfigPath)) {
    throw "Gate Agent config file was not found: $ConfigPath"
}
$config = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
$script:ApiBaseUrl = ([string](Get-RequiredConfig $config "apiBaseUrl")).TrimEnd("/")
$script:ControllerId = [int](Get-RequiredConfig $config "controllerId")
$script:AgentToken = [string](Get-RequiredConfig $config "agentToken")
$script:ControllerModel = [string](Get-RequiredConfig $config "controllerModel")
$script:EntryDoorNo = 1
$script:ExitDoorNo = 0
$script:ControllerIp = [string](Get-RequiredConfig $config "controllerIp")
$script:ControllerPort = if ($config.controllerPort) { [int]$config.controllerPort } else { 4370 }
$script:CommunicationPassword = if ($null -ne $config.communicationPassword) {
    [string]$config.communicationPassword
} else { "" }
$script:SdkPath = [Environment]::ExpandEnvironmentVariables(
    [string](Get-RequiredConfig $config "sdkPath")
)
$script:SyncIntervalSeconds = if ($config.syncIntervalSeconds) {
    [Math]::Max(30, [int]$config.syncIntervalSeconds)
} else { 60 }
$script:PollIntervalMs = if ($config.pollIntervalMs) {
    [Math]::Max(100, [int]$config.pollIntervalMs)
} else { 250 }
$script:RuntimeRoot = if ($config.runtimePath) {
    [Environment]::ExpandEnvironmentVariables([string]$config.runtimePath)
} else {
    Join-Path $env:ProgramData "ONE80\GateAgent"
}
$script:QueuePath = Join-Path $script:RuntimeRoot "queue"
$script:LogPath = Join-Path $script:RuntimeRoot "gate-agent.log"
New-Item -ItemType Directory -Path $script:RuntimeRoot -Force | Out-Null
New-Item -ItemType Directory -Path $script:QueuePath -Force | Out-Null

Initialize-PullSdk
Write-AgentLog "ONE80 Gate Agent $AgentVersion started"

try {
    do {
        try {
            if (([DateTime]::UtcNow - $script:LastSettings).TotalSeconds -ge 15) { Update-ControllerSettings }
            Connect-Controller
            if ($ProbeOnly) {
                $info = Get-ControllerInfo
                Write-Host "PASS: authenticated API and SDK connection. Model=$($info['~DeviceName']); SN=$($info['~SerialNumber'])"
                break
            }
            # Online authorization: never replace users, fingerprints, or access tables.

            Flush-PendingEvents
            if (([DateTime]::UtcNow - $script:LastTransactionPoll).TotalSeconds -ge 10) {
                Read-HistoricalTransactions
                $script:LastTransactionPoll = [DateTime]::UtcNow
            }
            Read-RealtimeEvents
            Process-Commands

            if (([DateTime]::UtcNow - $script:LastHeartbeat).TotalSeconds -ge 15) {
                $info = Get-ControllerInfo
                [void](Invoke-GateApi -Method POST -Path "heartbeat" -Body @{
                    agentVersion = $AgentVersion
                    firmwareVersion = [string]$info["FirmVer"]
                    serialNumber = [string]$info["~SerialNumber"]
                    status = "online"
                    synced = $false
                })
                $script:LastHeartbeat = [DateTime]::UtcNow
            }
        } catch {
            Write-AgentLog $_.Exception.Message "ERROR"
            Disconnect-Controller
            try {
                if ($ProbeOnly) { throw "Probe is read-only" }
                [void](Invoke-GateApi -Method POST -Path "heartbeat" -Body @{
                    agentVersion = $AgentVersion
                    status = "controller_offline"
                    lastError = $_.Exception.Message
                })
            } catch {}
            # -Once performs normal agent work; diagnostics use the Test script.
            # Propagate failure so an operator never receives false exit-code success.
            if ($Once -or $ProbeOnly) { throw }
            Start-Sleep -Seconds 5
        }

        if (-not $Once) { Start-Sleep -Milliseconds $script:PollIntervalMs }
    } while (-not $Once)
} finally {
    Disconnect-Controller
    Write-AgentLog "ONE80 Gate Agent stopped"
}
