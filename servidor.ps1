$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$port = 8768
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()

Start-Process "http://localhost:$port/"
Write-Host "Auditoria de Stock corriendo en http://localhost:$port  (cerra esta ventana para detenerlo)"

$mimeMap = @{
  ".html" = "text/html"; ".js" = "application/javascript"; ".css" = "text/css"; ".json" = "application/json"
}

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $req = $ctx.Request
  $resp = $ctx.Response
  $path = $req.Url.LocalPath.TrimStart("/")
  if ($path -eq "" -or $path -eq "/") { $path = "index.html" }
  $file = Join-Path (Get-Location) $path
  if (Test-Path $file -PathType Leaf) {
    $bytes = [System.IO.File]::ReadAllBytes($file)
    $ext = [System.IO.Path]::GetExtension($file)
    $resp.ContentType = if ($mimeMap.ContainsKey($ext)) { $mimeMap[$ext] } else { "application/octet-stream" }
    $resp.OutputStream.Write($bytes, 0, $bytes.Length)
  } else {
    $resp.StatusCode = 404
  }
  $resp.Close()
}
