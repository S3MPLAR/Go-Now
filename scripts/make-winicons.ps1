Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$assetsDir = Join-Path $root 'renderer\assets'

function Save-Icon {
  param(
    [scriptblock]$Draw,
    [string]$OutPath
  )
  $bitmap = New-Object System.Drawing.Bitmap 16, 16
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
  $graphics.Clear([System.Drawing.Color]::Transparent)
  & $Draw $graphics
  $bitmap.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $bitmap.Dispose()
}

$white = [System.Drawing.Color]::White

Save-Icon -Draw {
  param($graphics)
  $pen = New-Object System.Drawing.Pen ($white), 3
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Square
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Square
  $graphics.DrawLine($pen, 3.5, 3.5, 12.5, 12.5)
  $graphics.DrawLine($pen, 12.5, 3.5, 3.5, 12.5)
  $pen.Dispose()
} -OutPath (Join-Path $assetsDir 'win-close.png')

Save-Icon -Draw {
  param($graphics)
  $brush = New-Object System.Drawing.SolidBrush $white
  $graphics.FillRectangle($brush, 3, 11, 10, 3)
  $brush.Dispose()
} -OutPath (Join-Path $assetsDir 'win-min.png')

Save-Icon -Draw {
  param($graphics)
  $brush = New-Object System.Drawing.SolidBrush $white
  $graphics.FillRectangle($brush, 2, 2, 12, 2)
  $graphics.FillRectangle($brush, 2, 12, 12, 2)
  $graphics.FillRectangle($brush, 2, 2, 2, 12)
  $graphics.FillRectangle($brush, 12, 2, 2, 12)
  $brush.Dispose()
} -OutPath (Join-Path $assetsDir 'win-max.png')

Save-Icon -Draw {
  param($graphics)
  $brush = New-Object System.Drawing.SolidBrush $white
  $graphics.FillRectangle($brush, 5, 2, 9, 2)
  $graphics.FillRectangle($brush, 12, 2, 2, 9)
  $graphics.FillRectangle($brush, 5, 9, 9, 2)
  $graphics.FillRectangle($brush, 5, 2, 2, 9)
  $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
  $clear = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::Transparent)
  $graphics.FillRectangle($clear, 1, 4, 11, 11)
  $clear.Dispose()
  $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
  $graphics.FillRectangle($brush, 2, 5, 9, 2)
  $graphics.FillRectangle($brush, 2, 12, 9, 2)
  $graphics.FillRectangle($brush, 2, 5, 2, 9)
  $graphics.FillRectangle($brush, 9, 5, 2, 9)
  $brush.Dispose()
} -OutPath (Join-Path $assetsDir 'win-restore.png')

Save-Icon -Draw {
  param($graphics)
  $brush = New-Object System.Drawing.SolidBrush $white
  $graphics.FillRectangle($brush, 2, 13, 2, 2)
  for ($i = 0; $i -lt 8; $i++) {
    $graphics.FillRectangle($brush, 4 + $i, 11 - $i, 2, 2)
  }
  $graphics.FillRectangle($brush, 12, 2, 3, 3)
  $brush.Dispose()
} -OutPath (Join-Path $assetsDir 'edit.png')

Write-Output 'window icons created'
