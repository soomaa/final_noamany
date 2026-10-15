$ErrorActionPreference = 'Stop'
$path = Join-Path $PSScriptRoot 'One80.GateAgent.ps1'
$source = Get-Content -LiteralPath $path -Raw
if ($source -match 'DeleteDeviceData|SetDeviceData') { throw 'Online agent must not modify device user/authorization tables.' }
$ast = [Management.Automation.Language.Parser]::ParseFile($path, [ref]$null, [ref]$null)
foreach ($name in @('Assert-ControllerIdentity', 'Open-GateDoor', 'Update-ControllerSettings')) {
    $fn = $ast.FindAll({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name }, $true)[0]
    . ([ScriptBlock]::Create($fn.Extent.Text))
}
$script:ControllerModel = 'INBIO160-PRO'
Assert-ControllerIdentity @{ '~DeviceName' = 'inBio160 Pro'; '~SerialNumber' = 'test' }
foreach ($model in @('MB20', 'inBio260 Pro', '')) {
    $failed = $false
    try { Assert-ControllerIdentity @{ '~DeviceName' = $model } } catch { $failed = $true }
    if (-not $failed) { throw "Accepted unverified device: $model" }
}
$script:Handle = [IntPtr]::Zero
$script:EntryDoorNo = 1
$script:ExitDoorNo = 0
$failed = $false
try { Open-GateDoor -DoorNo 2 } catch { $failed = $true }
if (-not $failed) { throw 'Unexpected relay accepted' }
$script:ControllerIp = '192.168.1.201'
$script:ControllerPort = 4370
$script:Disconnected = $false
function Disconnect-Controller { $script:Disconnected = $true }
function Invoke-GateApi { @{ controller = @{ model = 'INBIO160-PRO'; staticIp = '192.168.1.202'; port = 4370; entryDoorNo = 1; exitDoorNo = 0 } } }
Update-ControllerSettings
if ($script:ControllerIp -ne '192.168.1.202' -or -not $script:Disconnected) { throw 'Web configuration was not applied before connecting' }
Write-Host 'PASS: online-only agent preserves device users, verifies identity, validates relays, applies web configuration.'
