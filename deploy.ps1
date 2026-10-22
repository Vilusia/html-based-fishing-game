# deploy.ps1 — publish the game to the webserver in one command.
#
# Setup (once):
#   1. On the server, make the web folder a git clone:
#        ssh administrator@gpu-jkey
#        sudo mkdir -p /var/www && sudo chown administrator /var/www
#        git clone https://github.com/Vilusia/html-fishing.git /var/www/html-fishing
#      (Use the SAME folder the Cloudflare tunnel serves at the root of
#       play.htmlfishing.com.)
#   2. Set up password-less SSH from this PC (once):
#        ssh-keygen -t ed25519          # if you don't have a key yet
#        type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh administrator@gpu-jkey "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
#
# Then every deploy is just:
#        .\deploy.ps1
#
# It bumps cache pins for changed scripts, commits, pushes, and tells the
# server to fast-forward. Use -Scp to copy the files directly instead of
# pulling from GitHub (useful if the server cannot reach GitHub).

param(
    [string]$SshTarget = "administrator@gpu-jkey",     # or administrator@204.12.227.121
    [string]$RemotePath = "/var/www/html-fishing",     # web root git clone on the server
    [switch]$Scp,                                      # push files directly instead of git pull
    [switch]$NoCommit                                  # only deploy what is already pushed
)

$ErrorActionPreference = 'Stop'
$repo = $PSScriptRoot
Push-Location $repo
try {
    if (-not $NoCommit) {
        Write-Host "== Bumping cache pins ==" -ForegroundColor Cyan
        node bump-pins.js

        Write-Host "== Committing ==" -ForegroundColor Cyan
        git add -A
        $dirty = git status --porcelain
        if ($dirty) {
            $msg = "Deploy " + (Get-Date -Format "yyyy-MM-dd HH:mm")
            git commit -m $msg | Out-Host
        } else {
            Write-Host "nothing to commit"
        }

        Write-Host "== Pushing ==" -ForegroundColor Cyan
        git push origin main | Out-Host
    }

    if ($Scp) {
        Write-Host "== Copying files to ${SshTarget}:$RemotePath ==" -ForegroundColor Cyan
        # Ship only what the site needs (no .git, no master-server code).
        $files = @(
            'index.html', 'editor.html', 'core.js', 'ui.js', 'props.js', 'fish.js',
            'ocean.js', 'worldgen.js', 'character3d.js', 'networking.js', 'audio.js',
            'progression.js', 'level-loader.js', 'icons.js', 'editor.js'
        ) | Where-Object { Test-Path (Join-Path $repo $_) }

        ssh $SshTarget "mkdir -p '$RemotePath'"
        foreach ($f in $files) {
            scp (Join-Path $repo $f) "${SshTarget}:$RemotePath/$f"
        }
        # Music + any asset folders, if present.
        foreach ($dir in @('music', 'sfx', 'assets')) {
            if (Test-Path (Join-Path $repo $dir)) {
                scp -r (Join-Path $repo $dir) "${SshTarget}:$RemotePath/"
            }
        }
    } else {
        Write-Host "== Fast-forwarding $RemotePath on $SshTarget ==" -ForegroundColor Cyan
        ssh $SshTarget "cd '$RemotePath' && git pull --ff-only && echo 'deployed:' && git log --oneline -1"
    }

    Write-Host "`nDone. Hard-refresh the game (Ctrl+Shift+R)." -ForegroundColor Green
}
finally {
    Pop-Location
}
