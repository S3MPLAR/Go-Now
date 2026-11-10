Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$assetsDir = Join-Path $root 'renderer\assets'
$outPath = Join-Path $assetsDir 'check.png'

$bitmap = New-Object System.Drawing.Bitmap 16, 16
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
$graphics.Clear([System.Drawing.Color]::Transparent)

$pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), 3
$pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Square
$pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Square
$pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Miter
$points = @(
  (New-Object System.Drawing.PointF 3.5, 8.5),
  (New-Object System.Drawing.PointF 6.5, 11.5),
  (New-Object System.Drawing.PointF 12.5, 4.5)
)
$graphics.DrawLines($pen, [System.Drawing.PointF[]]$points)

$bitmap.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$pen.Dispose()
$graphics.Dispose()
$bitmap.Dispose()
Write-Output 'check icon created'
