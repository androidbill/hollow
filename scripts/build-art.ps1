# Turns the full-size originals in assets/originals into small web versions in assets/.
# Windows PowerShell / PowerShell 7 (uses System.Drawing, so no npm dependency).
#   powershell -File scripts/build-art.ps1
#
#   logo.png, crests   -> PNG   (crests are cut to a circle with transparent corners)
#   forest-bg, glade   -> JPEG
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root 'assets\originals'
$out = Join-Path $root 'assets'

function Resize([string]$file, [int]$width, [int]$height) {
  $img = [System.Drawing.Image]::FromFile($file)
  $bmp = New-Object System.Drawing.Bitmap $width, $height
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.SmoothingMode = 'HighQuality'
  $g.PixelOffsetMode = 'HighQuality'
  $g.DrawImage($img, 0, 0, $width, $height)
  $g.Dispose(); $img.Dispose()
  return $bmp
}

function SaveJpeg($bmp, [string]$path, [int]$quality) {
  $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
  $params = New-Object System.Drawing.Imaging.EncoderParameters 1
  $params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), ([int64]$quality)
  $bmp.Save($path, $codec, $params)
}

# Crests: the medallion fills most of the square on a dark ground. Cut a circle
# (inset a little so the dark corners and rim shadow go) onto transparency.
function Crest([string]$name, [int]$size, [double]$inset) {
  $bmp = Resize (Join-Path $src "crest-$name.png") $size $size
  $mask = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($mask)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([System.Drawing.Color]::Transparent)
  $pad = $size * $inset
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddEllipse($pad, $pad, $size - 2 * $pad, $size - 2 * $pad)
  $g.SetClip($path)
  $g.DrawImage($bmp, 0, 0, $size, $size)
  $g.Dispose(); $bmp.Dispose()
  $mask.Save((Join-Path $out "crest-$name.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $mask.Dispose()
}

foreach ($f in 'humans', 'orcs', 'elves', 'dwarves') { Crest $f 256 0.03 }

# Board pieces. Round ones (warriors, tokens) are cut to a circle; building tiles to a
# rounded square. Both go onto transparency, so the originals' dark ground disappears.
function Piece([string]$name, [int]$size, [string]$shape, [double]$inset) {
  $bmp = Resize (Join-Path $src "piece-$name.png") $size $size
  $mask = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($mask)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([System.Drawing.Color]::Transparent)
  $pad = $size * $inset
  $w = $size - 2 * $pad
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  if ($shape -eq 'circle') {
    $path.AddEllipse($pad, $pad, $w, $w)
  } else {
    $r = $w * 0.22
    $d = $r * 2
    $path.AddArc($pad, $pad, $d, $d, 180, 90)
    $path.AddArc($pad + $w - $d, $pad, $d, $d, 270, 90)
    $path.AddArc($pad + $w - $d, $pad + $w - $d, $d, $d, 0, 90)
    $path.AddArc($pad, $pad + $w - $d, $d, $d, 90, 90)
    $path.CloseFigure()
  }
  $g.SetClip($path)
  $g.DrawImage($bmp, 0, 0, $size, $size)
  $g.Dispose(); $bmp.Dispose()
  $mask.Save((Join-Path $out "piece-$name.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $mask.Dispose()
}

foreach ($f in 'humans', 'orcs', 'elves', 'dwarves') { Piece "warrior-$f" 112 'circle' 0.03 }
foreach ($b in 'mill', 'barracks', 'warcamp', 'stronghold-elves', 'stronghold-dwarves') { Piece $b 112 'tile' 0.04 }
foreach ($t in 'sympathy', 'tunnel') { Piece $t 80 'circle' 0.03 }

$logo = Resize (Join-Path $src 'logo.png') 1086 362
SaveJpeg $logo (Join-Path $out 'logo.jpg') 86
$logo.Dispose()

$bg = Resize (Join-Path $src 'forest-bg.png') 1280 853
SaveJpeg $bg (Join-Path $out 'forest-bg.jpg') 80
$bg.Dispose()

$glade = Resize (Join-Path $src 'glade.png') 512 512
SaveJpeg $glade (Join-Path $out 'glade.jpg') 82
$glade.Dispose()

Get-ChildItem $out -File | Select-Object Name, @{ n = 'KB'; e = { [math]::Round($_.Length / 1KB) } } | Format-Table -AutoSize
