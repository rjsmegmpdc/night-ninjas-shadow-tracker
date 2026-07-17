<#
.SYNOPSIS
    DRAFT — cloud-5a scaffold. Exports the local VELOCITY sqlite DB and
    (optionally, only when explicitly told to) imports it into Cloudflare D1.

.DESCRIPTION
    Two-stage process:
      1. Export  — runs scripts/d1-export.mjs to dump the local
         %APPDATA%\NightNinjas\shadow-tracker.db to a plain-SQL file.
      2. Import  — runs `wrangler d1 execute velocity-db --remote --file=...`
         against the REAL Cloudflare account. This stage is DISABLED by
         default. You must pass -Execute AND -IReallyMeanIt to run it.

    This script was written as part of cloud-5a (compat verification +
    deploy scaffold) and has NOT been run against any remote. Do not run
    the import stage until:
      - the real D1 database "velocity-db" exists (wrangler d1 create),
      - wrangler.jsonc has the real database_id (not the placeholder),
      - you are authenticated as the intended Cloudflare account,
      - the target D1 database's schema already matches (migrations
        applied via `wrangler d1 migrations apply velocity-db --remote`
        BEFORE this data import).

.PARAMETER DbPath
    Path to the local sqlite DB. Defaults to
    $env:APPDATA\NightNinjas\shadow-tracker.db

.PARAMETER OutFile
    Path to write the exported .sql dump. Defaults to
    scripts/d1-import/export-<timestamp>.sql

.PARAMETER Execute
    Actually run the `wrangler d1 execute --remote` import step. Without
    this switch, the script only exports and prints the command you would
    need to run manually.

.PARAMETER IReallyMeanIt
    Second, explicit confirmation switch required alongside -Execute
    before any remote-mutating command runs. This is a belt-and-braces
    guard against accidental invocation from CI or muscle memory.

.EXAMPLE
    # Safe default: export only, print the manual next step.
    .\scripts\d1-import.ps1

.EXAMPLE
    # Actually import into D1 (cloud-5b only, after explicit sign-off):
    .\scripts\d1-import.ps1 -Execute -IReallyMeanIt
#>
param(
    [string]$DbPath,
    [string]$OutFile,
    [switch]$Execute,
    [switch]$IReallyMeanIt
)

$ErrorActionPreference = "Stop"

Write-Host "=== VELOCITY D1 import (DRAFT script — cloud-5a) ===" -ForegroundColor Cyan

$nodeArgs = @("scripts/d1-export.mjs")
if ($DbPath) { $nodeArgs += $DbPath }
if ($OutFile) {
    if (-not $DbPath) { $nodeArgs += "" }  # positional placeholder not needed; export script takes dbPath then outFile
    $nodeArgs += $OutFile
}

Write-Host "[1/2] Exporting local DB to SQL..." -ForegroundColor Yellow
& node @nodeArgs
if ($LASTEXITCODE -ne 0) {
    Write-Error "Export failed (exit $LASTEXITCODE). Aborting before touching any remote."
    exit $LASTEXITCODE
}

# Find the most recently written export file if OutFile wasn't given explicitly.
if (-not $OutFile) {
    $latest = Get-ChildItem -Path "scripts/d1-import" -Filter "export-*.sql" -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($latest) { $OutFile = $latest.FullName }
}

if (-not $Execute) {
    Write-Host ""
    Write-Host "[2/2] SKIPPED (default: export-only)." -ForegroundColor Yellow
    Write-Host "To import into the REAL D1 database, review the export file first:" -ForegroundColor Yellow
    Write-Host "  $OutFile"
    Write-Host ""
    Write-Host "Then run manually (after confirming account + database_id are correct):" -ForegroundColor Yellow
    Write-Host "  wrangler d1 execute velocity-db --remote --file=`"$OutFile`""
    Write-Host ""
    Write-Host "Or re-run this script with -Execute -IReallyMeanIt to have it run that command for you."
    exit 0
}

if (-not $IReallyMeanIt) {
    Write-Error "-Execute was passed without -IReallyMeanIt. Refusing to touch any remote database. This is intentional."
    exit 1
}

Write-Host ""
Write-Host "[2/2] Importing into D1 (REMOTE, real Cloudflare account)..." -ForegroundColor Red
Write-Host "  File:     $OutFile"
Write-Host "  Database: velocity-db"
Write-Host ""
$confirm = Read-Host "Type 'IMPORT' to proceed against the real remote D1 database"
if ($confirm -ne "IMPORT") {
    Write-Host "Aborted — confirmation text did not match." -ForegroundColor Yellow
    exit 1
}

wrangler d1 execute velocity-db --remote --file="$OutFile"
