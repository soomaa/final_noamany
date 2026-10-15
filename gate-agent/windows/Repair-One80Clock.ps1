& {
    $ErrorActionPreference = 'Stop'
    if (-not [Environment]::Is64BitProcess) { throw 'Use 64-bit PowerShell as Administrator.' }
    $admin = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $admin.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Run PowerShell as Administrator.' }
    $root = "$env:ProgramData\ONE80\GateAgent"
    $cfg = Get-Content "$root\config.json" -Raw | ConvertFrom-Json
    $sdk = [Environment]::ExpandEnvironmentVariables([string]$cfg.sdkPath)
    $dll = Join-Path $sdk 'plcommpro.dll'
    if (-not (Test-Path -LiteralPath $dll)) { throw 'Installed SDK not found.' }
    if ($cfg.controllerIp -ne '192.168.1.202' -or $cfg.controllerModel -ne 'C3-200') { throw 'Unexpected controller configuration.' }
    if (-not ('One80ClockRepair' -as [type])) {
        $literal = $dll.Replace('"', '""')
        Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class One80ClockRepair {
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    public static extern bool SetDllDirectory(string path);
    [DllImport(@"$literal", CharSet=CharSet.Ansi)]
    public static extern IntPtr Connect(string parameters);
    [DllImport(@"$literal")]
    public static extern void Disconnect(IntPtr handle);
    [DllImport(@"$literal", CharSet=CharSet.Ansi)]
    public static extern int GetDeviceParam(IntPtr handle, [Out] byte[] buffer, int size, string names);
    [DllImport(@"$literal", CharSet=CharSet.Ansi)]
    public static extern int SetDeviceParam(IntPtr handle, string values);
}
"@
    }
    if (-not [One80ClockRepair]::SetDllDirectory($sdk)) { throw 'SDK directory could not be loaded.' }
    [pscustomobject]@{ TimeZone = (Get-TimeZone).Id; UtcBefore = [DateTime]::UtcNow.ToString('o') } |
        ConvertTo-Json | Set-Content (Join-Path $root ('clock-before-' + (Get-Date -Format 'yyyyMMddHHmmss') + '.json'))
    Disable-ScheduledTask -TaskName 'ONE80 Gate Agent' | Out-Null
    Stop-ScheduledTask -TaskName 'ONE80 Gate Agent'
    Start-Sleep -Seconds 2
    if ((Get-ScheduledTask -TaskName 'ONE80 Gate Agent').State -eq 'Running') { throw 'Agent is still running. No clock changed.' }
    $handle = [IntPtr]::Zero
    try {
        $connection = 'protocol=TCP,ipaddress={0},port={1},timeout=5000,passwd={2}' -f $cfg.controllerIp, $cfg.controllerPort, $cfg.communicationPassword
        $handle = [One80ClockRepair]::Connect($connection)
        if ($handle -eq [IntPtr]::Zero) { throw 'Controller connection failed. Agent remains disabled.' }
        $buffer = New-Object byte[] 4096
        $result = [One80ClockRepair]::GetDeviceParam($handle, $buffer, $buffer.Length, '~SerialNumber,~DeviceName')
        $identity = [Text.Encoding]::ASCII.GetString($buffer).Trim([char]0)
        if ($result -lt 0 -or $identity -notmatch '~SerialNumber=AAK3245000027(?:[,\r\n]|$)' -or $identity -notmatch '~DeviceName=C3-200(?:[,\r\n]|$)') { throw 'Controller identity check failed. No clock changed.' }
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        $reply = Invoke-WebRequest -Uri 'https://one80.alatheertech.com/' -Method Head -UseBasicParsing -TimeoutSec 20
        $elapsed = [Diagnostics.Stopwatch]::StartNew()
        $siteTime = [DateTimeOffset]::Parse([string]$reply.Headers['Date'], [Globalization.CultureInfo]::InvariantCulture)
        if ($siteTime.Year -ne 2026 -or $siteTime.Month -ne 10 -or $siteTime.Day -ge 30) { throw 'Temporary UTC+3 repair is only for October 2026 before DST ends.' }
        tzutil.exe /s 'E. Africa Standard Time'
        if ($LASTEXITCODE -ne 0) { throw 'Time zone change failed.' }
        [TimeZoneInfo]::ClearCachedData()
        if ([TimeZoneInfo]::Local.GetUtcOffset($siteTime).TotalHours -ne 3) { throw 'Expected UTC+3.' }
        Set-Date -Date ($siteTime.Add($elapsed.Elapsed).LocalDateTime) | Out-Null
        $now = Get-Date
        $encoded = [long]((($now.Year - 2000) * 12 * 31 + ($now.Month - 1) * 31 + $now.Day - 1) * 86400 + $now.Hour * 3600 + $now.Minute * 60 + $now.Second)
        $result = [One80ClockRepair]::SetDeviceParam($handle, "DateTime=$encoded")
        if ($result -ne 0) { throw "Controller clock sync failed: $result. Agent remains disabled." }
        Write-Host 'CONTROLLER_CLOCK_SYNC=0 (success)'
        Write-Host 'PC local:' (Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')
        Write-Host 'PC UTC  :' ([DateTime]::UtcNow.ToString('yyyy-MM-dd HH:mm:ss'))
    } finally {
        if ($handle -ne [IntPtr]::Zero) { [One80ClockRepair]::Disconnect($handle) }
        [void][One80ClockRepair]::SetDllDirectory($null)
    }
    Enable-ScheduledTask -TaskName 'ONE80 Gate Agent' | Out-Null
    Start-ScheduledTask -TaskName 'ONE80 Gate Agent'
    Write-Host 'Agent restarted. Scan one active member QR.'
}
