$ErrorActionPreference = 'Stop'
$taskRoot = $PSScriptRoot
$backendPath = Join-Path $taskRoot 'backend'
$frontendPath = Join-Path $taskRoot 'frontend'
$logsPath = Join-Path $taskRoot 'output'
$envPath = Join-Path $backendPath '.env'
$databaseLine = Get-Content -LiteralPath $envPath | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
$localDatabaseUri = [Uri]($databaseLine.Substring('DATABASE_URL='.Length).Trim().Trim('"', "'"))
if ($localDatabaseUri.Host -notin @('localhost', '127.0.0.1', '::1')) { throw 'This launcher requires a local database.' }
$importStatePath = Join-Path $logsPath 'local-server-import.json'
if (Test-Path -LiteralPath $importStatePath) {
    $importState = Get-Content -LiteralPath $importStatePath -Raw | ConvertFrom-Json
    if ($importState.status -ne 'imported' -or $localDatabaseUri.AbsolutePath.TrimStart('/') -ne $importState.database) {
        throw 'Finish importing and configuring the local snapshot before starting the system.'
    }
}
if (-not (Test-Path -LiteralPath (Join-Path $backendPath 'dist/main.js'))) { throw 'Run npm run build in backend first.' }
New-Item -ItemType Directory -Path $logsPath -Force | Out-Null
$nodePath = (Get-Command node).Source
$previousSchedulerSetting = $env:DISABLE_SCHEDULED_TASKS
$previousPort = $env:PORT
$previousApiTarget = $env:VITE_API_TARGET
$previousHost = $env:HOST
$previousRedisUrl = $env:REDIS_URL
try {
    $env:DISABLE_SCHEDULED_TASKS = 'true'
    $env:PORT = '4002'
    $env:VITE_API_TARGET = 'http://127.0.0.1:4002'
    $env:HOST = '127.0.0.1'
    $env:REDIS_URL = ''
    if (-not (Get-NetTCPConnection -LocalPort 4002 -State Listen -ErrorAction SilentlyContinue)) {
        Start-Process -FilePath $nodePath -ArgumentList 'dist/main.js' -WorkingDirectory $backendPath -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logsPath 'local-api.log') -RedirectStandardError (Join-Path $logsPath 'local-api-errors.log') | Out-Null
    }
    if (-not (Get-NetTCPConnection -LocalPort 5175 -State Listen -ErrorAction SilentlyContinue)) {
        Start-Process -FilePath $nodePath -ArgumentList 'node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5175','--strictPort' -WorkingDirectory $frontendPath -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logsPath 'local-frontend.log') -RedirectStandardError (Join-Path $logsPath 'local-frontend-errors.log') | Out-Null
    }
    Write-Host 'Dashboard: http://127.0.0.1:5175'
    Write-Host 'API: http://127.0.0.1:4002/api'
    Write-Host "Database: $($localDatabaseUri.AbsolutePath.TrimStart('/'))"
    Write-Host 'Scheduled tasks are disabled for this local run.'
} finally {
    $env:DISABLE_SCHEDULED_TASKS = $previousSchedulerSetting
    $env:PORT = $previousPort
    $env:VITE_API_TARGET = $previousApiTarget
    $env:HOST = $previousHost
    $env:REDIS_URL = $previousRedisUrl
}
