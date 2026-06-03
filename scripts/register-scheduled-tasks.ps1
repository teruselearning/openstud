# OpenStudbook — Register all Windows Scheduled Tasks
# Run this ONCE as Administrator (right-click → Run as administrator).

$ProjectRoot = Split-Path $PSScriptRoot -Parent
$BackupScript = "$PSScriptRoot\backup-db.ps1"

Write-Host "Registering OpenStudbook scheduled tasks..." -ForegroundColor Cyan

# ── Nightly database backup (02:00) ──────────────────────────────────────────
$action   = New-ScheduledTaskAction -Execute "powershell.exe" `
              -Argument "-ExecutionPolicy Bypass -NonInteractive -File `"$BackupScript`""
$trigger  = New-ScheduledTaskTrigger -Daily -At "02:00"
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable:$false
Register-ScheduledTask -TaskName "OpenStudbook DB Backup" `
    -Action $action -Trigger $trigger -Settings $settings `
    -RunLevel Highest -Force | Out-Null
Write-Host "  [OK] OpenStudbook DB Backup — daily at 02:00" -ForegroundColor Green

Write-Host "`nAll tasks registered. Verify in Task Scheduler." -ForegroundColor Cyan
