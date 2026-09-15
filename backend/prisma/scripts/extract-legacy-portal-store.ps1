param(
  [Parameter(Mandatory = $true)]
  [string]$InputSql,

  [Parameter(Mandatory = $true)]
  [string]$OutputSql
)

$ErrorActionPreference = 'Stop'

$tables = [System.Collections.Generic.HashSet[string]]::new(
  [System.StringComparer]::Ordinal
)
@(
  'categories',
  'design_web_about',
  'design_web_contact_us',
  'design_web_job_ads',
  'design_web_job_ads_files',
  'design_web_partners',
  'design_web_photos',
  'design_web_photos_images',
  'design_web_slider',
  'design_web_slider_videos',
  'design_web_systems',
  'design_web_videos',
  'product_images',
  'products',
  'tbl_badge_settings',
  'tbl_store_captain_discounts',
  'tbl_offers',
  'users_applications',
  'web_users',
  'orders',
  'order_items'
) | ForEach-Object { [void]$tables.Add($_) }

if (-not (Test-Path -LiteralPath $InputSql -PathType Leaf)) {
  throw "Input SQL dump not found: $InputSql"
}

$resolvedInput = (Resolve-Path -LiteralPath $InputSql).Path
$outputDirectory = Split-Path -Parent $OutputSql
if (-not $outputDirectory) {
  $outputDirectory = (Get-Location).Path
  $OutputSql = Join-Path $outputDirectory $OutputSql
}
if (-not (Test-Path -LiteralPath $outputDirectory -PathType Container)) {
  [void](New-Item -ItemType Directory -Path $outputDirectory)
}
$resolvedOutputDirectory = (Resolve-Path -LiteralPath $outputDirectory).Path
$resolvedOutput = Join-Path $resolvedOutputDirectory (Split-Path -Leaf $OutputSql)

$sourceHash = (Get-FileHash -LiteralPath $resolvedInput -Algorithm SHA256).Hash.ToLowerInvariant()
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$reader = [System.IO.StreamReader]::new($resolvedInput, [System.Text.Encoding]::UTF8, $true, 1MB)
$writer = [System.IO.StreamWriter]::new($resolvedOutput, $false, $utf8NoBom, 1MB)
$statementCounts = @{}
$rowCounts = @{}
foreach ($tableName in $tables) {
  $statementCounts[$tableName] = 0
  $rowCounts[$tableName] = 0
}

try {
  $writer.WriteLine('-- Noamany website and store data extracted from the legacy production dump.')
  $writer.WriteLine("-- Source SHA-256: $sourceHash")
  $writer.WriteLine('-- PRIVATE: includes contact messages, job applications and customer accounts.')
  $writer.WriteLine('-- Target: the current Noamany schema after Prisma migrations have been applied.')
  $writer.WriteLine('SET NAMES utf8mb4;')
  $writer.WriteLine('SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0;')
  $writer.WriteLine('START TRANSACTION;')
  $writer.WriteLine()

  $activeTable = $null
  $statement = [System.Text.StringBuilder]::new()

  while (($line = $reader.ReadLine()) -ne $null) {
    if ($null -eq $activeTable) {
      if ($line -notmatch '^INSERT INTO `([^`]+)`') {
        continue
      }
      $candidate = $Matches[1]
      if (-not $tables.Contains($candidate)) {
        continue
      }
      $activeTable = $candidate
      [void]$statement.AppendLine($line)
    } else {
      [void]$statement.AppendLine($line)
    }

    if ($line -match '^\(') {
      $rowCounts[$activeTable]++
    }
    if (-not $line.TrimEnd().EndsWith(';')) {
      continue
    }

    $sql = $statement.ToString()
    $sql = $sql -replace '^INSERT INTO ', 'INSERT IGNORE INTO '
    if ($activeTable -eq 'design_web_photos' -or $activeTable -eq 'design_web_slider_videos') {
      $sql = $sql -replace '`type`', '`legacy_branch_id`'
    }
    if ($activeTable -eq 'tbl_store_captain_discounts') {
      $sql = $sql -replace '`captain_id`', '`legacy_captain_id`'
    }
    if ($activeTable -eq 'web_users') {
      $sql = $sql.Replace('`نسبة_الخصم`', '`discount_rate`')
      $sql = $sql.Replace('`تاريخ_البدء`', '`discount_start`')
      $sql = $sql.Replace('`تاريخ_الانتهاء`', '`discount_end`')
      $sql = $sql.Replace('`تفعيل_الخصم_للعميل`', '`discount_active`')
    }

    $writer.Write($sql)
    $writer.WriteLine()
    $statementCounts[$activeTable]++
    $activeTable = $null
    [void]$statement.Clear()
  }

  if ($null -ne $activeTable) {
    throw "Unterminated INSERT statement for table: $activeTable"
  }

  $writer.WriteLine('COMMIT;')
  $writer.WriteLine('SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS;')
} finally {
  $reader.Dispose()
  $writer.Dispose()
}

$manifest = foreach ($tableName in ($tables | Sort-Object)) {
  [pscustomobject]@{
    table = $tableName
    rows = $rowCounts[$tableName]
    insertStatements = $statementCounts[$tableName]
  }
}

[pscustomobject]@{
  source = $resolvedInput
  sourceSha256 = $sourceHash
  output = $resolvedOutput
  outputSha256 = (Get-FileHash -LiteralPath $resolvedOutput -Algorithm SHA256).Hash.ToLowerInvariant()
  outputBytes = (Get-Item -LiteralPath $resolvedOutput).Length
  tables = $manifest
} | ConvertTo-Json -Depth 4
