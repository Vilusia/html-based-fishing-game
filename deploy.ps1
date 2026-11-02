# deploy.ps1 — publish the game to the webserver in one command.
#
# Setup (once):
#   1. On the server, make the web folder a git clone:
#        ssh administrator@gpu-jkey
#        sudo mkdir -p /var/www && sudo chown administrator /var/www
#        git clone https://github.com/Vilusia/html-fishing.git /var/www/html-fishing
#      (Use the SAME folder the Cloudflare tunnel serves at the root of
#       htmlfishing.com.)
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
        # Keep this list in step with the <script>/<link> tags in index.html and
        # editor.html — the regression tests fail when a page script is missing.
        $files = @(
            'index.html', 'editor.html', 'ads.txt', '.htaccess',
            'favicon.ico', 'favicon.svg', 'favicon-16.png', 'favicon-32.png', 'favicon-48.png',
            'apple-touch-icon.png', 'patreon_banner.png',
            'vendor/Midi.js', 'vendor/three.min.js', 'vendor/CSS3DRenderer.js', 'vendor/peerjs.min.js',
            'mobile-ui.css', 'guided-tutorial.css', 'protogen-logo.css', 'character-studio.css',
            'icons.js', 'worldgen.js', 'ocean.js', 'core.js', 'fish.js', 'protogen-logo.js',
            'character3d.js', 'bobbers3d.js', 'networking.js', 'audio.js', 'reel-audio.js',
            'progression.js', 'performance.js', 'outdoor-props.js', 'rowboat.js', 'network-guard.js',
            'ui.js', 'shop-preview.js', 'shop-try-on.js', 'character-thumbnails.js',
            'character-studio.js', 'emotes.js', 'tournaments.js', 'furniture.js', 'housing.js',
            'props.js', 'exploration.js', 'level-loader.js', 'scratch.js', 'boats.js',
            'halloween.js', 'mobile-ui.js', 'guided-tutorial.js', 'editor.js'
        ) | Where-Object { Test-Path (Join-Path $repo $_) }

        ssh $SshTarget "mkdir -p '$RemotePath' '$RemotePath/vendor'"
        foreach ($f in $files) {
            scp (Join-Path $repo $f) "${SshTarget}:$RemotePath/$f"
        }
        # Music: the game requests "music/", but the repo folder is "Music/".
        # Upload it under the lowercase name so case-sensitive hosts find it.
        if (Test-Path (Join-Path $repo 'Music')) {
            $staging = '/tmp/html-fishing-music'
            ssh $SshTarget "rm -rf '$staging' && mkdir -p '$staging'"
            scp -r (Join-Path $repo 'Music') "${SshTarget}:$staging/"
            ssh $SshTarget "rm -rf '$RemotePath/music' && mv '$staging/Music' '$RemotePath/music' && rmdir '$staging'"
        }
        foreach ($dir in @('sfx', 'assets')) {
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
