param(
    [string]$msg = "Auto-update: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
)

Write-Host "Syncing with GitHub..." -ForegroundColor Cyan
git add .
$status = git status --porcelain
if ($status) {
    git commit -m $msg
    git push
    Write-Host "Successfully pushed changes to GitHub!" -ForegroundColor Green
} else {
    Write-Host "No new changes to push. Pulling latest..." -ForegroundColor Yellow
    git pull
}
