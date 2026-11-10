$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$build = Join-Path $root 'build'
$assets = Join-Path $root 'renderer\assets'
$iconSource = Join-Path $root 'assets\source\icon-source.png'
$traySource = Join-Path $assets 'tray.png'
$iconPng = Join-Path $build 'icon.png'
$icnsPath = Join-Path $build 'icon.icns'
$temp = Join-Path $env:TEMP 'gonow-iconset'

function Resize-Png([string]$source, [string]$target, [int]$size) {
  $image = [System.Drawing.Image]::FromFile($source)
  try {
    $bitmap = New-Object System.Drawing.Bitmap($size, $size)
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      try {
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.DrawImage($image, 0, 0, $size, $size)
      } finally {
        $graphics.Dispose()
      }
      $bitmap.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $bitmap.Dispose()
    }
  } finally {
    $image.Dispose()
  }
}

if (-not (Test-Path -LiteralPath $iconSource)) { throw "missing $iconSource" }
if (-not (Test-Path -LiteralPath $traySource)) { throw "missing $traySource" }
if (-not (Test-Path -LiteralPath $build)) { New-Item -ItemType Directory -Path $build | Out-Null }

Resize-Png $iconSource $iconPng 512

if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Recurse -Force }
New-Item -ItemType Directory -Path $temp | Out-Null
foreach ($size in 16, 32, 64, 128, 256, 512, 1024) {
  Resize-Png $iconSource (Join-Path $temp "icon_$size.png") $size
}
& node (Join-Path $PSScriptRoot 'pack-icns.js') $temp $icnsPath
if ($LASTEXITCODE -ne 0) { throw 'pack-icns failed' }
Remove-Item -LiteralPath $temp -Recurse -Force

Resize-Png $traySource (Join-Path $assets 'trayTemplate.png') 16
Resize-Png $traySource (Join-Path $assets 'trayTemplate@2x.png') 32
Resize-Png $traySource (Join-Path $assets 'tray-22.png') 22

Write-Output "icons OK: $iconPng, $icnsPath, trayTemplate/tray-22"
