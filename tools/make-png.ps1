# Outpost Boyz - tiny PNG generator (Windows PowerShell + System.Drawing).
# Used for the PWA icons (assets/icons/) and the arcade-pack title cards.
#   icon : powershell -File make-png.ps1 -Out a.png -W 512 -H 512 -Title OB -TitleScale 0.46
#   card : powershell -File make-png.ps1 -Out b.png -W 640 -H 480 -Title "SCRAP RUN" -Sub "RUN AND GUN" -Accent "#ff4d4d" -Card
param(
  [Parameter(Mandatory=$true)][string]$Out,
  [int]$W = 512,
  [int]$H = 512,
  [string]$Title = 'OB',
  [string]$Sub = '',
  [string]$Accent = '#39ff14',
  [double]$TitleScale = 0.46,
  [switch]$Card
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$bmp = New-Object System.Drawing.Bitmap($W, $H)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$g.Clear([System.Drawing.Color]::Black)

$white = [System.Drawing.Brushes]::White
$fam = 'Arial Black'
try { $null = New-Object System.Drawing.FontFamily($fam) } catch { $fam = 'Arial' }
$sf = New-Object System.Drawing.StringFormat
$sf.Alignment = [System.Drawing.StringAlignment]::Center
$sf.LineAlignment = [System.Drawing.StringAlignment]::Center

function Fit-Font([string]$text, [double]$maxW, [double]$startPx) {
  $px = $startPx
  while ($px -gt 8) {
    $f = New-Object System.Drawing.Font($fam, [single]$px, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $sz = $g.MeasureString($text, $f)
    if ($sz.Width -le $maxW) { return $f }
    $f.Dispose(); $px -= 2
  }
  return New-Object System.Drawing.Font($fam, [single]8, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
}

if ($Card) {
  $acc = [System.Drawing.ColorTranslator]::FromHtml($Accent)
  $accB = New-Object System.Drawing.SolidBrush($acc)
  # accent bars top + bottom, thin frame
  $g.FillRectangle($accB, 0, 0, $W, [int]($H * 0.035))
  $g.FillRectangle($accB, 0, $H - [int]($H * 0.035), $W, [int]($H * 0.035))
  $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(70, 255, 255, 255), 2)
  $g.DrawRectangle($pen, 18, 34, $W - 36, $H - 68)
  $small = New-Object System.Drawing.Font($fam, [single]($H * 0.04), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $grey = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(150, 255, 255, 255))
  $g.DrawString('OUTPOST BOYZ', $small, $grey, (New-Object System.Drawing.RectangleF(0, [single]($H * 0.12), $W, [single]($H * 0.08))), $sf)
  $tf = Fit-Font $Title ($W * 0.86) ($H * 0.2)
  $g.DrawString($Title, $tf, $white, (New-Object System.Drawing.RectangleF(0, [single]($H * 0.3), $W, [single]($H * 0.3))), $sf)
  if ($Sub) {
    $sfnt = Fit-Font $Sub ($W * 0.8) ($H * 0.055)
    $g.DrawString($Sub, $sfnt, $accB, (New-Object System.Drawing.RectangleF(0, [single]($H * 0.62), $W, [single]($H * 0.1))), $sf)
  }
  $g.DrawString('FREE ARCADE', $small, $grey, (New-Object System.Drawing.RectangleF(0, [single]($H * 0.8), $W, [single]($H * 0.08))), $sf)
} else {
  $tf = Fit-Font $Title ($W * 0.9) ($H * $TitleScale)
  # nudge up slightly: Arial Black sits low in its em box
  $g.DrawString($Title, $tf, $white, (New-Object System.Drawing.RectangleF(0, [single](-$H * 0.02), $W, $H)), $sf)
}

$dir = Split-Path -Parent $Out
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force $dir | Out-Null }
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Output "wrote $Out ($W x $H)"
