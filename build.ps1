# Blocos 3: desenha os ícones (o mesmo desenho de app\logo.svg) e compila dist\Blocos3.exe.
# Usa apenas o que já vem no Windows: System.Drawing e o compilador C# do .NET Framework.
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$app = Join-Path $root 'app'
$dist = Join-Path $root 'dist'
$icons = Join-Path $app 'icons'
New-Item -ItemType Directory -Force $dist, $icons | Out-Null
Add-Type -AssemblyName System.Drawing

# --- Ícones: três peças empilhadas sobre fundo escuro, em coordenadas de 64 x 64 ---
function Add-Round($g, [string]$color, [double]$x, [double]$y, [double]$w, [double]$h, [double]$r, [double]$k, [double]$o) {
    $d = [single](2 * $r * $k)
    $x = [single]($x * $k + $o); $y = [single]($y * $k + $o); $w = [single]($w * $k); $h = [single]($h * $k)
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    if ($d -le 0) { $p.AddRectangle((New-Object System.Drawing.RectangleF $x, $y, $w, $h)) }
    else {
        $p.AddArc($x, $y, $d, $d, 180, 90); $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
        $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90); $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90); $p.CloseFigure()
    }
    $b = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($color))
    $g.FillPath($b, $p); $b.Dispose(); $p.Dispose()
}
# $scale encolhe o desenho (ícone "maskable" precisa de margem); $round arredonda o fundo
function New-Icon([int]$size, [double]$scale, [bool]$round) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'; $g.PixelOffsetMode = 'HighQuality'
    $g.Clear([System.Drawing.Color]::Transparent)
    $u = $size / 64.0
    Add-Round $g '#0E6B4E' 0 0 64 64 $(if ($round) { 14 } else { 0 }) $u 0
    $k = $u * $scale; $o = $size * (1 - $scale) / 2
    Add-Round $g '#2D7DD2' 12 41 40 11 2.5 $k $o
    foreach ($x in 16, 28.5, 41) { Add-Round $g '#2D7DD2' $x 38 7 4 1.2 $k $o }
    Add-Round $g '#E8B81F' 12 27 26 11 2.5 $k $o
    foreach ($x in 16, 28) { Add-Round $g '#E8B81F' $x 24 7 4 1.2 $k $o }
    Add-Round $g '#E0483C' 25 13 27 11 2.5 $k $o
    foreach ($x in 29, 41) { Add-Round $g '#E0483C' $x 10 7 4 1.2 $k $o }
    $g.Dispose()
    return $bmp
}
function Save-Png($bmp, $path) { $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose() }
Save-Png (New-Icon 192 1.0 $true) (Join-Path $icons 'icon-192.png')
Save-Png (New-Icon 512 1.0 $true) (Join-Path $icons 'icon-512.png')
Save-Png (New-Icon 512 0.72 $false) (Join-Path $icons 'maskable-512.png')

# .ico com várias medidas (entradas em PNG)
$ico = Join-Path $root 'desktop\blocos.ico'
$sizes = 16, 24, 32, 48, 64, 256
$pngs = foreach ($s in $sizes) { $ms = New-Object System.IO.MemoryStream; $b = New-Icon $s 1.0 $true; $b.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png); $b.Dispose(); , $ms.ToArray() }
$ms = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter $ms
$bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
    $bw.Write([byte]($sizes[$i] % 256)); $bw.Write([byte]($sizes[$i] % 256)); $bw.Write([byte]0); $bw.Write([byte]0)
    $bw.Write([uint16]1); $bw.Write([uint16]32); $bw.Write([uint32]$pngs[$i].Length); $bw.Write([uint32]$offset)
    $offset += $pngs[$i].Length
}
foreach ($p in $pngs) { $bw.Write($p) }
[System.IO.File]::WriteAllBytes($ico, $ms.ToArray())

# --- Blocos3.exe: a pasta app\ inteira vai embutida como recurso ---
$csc = "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
$res = Get-ChildItem $app -Recurse -File | ForEach-Object { "/resource:`"$($_.FullName)`",app/$($_.FullName.Substring($app.Length + 1) -replace '\\','/')" }
& $csc /nologo /target:winexe /optimize+ /codepage:65001 "/out:$dist\Blocos3.exe" "/win32icon:$ico" /reference:System.Windows.Forms.dll $res (Join-Path $root 'desktop\Blocos3.cs')
if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar Blocos3.exe' }

Get-ChildItem $dist | Select-Object Name, Length
