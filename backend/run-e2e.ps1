<#
.SYNOPSIS
  RBAC E2E deployment + test runner (Windows PowerShell 5.1+).

.DESCRIPTION
  Run from the backend directory:
    cd E:\final_projects\asmaa\23-8-2026\noamany-engineer17-9\backend
    powershell -ExecutionPolicy Bypass -File .\run-e2e.ps1

  Steps:
    1 - Pre-flight file checks
    2 - Run E2E seed (idempotent)
    3 - Build the project
    4 - Start backend in background
    5 - Wait for server ready
    6 - Run RBAC E2E tests
    7 - Stop backend and print report

  SAFETY: Never runs prisma migrate reset / db:reset / force-reset / reseed.
          Never drops tables. seed-e2e.ts is idempotent.

  PRE-CONDITION: Run "npx ts-node prisma/seed-rbac.ts" before this script.
#>

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
$BackendDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$AppPort     = 4002
$BaseUrl     = "http://localhost:$AppPort"
$LogOut      = "$BackendDir\e2e-server.out.log"
$LogErr      = "$BackendDir\e2e-server.err.log"
$ServerJob   = $null

# ---------------------------------------------------------------------------
# Helper functions  (ASCII only -- no Unicode emoji)
# ---------------------------------------------------------------------------
function Step-Banner([string]$msg) {
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host "  $msg" -ForegroundColor Cyan
    Write-Host "============================================" -ForegroundColor Cyan
}

function Write-OK([string]$msg)   { Write-Host "  [OK]   $msg" -ForegroundColor Green  }
function Write-WARN([string]$msg) { Write-Host "  [WARN] $msg" -ForegroundColor Yellow }
function Write-FAIL([string]$msg) { Write-Host "  [FAIL] $msg" -ForegroundColor Red    }

function Require-File([string]$path, [string]$label) {
    if (-not (Test-Path $path)) {
        Write-FAIL "$label not found: $path"
        exit 1
    }
    Write-OK "$label"
}

# ---------------------------------------------------------------------------
# Step 1 - Pre-flight checks
# ---------------------------------------------------------------------------
Step-Banner "Step 1: Pre-flight checks"

Set-Location $BackendDir

Require-File "$BackendDir\package.json"              "package.json"
Require-File "$BackendDir\.env"                      ".env"
Require-File "$BackendDir\jest-e2e.json"             "jest-e2e.json"
Require-File "$BackendDir\test\rbac.e2e-spec.ts"     "test/rbac.e2e-spec.ts"
Require-File "$BackendDir\prisma\seed-e2e.ts"        "prisma/seed-e2e.ts"
Require-File "$BackendDir\prisma\seed-rbac.ts"       "prisma/seed-rbac.ts"

# Check axios is installed (needed by E2E tests)
if (-not (Test-Path "$BackendDir\node_modules\axios")) {
    Write-WARN "axios not found in node_modules -- installing..."
    & npm install axios --save-dev
    if ($LASTEXITCODE -ne 0) { Write-FAIL "Failed to install axios"; exit 1 }
}

Write-OK "All required files present"

# ---------------------------------------------------------------------------
# Step 2 - Run E2E seed (idempotent)
# NOTE: This script assumes seed-rbac.ts was already run (user confirmed OK).
#       seed-e2e.ts validates that the required RBAC roles exist before doing
#       anything, so it will fail safely if they are missing.
# ---------------------------------------------------------------------------
Step-Banner "Step 2: Run E2E seed (idempotent)"

Write-Host "  Running: npx ts-node prisma/seed-e2e.ts"
& npx ts-node --project tsconfig.json "prisma\seed-e2e.ts"
if ($LASTEXITCODE -ne 0) {
    Write-FAIL "seed-e2e.ts failed -- see output above"
    exit 1
}
Write-OK "E2E seed completed"

# ---------------------------------------------------------------------------
# Step 3 - Build
# ---------------------------------------------------------------------------
Step-Banner "Step 3: Build (nest build)"

& npx nest build
if ($LASTEXITCODE -ne 0) {
    Write-FAIL "Build failed -- check TypeScript errors above"
    exit 1
}
Write-OK "Build succeeded"

# ---------------------------------------------------------------------------
# Step 4 - Start backend in background
# ---------------------------------------------------------------------------
Step-Banner "Step 4: Start backend (port $AppPort)"

if (Test-Path $LogOut) { Remove-Item $LogOut -Force }
if (Test-Path $LogErr) { Remove-Item $LogErr -Force }

$ServerJob = Start-Job -Name "e2e-backend" -ScriptBlock {
    param($dir, $port, $logOut, $logErr)
    Set-Location $dir
    $env:PORT = $port
    & node dist/main > $logOut 2> $logErr
} -ArgumentList $BackendDir, $AppPort, $LogOut, $LogErr

Write-OK "Backend job started (Id=$($ServerJob.Id))"

# ---------------------------------------------------------------------------
# Step 5 - Wait for server ready
# ---------------------------------------------------------------------------
Step-Banner "Step 5: Wait for server ready"

$ready     = $false
$maxWait   = 30
$attempt   = 0

while ((-not $ready) -and ($attempt -lt $maxWait)) {
    Start-Sleep -Seconds 2
    $attempt++
    try {
        $r = Invoke-WebRequest -Uri "$BaseUrl/auth/me" `
            -UseBasicParsing -TimeoutSec 3 -ErrorAction SilentlyContinue
        if ($r -ne $null -and ($r.StatusCode -eq 200 -or $r.StatusCode -eq 401)) {
            $ready = $true
        }
    } catch {
        # server not ready yet -- keep waiting
    }
    Write-Host "  Waiting... attempt $attempt / $maxWait"
}

if (-not $ready) {
    Write-FAIL "Server did not start within $($maxWait * 2) seconds"
    Write-Host ""
    Write-Host "  --- Last server output (stdout) ---" -ForegroundColor Yellow
    if (Test-Path $LogOut) { Get-Content $LogOut -Tail 30 }
    Write-Host "  --- Last server output (stderr) ---" -ForegroundColor Yellow
    if (Test-Path $LogErr) { Get-Content $LogErr -Tail 30 }
    Stop-Job  $ServerJob -ErrorAction SilentlyContinue
    Remove-Job $ServerJob -ErrorAction SilentlyContinue
    exit 1
}

Write-OK "Server is ready at $BaseUrl"

# ---------------------------------------------------------------------------
# Step 6 - Run E2E tests
# ---------------------------------------------------------------------------
Step-Banner "Step 6: RBAC E2E tests"

Write-Host "  Command: npx jest --config jest-e2e.json --testPathPattern=rbac.e2e-spec --verbose --forceExit"
Write-Host ""

$env:E2E_BASE_URL = $BaseUrl
& npx jest --config jest-e2e.json --testPathPattern=rbac.e2e-spec --verbose --forceExit
$JestExitCode = $LASTEXITCODE

# ---------------------------------------------------------------------------
# Step 7 - Stop backend
# ---------------------------------------------------------------------------
Step-Banner "Step 7: Stop backend"

if ($ServerJob -ne $null) {
    Stop-Job   $ServerJob -ErrorAction SilentlyContinue
    Remove-Job $ServerJob -ErrorAction SilentlyContinue
    Write-OK "Backend job stopped"
}

# ---------------------------------------------------------------------------
# Final report
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "============================================"
if ($JestExitCode -eq 0) {
    Write-Host "  RESULT: ALL E2E TESTS PASSED" -ForegroundColor Green
} else {
    Write-Host "  RESULT: SOME E2E TESTS FAILED (exit=$JestExitCode)" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Troubleshooting:" -ForegroundColor Yellow
    Write-Host "    1. Login failed for e2e user  -> re-run: npx ts-node prisma/seed-e2e.ts"
    Write-Host "    2. 403 where 404/200 expected -> check seed-rbac permissions"
    Write-Host "    3. Branch isolation wrong     -> check /auth/me response for user.branch"
    Write-Host "    4. Server stdout: $LogOut"
    Write-Host "    5. Server stderr: $LogErr"
}
Write-Host "============================================"

exit $JestExitCode
