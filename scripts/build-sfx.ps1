# Turns the raw CC0 clips in assets/sfx-originals into the small, evenly-loud game
# sounds in assets/sfx. Needs ffmpeg (winget install Gyan.FFmpeg).
#   powershell -File scripts/build-sfx.ps1
#
# For each clip: cut to a length that suits the game, fade the tail so it never
# clicks, bring the loudest peak to -3 dB so the sounds sit at the same level, and
# write mono 44.1 kHz MP3 at 64 kbit/s.
$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root 'assets\sfx-originals'
$out = Join-Path $root 'assets\sfx'

$ffmpeg = (Get-Command ffmpeg -ErrorAction SilentlyContinue).Source
if (-not $ffmpeg) {
  $ffmpeg = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter ffmpeg.exe -ErrorAction SilentlyContinue |
    Select-Object -First 1 -ExpandProperty FullName
}
if (-not $ffmpeg) { throw 'ffmpeg not found. Install it with: winget install Gyan.FFmpeg' }

# name -> how long to keep (seconds), how long the tail fade is
$plan = [ordered]@{
  click   = @(0.25, 0.04)
  march   = @(0.9, 0.2)
  battle  = @(0.6, 0.15)
  build   = @(0.9, 0.2)
  recruit = @(0.3, 0.1)
  crumble = @(0.7, 0.2)
  magic   = @(1.0, 0.3)
  dig     = @(0.75, 0.2)
  frenzy  = @(1.6, 0.4)
  turn    = @(0.35, 0.12)
  tick    = @(0.3, 0.08)
  win     = @(1.7, 0.4)
  lose    = @(1.8, 0.5)
}

New-Item -ItemType Directory -Force $out | Out-Null
foreach ($name in $plan.Keys) {
  $keep, $fade = $plan[$name]
  $in = Join-Path $src "$name.mp3"
  $trim = "atrim=0:$keep,afade=t=out:st=$([math]::Max(0, $keep - $fade)):d=$fade"

  # pass 1: how loud is the loudest peak of the trimmed clip?
  $probe = & $ffmpeg -hide_banner -nostats -i $in -af "$trim,volumedetect" -f null NUL 2>&1 | Out-String
  if ($probe -notmatch 'max_volume:\s*(-?[\d.]+) dB') { throw "could not measure $name" }
  $gain = -3.0 - [double]$Matches[1]

  # pass 2: apply that gain and encode
  $dest = Join-Path $out "$name.mp3"
  & $ffmpeg -hide_banner -loglevel error -y -i $in -af "$trim,volume=${gain}dB" -ac 1 -ar 44100 -c:a libmp3lame -b:a 64k $dest
  if ($LASTEXITCODE -ne 0) { throw "ffmpeg failed on $name" }
  '{0,-8} peak {1,6:N1} dB -> gain {2,5:N1} dB  {3,4} KB' -f $name, [double]$Matches[1], $gain, [math]::Round((Get-Item $dest).Length / 1KB)
}
