# Regenerate the checked-in NSIS bitmaps on Windows. No external dependencies.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$projectDir = Split-Path $PSScriptRoot -Parent
$brandDir = Join-Path $projectDir 'build'
$logo = [System.Drawing.Image]::FromFile((Join-Path $brandDir 'icon.png'))

function Brush([string]$hex) {
    return [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml($hex))
}

function Draw-BrandText($canvas, [string]$text, [single]$size, [string]$color, [single]$x, [single]$y, [bool]$bold = $false) {
    $fontStyle = if ($bold) { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular }
    $font = [System.Drawing.Font]::new('Segoe UI', $size, $fontStyle, [System.Drawing.GraphicsUnit]::Pixel)
    $brush = Brush $color
    try { $canvas.DrawString($text, $font, $brush, $x, $y) }
    finally { $font.Dispose(); $brush.Dispose() }
}

function New-Canvas([int]$width, [int]$height) {
    $bitmap = [System.Drawing.Bitmap]::new($width, $height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $canvas = [System.Drawing.Graphics]::FromImage($bitmap)
    $canvas.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $canvas.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $canvas.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    return @{ Bitmap = $bitmap; Graphics = $canvas }
}

try {
    # The stock NSIS welcome/finish page expects a 164 x 314 sidebar.
    $sidebar = New-Canvas 164 314
    $canvas = $sidebar.Graphics
    try {
        $canvas.Clear([System.Drawing.ColorTranslator]::FromHtml('#14221e'))
        $shape = Brush '#1c3830'
        $accent = Brush '#dcaa5d'
        try {
            $canvas.FillEllipse($shape, -95, -100, 250, 250)
            $canvas.FillEllipse($shape, 55, 230, 220, 220)
            $canvas.FillRectangle($accent, 22, 35, 30, 3)
            $canvas.DrawImage($logo, 36, 70, 92, 92)
            Draw-BrandText $canvas 'VereinO' 25 '#ffffff' 31 173 $true
            Draw-BrandText $canvas 'Dein Verein.' 12 '#cbdad3' 22 215
            Draw-BrandText $canvas 'Deine Finanzen.' 12 '#cbdad3' 22 232
            Draw-BrandText $canvas 'OPEN SOURCE' 10 '#dcaa5d' 22 278 $true
            Draw-BrandText $canvas 'MIT-Lizenz' 10 '#cbdad3' 22 294
            $sidebar.Bitmap.Save((Join-Path $brandDir 'installerSidebar.bmp'), [System.Drawing.Imaging.ImageFormat]::Bmp)
        } finally { $shape.Dispose(); $accent.Dispose() }
    } finally { $canvas.Dispose(); $sidebar.Bitmap.Dispose() }

    $header = New-Canvas 150 57
    $canvas = $header.Graphics
    try {
        $canvas.Clear([System.Drawing.Color]::White)
        $canvas.DrawImage($logo, 2, 7, 42, 42)
        Draw-BrandText $canvas 'VereinO' 20 '#14221e' 49 7 $true
        Draw-BrandText $canvas ('Open Source ' + [char]0x00B7 + ' MIT') 9 '#4e645a' 50 33
        $header.Bitmap.Save((Join-Path $brandDir 'installerHeader.bmp'), [System.Drawing.Imaging.ImageFormat]::Bmp)
    } finally { $canvas.Dispose(); $header.Bitmap.Dispose() }
} finally { $logo.Dispose() }
