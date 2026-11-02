# build.ps1 — optional "fewer requests" build.
#
# The game itself runs unbundled from the repo root (see README). This script
# copies the site into dist/ and concatenates every local script that
# index.html loads into vendor.bundle.js + game.bundle.js, so the deployed
# page makes two script requests instead of one per file.
#
# The file list is parsed from index.html, so adding or removing a script only
# requires editing index.html — this script can no longer drift out of sync.
#
# Usage:  .\build.ps1            (writes dist/)
#         .\build.ps1 -OutDir out

param([string]$OutDir = 'dist')

$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
if (-not $root) { $root = Get-Location }
$out = Join-Path $root $OutDir

if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item $out -ItemType Directory | Out-Null

$indexPath = Join-Path $root 'index.html'
if (-not (Test-Path $indexPath)) { throw "index.html not found in $root" }

$html = Get-Content $indexPath -Raw
$tagPattern = '<script src="([^"?]+\.js)\?v=[\d.]+"></script>'
$scripts = @([regex]::Matches($html, $tagPattern) | ForEach-Object { $_.Groups[1].Value })

if (-not $scripts.Count) { throw 'No local <script src="...?v=..."> tags found in index.html' }
if (($scripts | Sort-Object -Unique).Count -ne $scripts.Count) { throw 'index.html loads the same script twice' }

$vendorScripts = @($scripts | Where-Object { $_ -like 'vendor/*' })
$gameScripts = @($scripts | Where-Object { $_ -notlike 'vendor/*' })
if (-not $vendorScripts.Count) { throw 'No vendor scripts found (expected vendor/*.js)' }
if (-not $gameScripts.Count) { throw 'No game scripts found' }

function New-Bundle {
    param([string[]]$Files, [string]$Name)
    $parts = foreach ($f in $Files) {
        $p = Join-Path $root $f
        if (-not (Test-Path $p)) { throw "index.html references a missing file: $f" }
        "/* === $f === */`n" + (Get-Content $p -Raw) + "`n"
    }
    $target = Join-Path $out $Name
    [System.IO.File]::WriteAllText($target, ($parts -join ''), (New-Object System.Text.UTF8Encoding($false)))
    $kb = [math]::Round((Get-Item $target).Length / 1KB)
    Write-Host ("  {0} ({1} files, {2:N0} KB)" -f $Name, $Files.Count, $kb) -ForegroundColor Green
}

Write-Host "Bundling scripts listed in index.html ..." -ForegroundColor Cyan
New-Bundle -Files $vendorScripts -Name 'vendor.bundle.js'
New-Bundle -Files $gameScripts -Name 'game.bundle.js'

# Drop the individual script tags, then load the two bundles where the local
# scripts used to start (right after the master-server inline script).
$bundled = [regex]::Replace($html, $tagPattern, '')

$anchor = '(console\.log\(''\[master\] directory server:'', window\.MASTER_SERVER_URL\);\s*\}\)\(\);\s*</script>)'
if ($bundled -notmatch $anchor) { throw 'Could not find the master-server script tag in index.html' }
$bundleTags = "`$1`n`n    <script src=`"vendor.bundle.js?v=$((Get-Date).ToString('yyyyMMddHHmm'))`"></script>`n    <script src=`"game.bundle.js?v=$((Get-Date).ToString('yyyyMMddHHmm'))`"></script>"
$bundled = [regex]::Replace($bundled, $anchor, $bundleTags, 1)

Write-Host "Copying assets ..." -ForegroundColor Cyan
$skip = @('.git', 'tests', 'Master Server Code', 'node_modules', '__pycache__', $OutDir)
Get-ChildItem $root -Force |
    Where-Object { $_.Name -notin $skip -and $_.Extension -ne '.ps1' } |
    ForEach-Object { Copy-Item $_.FullName (Join-Path $out $_.Name) -Recurse -Force }

# Written after the asset copy so the root index.html does not overwrite it.
[System.IO.File]::WriteAllText((Join-Path $out 'index.html'), $bundled, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "  index.html (2 bundle tags)" -ForegroundColor Green

Write-Host "`n=== BUILD COMPLETE ===" -ForegroundColor Green
Write-Host "Upload the contents of '$OutDir' to the web root." -ForegroundColor Yellow
