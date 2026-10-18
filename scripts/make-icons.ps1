# Generate placeholder icons (16/48/128 PNG). Replace files later with final icons.
# Usage: powershell -File scripts\make-icons.ps1
# NOTE: keep this file ASCII-only (Windows PowerShell 5.1 parses .ps1 as ANSI without BOM).
Add-Type -AssemblyName System.Drawing

function New-Icon([int]$Size, [string]$Path) {
    $Bmp = New-Object System.Drawing.Bitmap($Size, $Size)
    $G = [System.Drawing.Graphics]::FromImage($Bmp)
    $G.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $G.Clear([System.Drawing.Color]::FromArgb(255, 21, 66, 115))
    $Brush = [System.Drawing.Brushes]::White
    $Font = New-Object System.Drawing.Font('Arial', [float]($Size * 0.42), [System.Drawing.FontStyle]::Bold)
    $Fmt = New-Object System.Drawing.StringFormat
    $Fmt.Alignment = [System.Drawing.StringAlignment]::Center
    $Fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
    $Rect = New-Object System.Drawing.RectangleF(0, 0, $Size, $Size)
    $G.DrawString('CF', $Font, $Brush, $Rect, $Fmt)
    $G.Dispose()
    $Bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $Bmp.Dispose()
    $Font.Dispose()
    Write-Host "generated $Path"
}

$IconDir = Join-Path $PSScriptRoot '..\public\icons'
if (-not (Test-Path $IconDir)) { New-Item -ItemType Directory -Path $IconDir | Out-Null }

New-Icon 16  (Join-Path $IconDir 'icon16.png')
New-Icon 48  (Join-Path $IconDir 'icon48.png')
New-Icon 128 (Join-Path $IconDir 'icon128.png')
