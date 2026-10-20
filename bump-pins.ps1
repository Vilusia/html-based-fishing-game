# bump-pins.ps1 — bump every cache-busting ?v= pin in index.html / editor.html
#
# Why: index.html itself is cached by browsers, so editing a .js file does not
# reach players until its <script src="...?v=N"> token changes. Forgetting to
# bump a pin is the #1 cause of "my game didn't update". Run this before every
# push that touches a script, then hard-refresh (Ctrl+Shift+R) once.
#
# Usage:
#   .\bump-pins.ps1                 # bump only files changed vs. git HEAD
#   .\bump-pins.ps1 -All            # bump every pinned script
#   .\bump-pins.ps1 -Only ui.js     # bump just one file's pin
#
# It rewrites the integer after ?v= (e.g. ui.js?v=12.72 -> ui.js?v=12.73).
# A non-integer token (like a date) has 1 added if numeric, else is left alone.

param(
    [switch]$All,
    [string[]]$Only
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$htmlFiles = @('index.html', 'editor.html') | ForEach-Object { Join-Path $root $_ } |
    Where-Object { Test-Path $_ }

# Decide which script files are in scope.
$targets = @()
if ($Only.Count -gt 0) {
    $targets = $Only
}
elseif ($All) {
    $targets = $null  # null = every pin found
}
else {
    # Files changed vs HEAD (staged, unstaged and untracked).
    Push-Location $root
    try {
        $changed = git status --porcelain |
            ForEach-Object { $_.Substring(3).Trim() } |
            Where-Object { $_ -like '*.js' } |
            ForEach-Object { Split-Path $_ -Leaf }
        $targets = $changed | Sort-Object -Unique
    }
    finally { Pop-Location }
}

if ($targets -and $targets.Count -eq 0) {
    Write-Host 'No changed .js files vs HEAD. Use -All to bump every pin, or -Only <file>.'
    return
}

$inScope = { param($file) -not $targets -or ($targets -contains $file) }

$script:bumped = @()
foreach ($html in $htmlFiles) {
    $name = Split-Path $html -Leaf
    $text = Get-Content $html -Raw

    $new = [regex]::Replace($text, '([\w\.\-]+\.js\?v=)([\d\.]+)', {
            param($m)
            $file = $m.Groups[1].Value -replace '\?v=$', ''
            if (& $inScope $file) {
                # Bump only the last number so 12.71 -> 12.72, not 13.71.
                $ver = $m.Groups[2].Value
                $parts = $ver -split '\.'
                $parts[-1] = ([int]$parts[-1] + 1).ToString()
                $next = $parts -join '.'
                $script:bumped += "$file -> v$next"
                return $m.Groups[1].Value + $next
            }
            return $m.Value
        })

    if ($new -ne $text) {
        Set-Content -Path $html -Value $new -NoNewline
        Write-Host "Updated $name"
    }
}

if ($script:bumped.Count -eq 0) { Write-Host 'Nothing bumped.' }
else { $script:bumped | Sort-Object -Unique | ForEach-Object { Write-Host "  $_" } }
Write-Host ''
Write-Host 'Remember to hard-refresh the page once (Ctrl+Shift+R).'
