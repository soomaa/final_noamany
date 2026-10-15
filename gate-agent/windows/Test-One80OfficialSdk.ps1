# Read-only live-event probe using an isolated official SDK candidate.
$ErrorActionPreference = 'Stop'
if ((Get-ScheduledTask -TaskName 'ONE80 Gate Agent').State -eq 'Running') {
    throw 'Stop the scheduled agent before this test.'
}
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$gateRoot = "$env:ProgramData\ONE80\GateAgent"
$trial = Join-Path $gateRoot 'sdk-2.2.1.4-test'
New-Item -ItemType Directory -Path $trial -Force | Out-Null
$zip = Join-Path $trial 'official-sdk.zip'
$url = 'https://s3.ap-southeast-1.amazonaws.com/zkteco.co.th/files/20260822/Pull%20SDK-2.2.1.4.zip'
Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $zip
if ((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash -ne '0e7fa90e5a4727c96efa34d78ed13400376ff82a99fec7b613d1799918132769') {
    throw 'Downloaded package differs from the reviewed official SDK.'
}
Expand-Archive -LiteralPath $zip -DestinationPath $trial -Force
$dlls = @(Get-ChildItem -LiteralPath $trial -Filter plcommpro.dll -Recurse -File |
    Where-Object { $_.FullName -match '[\\/]dll[\\/]x64[\\/]' })
if ($dlls.Count -ne 1) { throw 'Expected exactly one x64 SDK directory.' }
$nativePath = Join-Path $trial 'native-x64'
New-Item -ItemType Directory -Path $nativePath -Force | Out-Null
Get-ChildItem -LiteralPath $dlls[0].DirectoryName -Filter '*.dll' -File |
    Copy-Item -Destination $nativePath -Force
$probeText = Get-Content -LiteralPath (Join-Path $gateRoot 'One80.ReadProbe.ps1') -Raw
if (-not $probeText.Contains('History skipped for this diagnostic only') -or
    -not $probeText.Contains('STEP 2: Live events BEGIN')) {
    throw 'Expected the previously prepared live-only diagnostic.'
}
# Pin the primary DLL to the verified candidate instead of DLL search order.
$nativeDll = (Join-Path $nativePath 'plcommpro.dll').Replace('\', '\\')
$probeText = $probeText.Replace('[DllImport("plcommpro.dll",', '[DllImport("' + $nativeDll + '",')
$trialProbe = Join-Path $trial 'ReadProbe.ps1'
Set-Content -LiteralPath $trialProbe -Value $probeText -Encoding UTF8
$cfg = Get-Content -LiteralPath (Join-Path $gateRoot 'config.json') -Raw | ConvertFrom-Json
$cfg.sdkPath = $nativePath
$cfg.runtimePath = $trial
$trialConfig = Join-Path $trial 'probe-config.json'
try {
    $cfg | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $trialConfig -Encoding UTF8
    & "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File $trialProbe -ConfigPath $trialConfig -ProbeOnly
    Write-Host "NEW_SDK_EXIT=$LASTEXITCODE"
} finally {
    Remove-Item -LiteralPath $trialConfig -Force -ErrorAction SilentlyContinue
}
