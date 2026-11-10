param(
  [string]$IconSource = '',
  [string]$TextSource = '',
  [int]$LogoHeight = 72
)

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot

if (-not $IconSource) {
  $repoIcon = Join-Path $root 'assets\source\icon-source.png'
  if (Test-Path -LiteralPath $repoIcon) {
    $IconSource = $repoIcon
  } else {
    $IconSource = "$env:USERPROFILE\Downloads\Go,Now - Iconv3.png"
  }
}

if (-not $TextSource) {
  $repoText = Join-Path $root 'assets\source\logo-source.png'
  if (Test-Path -LiteralPath $repoText) {
    $TextSource = $repoText
  } else {
    $TextSource = "$env:USERPROFILE\Downloads\Go,Now - Textv3.png"
  }
}

$assetsDir = Join-Path $root 'renderer\assets'
New-Item -ItemType Directory -Force -Path $assetsDir | Out-Null

function Setup-Graphics {
  param([System.Drawing.Graphics]$Graphics)
  $Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $Graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $Graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
}

function Save-ResizedPng {
  param(
    [System.Drawing.Image]$Source,
    [int]$Size,
    [string]$OutPath
  )
  $bitmap = New-Object System.Drawing.Bitmap $Size, $Size
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  Setup-Graphics -Graphics $graphics
  $graphics.DrawImage($Source, 0, 0, $Size, $Size)
  $bitmap.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $bitmap.Dispose()
}

function Get-AlphaBounds {
  param([System.Drawing.Bitmap]$Bitmap, [int]$Threshold = 180)
  $rect = New-Object System.Drawing.Rectangle 0, 0, $Bitmap.Width, $Bitmap.Height
  $data = $Bitmap.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  try {
    $stride = $data.Stride
    $bytes = New-Object byte[] ($stride * $Bitmap.Height)
    [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
  } finally {
    $Bitmap.UnlockBits($data)
  }
  $minX = $Bitmap.Width
  $minY = $Bitmap.Height
  $maxX = -1
  $maxY = -1
  for ($y = 0; $y -lt $Bitmap.Height; $y++) {
    $row = $y * $stride
    for ($x = 0; $x -lt $Bitmap.Width; $x++) {
      if ($bytes[$row + $x * 4 + 3] -gt $Threshold) {
        if ($x -lt $minX) { $minX = $x }
        if ($x -gt $maxX) { $maxX = $x }
        if ($y -lt $minY) { $minY = $y }
        if ($y -gt $maxY) { $maxY = $y }
      }
    }
  }
  if ($maxX -lt 0) {
    return @{ X = 0; Y = 0; Width = $Bitmap.Width; Height = $Bitmap.Height }
  }
  return @{ X = $minX; Y = $minY; Width = ($maxX - $minX + 1); Height = ($maxY - $minY + 1) }
}

function Save-LogoPng {
  param(
    [string]$Path,
    [string]$OutPath,
    [int]$Height
  )
  $source = [System.Drawing.Bitmap]::FromFile($Path)
  try {
    $bounds = Get-AlphaBounds -Bitmap $source
    $pad = [int][Math]::Max(2, [Math]::Round($bounds.Height * 0.02))
    $x = [Math]::Max(0, $bounds.X - $pad)
    $y = [Math]::Max(0, $bounds.Y - $pad)
    $w = [Math]::Min($source.Width - $x, $bounds.Width + $pad * 2)
    $h = [Math]::Min($source.Height - $y, $bounds.Height + $pad * 2)
    $targetW = [Math]::Max(1, [int][Math]::Round($w * $Height / $h))
    $bitmap = New-Object System.Drawing.Bitmap $targetW, $Height
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    Setup-Graphics -Graphics $graphics
    $destRect = New-Object System.Drawing.Rectangle 0, 0, $targetW, $Height
    $srcRect = New-Object System.Drawing.Rectangle $x, $y, $w, $h
    $graphics.DrawImage($source, $destRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
    $bitmap.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose()
    $bitmap.Dispose()
    Write-Output ("logo: crop {0}x{1}+{2}+{3} -> {4}x{5}" -f $w, $h, $x, $y, $targetW, $Height)
  } finally {
    $source.Dispose()
  }
}

if (-not (Test-Path -LiteralPath $IconSource)) { throw "Icon source not found: $IconSource" }
if (-not (Test-Path -LiteralPath $TextSource)) { throw "Text logo source not found: $TextSource" }

$icon = [System.Drawing.Image]::FromFile($IconSource)
Save-ResizedPng -Source $icon -Size 512 -OutPath (Join-Path $assetsDir 'icon-512.png')
Save-ResizedPng -Source $icon -Size 256 -OutPath (Join-Path $assetsDir 'icon-256.png')
Save-ResizedPng -Source $icon -Size 128 -OutPath (Join-Path $assetsDir 'icon-128.png')
Save-ResizedPng -Source $icon -Size 32 -OutPath (Join-Path $assetsDir 'tray.png')
$icon.Dispose()

Save-LogoPng -Path $TextSource -OutPath (Join-Path $assetsDir 'logo.png') -Height $LogoHeight

Write-Output 'brand assets created (icons from IconSource, in-app logo from TextSource)'
