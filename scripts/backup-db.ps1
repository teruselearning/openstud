# OpenStudbook — Database Backup Script
# Saves a compressed .sql.gz backup and prunes files older than $RetainDays.
# Designed to be run as a Windows Scheduled Task (daily).
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File backup-db.ps1
#   powershell -ExecutionPolicy Bypass -File backup-db.ps1 -RetainDays 60

param(
    [int]$RetainDays = 30
)

$ErrorActionPreference = "Stop"

# ── Config — read from backend/.env ──────────────────────────────────────────
# Values are loaded from backend/.env so no credentials are stored in this file.
$EnvFile = "$PSScriptRoot\..\backend\.env"
$envVars = @{}
if (Test-Path $EnvFile) {
    Get-Content $EnvFile | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
            $envVars[$matches[1].Trim()] = $matches[2].Trim()
        }
    }
}

$MariaDbBin  = "C:\Program Files\MariaDB 12.2\bin"
$DbHost      = if ($envVars["DATABASE_HOST"])     { $envVars["DATABASE_HOST"] }     else { "localhost" }
$DbPort      = if ($envVars["DATABASE_PORT"])     { $envVars["DATABASE_PORT"] }     else { "3306" }
$DbUser      = if ($envVars["DATABASE_USER"])     { $envVars["DATABASE_USER"] }     else { "root" }
$DbPassword  = if ($envVars["DATABASE_PASSWORD"]) { $envVars["DATABASE_PASSWORD"] } else { "" }
$DbName      = if ($envVars["DATABASE_NAME"])     { $envVars["DATABASE_NAME"] }     else { "openstudbook" }
$BackupDir   = "$PSScriptRoot\..\backups"
$LogFile     = "$PSScriptRoot\..\backups\backup.log"
# ─────────────────────────────────────────────────────────────────────────────

function Write-Log($msg) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $msg"
    Write-Host $line
    Add-Content -Path $LogFile -Value $line -ErrorAction SilentlyContinue
}

# Ensure backup directory exists
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

$timestamp  = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$dumpFile   = "$BackupDir\openstudbook_$timestamp.sql"
$gzipFile   = "$dumpFile.gz"

Write-Log "=== Backup started ==="

# ── Dump ──────────────────────────────────────────────────────────────────────
Write-Log "Dumping database '$DbName'..."
$env:MYSQL_PWD = $DbPassword
& "$MariaDbBin\mysqldump.exe" `
    --host=$DbHost `
    --port=$DbPort `
    --user=$DbUser `
    --single-transaction `
    --routines `
    --triggers `
    --default-character-set=utf8mb4 `
    $DbName | Out-File -FilePath $dumpFile -Encoding utf8

if ($LASTEXITCODE -ne 0) {
    Write-Log "ERROR: mysqldump failed (exit $LASTEXITCODE)"
    exit 1
}
$env:MYSQL_PWD = $null

$sizeMb = [math]::Round((Get-Item $dumpFile).Length / 1MB, 2)
Write-Log "Dump complete — ${sizeMb} MB"

# ── Compress ──────────────────────────────────────────────────────────────────
Write-Log "Compressing..."
$inputStream  = [System.IO.File]::OpenRead($dumpFile)
$outputStream = [System.IO.File]::Create($gzipFile)
$gzipStream   = New-Object System.IO.Compression.GZipStream($outputStream, [System.IO.Compression.CompressionMode]::Compress)
$inputStream.CopyTo($gzipStream)
$gzipStream.Close(); $outputStream.Close(); $inputStream.Close()
Remove-Item $dumpFile

$gzMb = [math]::Round((Get-Item $gzipFile).Length / 1MB, 2)
Write-Log "Compressed to ${gzMb} MB → $(Split-Path $gzipFile -Leaf)"

# ── Prune old backups ─────────────────────────────────────────────────────────
$cutoff = (Get-Date).AddDays(-$RetainDays)
$old    = Get-ChildItem -Path $BackupDir -Filter "*.sql.gz" | Where-Object { $_.LastWriteTime -lt $cutoff }
if ($old.Count -gt 0) {
    $old | Remove-Item -Force
    Write-Log "Pruned $($old.Count) backup(s) older than $RetainDays days"
} else {
    Write-Log "No old backups to prune"
}

Write-Log "=== Backup finished ==="
