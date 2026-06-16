# Rush - Auto-backup script
# Commits and pushes any uncommitted changes to GitHub.
# Run hourly via Windows Task Scheduler.

$git         = 'C:\Program Files\Git\cmd\git.exe'
$projectPath = 'D:\Vibe Coding\Rush'
$logFile     = 'D:\Vibe Coding\Rush\auto-backup.log'
$timestamp   = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'

Set-Location $projectPath

$status = & $git status --porcelain 2>&1
if (-not $status) {
    Add-Content $logFile "[$timestamp] Nothing to commit - skipped."
    exit 0
}

& $git add -A 2>&1 | Out-Null
$label = Get-Date -Format 'yyyy-MM-dd HH:mm'
& $git commit -m "auto-backup: $label" 2>&1 | Out-Null

$push = & $git push origin master 2>&1
if ($LASTEXITCODE -eq 0) {
    Add-Content $logFile "[$timestamp] Pushed OK."
} else {
    $msg = $push -join ' '
    Add-Content $logFile "[$timestamp] Push failed: $msg"
}
