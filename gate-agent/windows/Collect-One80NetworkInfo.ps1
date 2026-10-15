[CmdletBinding()]
param(
    [string]$OutputPath = "$env:USERPROFILE\Desktop\ONE80-NETWORK-INFO.txt"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$lines = [System.Collections.Generic.List[string]]::new()
$lines.Add("ONE80 C3-200 NETWORK DISCOVERY")
$lines.Add("Generated: $((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))")
$lines.Add("Computer: $env:COMPUTERNAME")
$lines.Add("")

$active = Get-NetIPConfiguration |
    Where-Object { $_.IPv4Address -and $_.NetAdapter.Status -eq "Up" }
foreach ($item in $active) {
    $lines.Add("Adapter: $($item.InterfaceAlias)")
    $lines.Add("PC IPv4: $($item.IPv4Address.IPAddress)")
    $lines.Add("Prefix length: $($item.IPv4Address.PrefixLength)")
    $gateway = @($item.IPv4DefaultGateway | ForEach-Object { $_.NextHop }) -join ", "
    $dns = @($item.DNSServer.ServerAddresses) -join ", "
    $lines.Add("Default gateway: $gateway")
    $lines.Add("DNS: $dns")
    $lines.Add("")
}

$lines.Add("DHCP / adapter detail:")
$lines.Add((Get-NetIPInterface -AddressFamily IPv4 |
    Where-Object { $_.ConnectionState -eq "Connected" } |
    Select-Object InterfaceAlias, Dhcp, ConnectionState, InterfaceMetric |
    Format-Table -AutoSize | Out-String))
$lines.Add("ARP table (used only to spot obvious IP conflicts):")
$lines.Add((Get-NetNeighbor -AddressFamily IPv4 |
    Where-Object { $_.State -ne "Unreachable" } |
    Select-Object InterfaceAlias, IPAddress, LinkLayerAddress, State |
    Format-Table -AutoSize | Out-String))
$lines.Add("")
$lines.Add("Installer: also send a screenshot of the router DHCP range/reservations.")
$lines.Add("Do NOT choose a final C3 IP from ping alone; reserve/exclude it in the router.")

$lines | Set-Content -LiteralPath $OutputPath -Encoding UTF8
Write-Host "Network discovery saved to: $OutputPath" -ForegroundColor Green
