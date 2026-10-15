$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$t=$null; $e=$null
$ast = [Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'One80.GateAgent.ps1'), [ref]$t, [ref]$e)
if ($e.Count) { throw ($e | Out-String) }
$fn = $ast.Find({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Process-Commands' }, $true)
. ([ScriptBlock]::Create($fn.Extent.Text))
$script:ControllerIp = '192.168.1.202'
$script:ControllerPort = 4370
$script:ControllerModel = 'C3-200'
$script:Opens = 0
$script:Posts = [Collections.Generic.List[object]]::new()
$script:Warnings = 0
function Invoke-GateApi {
    param($Method, $Path, $Body)
    if ($Method -eq 'GET') {
        # Invoke-RestMethod can emit a complete JSON array as one pipeline item.
        if ($script:ResponseMode -eq 'null') { return $null }
        return ,$script:CommandResponse
    }
    $script:Posts.Add(@{ path = $Path; body = $Body })
}
function Open-GateDoor { param($DoorNo, $Seconds) $script:Opens++ }
function Write-AgentLog { param($Message, $Level) $script:Warnings++ }
function Reset-Test {
    $script:Opens=0; $script:Posts.Clear(); $script:Warnings=0
    $script:ResponseMode='array'
}
function New-TestCommand([string]$Id) {
    return [pscustomobject]@{ id=$Id; type='open_door'; createdAt=[DateTime]::UtcNow.ToString('o');
        payload=[pscustomobject]@{controllerIp='192.168.1.202';controllerPort=4370;controllerModel='C3-200';doorNo=1;seconds=1} }
}
foreach ($kind in @('empty', 'null')) {
    Reset-Test
    $script:CommandResponse = @()
    if ($kind -eq 'null') { $script:ResponseMode='null' }
    Process-Commands
    if ($script:Opens -ne 0 -or $script:Posts.Count -ne 0 -or $script:Warnings -ne 0) { throw "$kind response was treated as a command" }
}
foreach ($count in @(1,2)) {
    Reset-Test
    $script:CommandResponse = @(1..$count | ForEach-Object { New-TestCommand ([string]$_) })
    Process-Commands
    if ($script:Opens -ne $count -or $script:Posts.Count -ne $count) { throw 'Array commands were lost or duplicated' }
    for ($i=0; $i -lt $count; $i++) {
        if ($script:Posts[$i].path -ne "commands/$($i+1)/result" -or $script:Posts[$i].body.status -ne 'completed') { throw 'Wrong command acknowledgement' }
    }
}
Reset-Test
$invalid = New-TestCommand '1'
$invalid.PSObject.Properties.Remove('id')
$script:CommandResponse = @($invalid, (New-TestCommand 'bad/id'))
Process-Commands
if ($script:Opens -ne 0 -or $script:Posts.Count -ne 0 -or $script:Warnings -ne 2) { throw 'Invalid command ids must never open a relay' }
Reset-Test
$stale = New-TestCommand '3'
$stale.createdAt = [DateTime]::UtcNow.AddMinutes(-1).ToString('o')
$script:CommandResponse = @($stale)
Process-Commands
if ($script:Opens -ne 0 -or $script:Posts.Count -ne 1 -or $script:Posts[0].body.status -ne 'failed') { throw 'Expired command handling changed' }
Write-Host 'PASS: empty/null commands, valid batches, invalid ids, and expired-command rejection.'
