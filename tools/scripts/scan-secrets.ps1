# Quick-and-dirty secret scanner (local only)
# Usage: Run from repo root in PowerShell
#   powershell -ExecutionPolicy Bypass -File .\tools\scripts\scan-secrets.ps1

$patterns = @(
  'AIza[0-9A-Za-z\-_]{35}',        # Google API key prefix patterns
  'GEMINI_API_KEY\s*=\s*.+',      # Env entries in files
  'GOOGLE_GENAI_API_KEY\s*=\s*.+',
  'AWS_SECRET_ACCESS_KEY\s*=\s*.+',
  '-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----',
  'smtp\.[^\s]+\s*:\s*\d+',
  'SECRET_KEY\s*=\s*.+',
  'NEXT_PUBLIC_FIREBASE_API_KEY\s*=\s*AIza[0-9A-Za-z\-_]{35}'
)

$exclude = @(
  '.git', 'node_modules', '.next', 'dist', 'build', '.venv', '__pycache__', 'uploads', 'frontend/public/uploads'
)

Write-Host "Scanning for potential secrets..." -ForegroundColor Cyan

Get-ChildItem -Recurse -File | Where-Object {
  $rel = $_.FullName.Replace((Get-Location).Path + '\\','')
  foreach ($e in $exclude) { if ($rel -like "*$e*") { return $false } }
  return $true
} | ForEach-Object {
  $path = $_.FullName
  $content = Get-Content -Raw -ErrorAction SilentlyContinue $path
  if (-not $content) { return }
  foreach ($p in $patterns) {
    $matches = [regex]::Matches($content, $p)
    if ($matches.Count -gt 0) {
      $lines = $content -split "`n"
      for ($i = 0; $i -lt $lines.Length; $i++) {
        if ($lines[$i] -match $p) {
          Write-Host "[POSSIBLE SECRET] $path:$($i+1) -> $($lines[$i].Trim())" -ForegroundColor Yellow
        }
      }
    }
  }
}

Write-Host "Scan complete." -ForegroundColor Green
