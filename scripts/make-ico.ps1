Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$assetsDir = Join-Path $root 'renderer\assets'
$buildDir = Join-Path $root 'build'
New-Item -ItemType Directory -Force -Path $buildDir | Out-Null

$sourcePath = Join-Path $assetsDir 'icon-512.png'
if (-not (Test-Path -LiteralPath $sourcePath)) { throw "icon-512.png not found; run scripts/make-brand.ps1 first" }

$sizes = @(16, 24, 32, 48, 64, 128, 256)
$images = @()

foreach ($size in $sizes) {
  $src = [System.Drawing.Image]::FromFile($sourcePath)
  try {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.DrawImage($src, 0, 0, $size, $size)
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $images += @{ Size = $size; Data = $ms.ToArray() }
    $ms.Dispose()
    $g.Dispose()
    $bmp.Dispose()
  } finally {
    $src.Dispose()
  }
}

$count = $images.Count
$offset = 6 + 16 * $count
$outPath = Join-Path $buildDir 'icon.ico'

$stream = [System.IO.File]::Create($outPath)
$writer = New-Object System.IO.BinaryWriter($stream)
$writer.Write([UInt16]0)
$writer.Write([UInt16]1)
$writer.Write([UInt16]$count)

foreach ($img in $images) {
  $dim = if ($img.Size -ge 256) { 0 } else { $img.Size }
  $writer.Write([Byte]$dim)
  $writer.Write([Byte]$dim)
  $writer.Write([Byte]0)
  $writer.Write([Byte]0)
  $writer.Write([UInt16]1)
  $writer.Write([UInt16]32)
  $writer.Write([UInt32]$img.Data.Length)
  $writer.Write([UInt32]$offset)
  $offset += $img.Data.Length
}

foreach ($img in $images) {
  $writer.Write($img.Data)
}

$writer.Flush()
$writer.Close()
$stream.Close()

Write-Output "icon.ico created: $outPath ($count sizes)"
