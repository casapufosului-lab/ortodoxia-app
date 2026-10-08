# Generează materialele grafice cerute de Google Play, FĂRĂ dependințe (doar .NET/System.Drawing).
#
#   pwsh -File scripts/make-store-assets.ps1
#
# Ce produce, în `assets/store/`:
#   1. `play-icon-512.png`        — iconița de magazin (512×512, PNG, fără transparență, ≤1 MB)
#   2. `play-feature-1024x500.png` — grafica de prezentare (1024×500, PNG, fără transparență)
#
# Google Play cere exact aceste două fișiere la crearea listării; restul (descrieri, capturi de ecran)
# sunt în `docs/STORE_SUBMISSION_KIT.md`. Iconița aplicației (`assets/images/icon.png`) NU se încarcă
# ca atare: are 1024×1024 și 2,3 MB, peste ce acceptă magazinul.

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root 'assets\store'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$sourceIcon = Join-Path $root 'assets\images\icon.png'

function Get-FontFamily($names) {
  foreach ($name in $names) {
    try { return New-Object System.Drawing.FontFamily $name } catch { }
  }
  return New-Object System.Drawing.FontFamily ([System.Drawing.FontFamily]::GenericSerif)
}

# ── 1. iconița de magazin 512×512 ──────────────────────────────────────────────
$icon = [System.Drawing.Image]::FromFile($sourceIcon)
$iconCanvas = New-Object System.Drawing.Bitmap 512, 512
$iconGraphics = [System.Drawing.Graphics]::FromImage($iconCanvas)
$iconGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$iconGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$iconGraphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
# Fundal alb: Play refuză transparența la iconiță.
$iconGraphics.Clear([System.Drawing.Color]::White)
$iconGraphics.DrawImage($icon, 0, 0, 512, 512)
$iconGraphics.Dispose()
$iconTarget = Join-Path $outDir 'play-icon-512.png'
$iconCanvas.Save($iconTarget, [System.Drawing.Imaging.ImageFormat]::Png)
$iconCanvas.Dispose()
$icon.Dispose()

# ── 2. grafica de prezentare 1024×500 ─────────────────────────────────────────
$width = 1024; $height = 500
# Play cere grafica de prezentare ca JPEG sau PNG de 24 de biți, FĂRĂ canal alpha. Un Bitmap implicit
# iese pe 32bppArgb (are canal alpha chiar dacă pixelii sunt opaci), deci se cere explicit 24bppRgb.
$feature = New-Object System.Drawing.Bitmap $width, $height, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$graphics = [System.Drawing.Graphics]::FromImage($feature)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

$background = New-Object System.Drawing.Drawing2D.LinearGradientBrush (
  (New-Object System.Drawing.Rectangle 0, 0, $width, $height),
  [System.Drawing.ColorTranslator]::FromHtml('#fdfbf5'),
  [System.Drawing.ColorTranslator]::FromHtml('#e6f0fa'),
  [System.Drawing.Drawing2D.LinearGradientMode]::Vertical)
$graphics.FillRectangle($background, 0, 0, $width, $height)

$gold = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#d9b45a'))
$blue = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#1663a4'))
$graphics.FillRectangle($gold, 0, ($height - 8), $width, 8)
$graphics.FillRectangle($blue, 0, 0, $width, 5)

$logo = [System.Drawing.Image]::FromFile($sourceIcon)
$graphics.DrawImage($logo, 70, 120, 260, 260)

$serif = Get-FontFamily @('Georgia', 'Times New Roman')
$titleFont = New-Object System.Drawing.Font $serif, 74, ([System.Drawing.FontStyle]::Bold)
$subtitleFont = New-Object System.Drawing.Font $serif, 32
$footerFont = New-Object System.Drawing.Font $serif, 22

$ink = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#123a5c'))
$accent = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#2c6ea8'))
$muted = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#4a5568'))

$graphics.DrawString('Ortodoxia', $titleFont, $ink, 370, 120)
$graphics.DrawString('Credința aproape în fiecare zi', $subtitleFont, $accent, 372, 220)
# Textul se scurtează/își ia marjă: la 1024 px, un rând mai lung ajunge lipit de marginea dreaptă.
$footerFont = New-Object System.Drawing.Font $serif, 21
$graphics.DrawString('Rugăciuni · calendar ortodox · mesajul zilei', $footerFont, $muted, 372, 278)
$graphics.DrawString('Biblia · slujbe live · asistent AI', $footerFont, $muted, 372, 312)

$graphics.Dispose()
$featureTarget = Join-Path $outDir 'play-feature-1024x500.png'
$feature.Save($featureTarget, [System.Drawing.Imaging.ImageFormat]::Png)
$feature.Dispose()
$logo.Dispose()

foreach ($file in @($iconTarget, $featureTarget)) {
  $item = Get-Item $file
  $image = [System.Drawing.Image]::FromFile($item.FullName)
  "{0,-26} {1}x{2} · {3} KB" -f $item.Name, $image.Width, $image.Height, [math]::Round($item.Length / 1KB)
  $image.Dispose()
}
