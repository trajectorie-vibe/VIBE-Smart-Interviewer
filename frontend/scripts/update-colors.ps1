#!/usr/bin/env pwsh

# Script to replace blue/purple theme with white/orange/red theme
# Run from frontend directory

Write-Host "Replacing color theme in candidate test pages..." -ForegroundColor Cyan

$files = @(
    "src/app/candidate/test/details/page.tsx",
    "src/app/candidate/test/gdpr/page.tsx",
    "src/app/candidate/test/camera-check/page.tsx",
    "src/app/candidate/test/questions/page.tsx",
    "src/app/candidate/test/complete/page.tsx"
)

$replacements = @{
    # Background gradients
    "from-blue-50 via-white to-purple-50" = "from-white via-orange-50 to-red-50"
    "from-blue-50 to-purple-50" = "from-orange-50 to-red-50"
    
    # Primary colors - blue
    "bg-blue-50" = "bg-orange-50"
    "bg-blue-100" = "bg-orange-100"
    "bg-blue-500" = "bg-orange-500"
    "bg-blue-600" = "bg-orange-600"
    "text-blue-600" = "text-orange-600"
    "text-blue-700" = "text-orange-700"
    "text-blue-800" = "text-orange-800"
    "text-blue-900" = "text-orange-900"
    "border-blue-200" = "border-orange-200"
    "border-blue-300" = "border-orange-300"
    "border-blue-400" = "border-orange-400"
    
    # Secondary colors - purple
    "bg-purple-50" = "bg-red-50"
    "bg-purple-100" = "bg-red-100"
    "bg-purple-600" = "bg-red-600"
    "text-purple-600" = "text-red-600"
    "text-purple-700" = "text-red-700"
    "text-purple-800" = "text-red-800"
    "text-purple-900" = "text-red-900"
    "border-purple-200" = "border-red-200"
    "border-purple-400" = "border-red-400"
    
    # Gradients
    "from-blue-600 to-purple-600" = "from-orange-600 to-red-600"
    "hover:from-blue-700 hover:to-purple-700" = "hover:from-orange-700 hover:to-red-700"
    "from-blue-600" = "from-orange-600"
    "to-purple-600" = "to-red-600"
    
    # Spinner colors
    "animate-spin text-blue-600" = "animate-spin text-orange-600"
}

foreach ($file in $files) {
    if (Test-Path $file) {
        Write-Host "Processing $file..." -ForegroundColor Yellow
        $content = Get-Content $file -Raw
        
        foreach ($old in $replacements.Keys) {
            $new = $replacements[$old]
            $content = $content -replace [regex]::Escape($old), $new
        }
        
        Set-Content $file -Value $content -NoNewline
        Write-Host "  ✓ Updated $file" -ForegroundColor Green
    } else {
        Write-Host "  ✗ File not found: $file" -ForegroundColor Red
    }
}

Write-Host "`nColor theme replacement complete!" -ForegroundColor Cyan
