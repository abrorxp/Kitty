@echo off
setlocal enabledelayedexpansion

:: Eski processlarni to'xtatish
taskkill /f /im cloudflared.exe >nul 2>&1
taskkill /f /im node.exe >nul 2>&1
timeout /t 1 >nul

:: Log faylini tozalash
if exist C:\cloudflared\tunnel.log del C:\cloudflared\tunnel.log

:: Cloudflared ishga tushirish (hech qanday oyna ochmaydi)
start /b "" C:\cloudflared\cloudflared.exe tunnel --protocol http2 --url http://localhost:3000 > C:\cloudflared\tunnel.log 2>&1

:: TEZLIK FIX: avval har 5 sekundda YANGI powershell.exe ochib tekshirardi (=doim
:: kamida 5s kutish + har chaqiruvda powershell ochilish sarfi, eng yomon holatda 60s+).
:: Endi BITTA powershell jarayoni ichida 300ms oralig'ida tekshiradi va URL paydo
:: bo'lishi bilan darhol chiqadi — odatda 2-4 soniyada topadi, maksimal 25 soniya kutadi.
set TUNNEL_URL=
for /f "delims=" %%a in ('powershell -NoProfile -ExecutionPolicy Bypass -Command "$deadline=(Get-Date).AddSeconds(25); $found=$null; while(-not $found -and (Get-Date) -lt $deadline){ if(Test-Path 'C:\cloudflared\tunnel.log'){ $m = Select-String -Path 'C:\cloudflared\tunnel.log' -Pattern 'https://\S+\.trycloudflare\.com' -AllMatches -ErrorAction SilentlyContinue | ForEach-Object { $_.Matches } | ForEach-Object { $_.Value } | Where-Object { $_ -ne 'https://api.trycloudflare.com' } | Select-Object -First 1; if($m){$found=$m} }; if(-not $found){ Start-Sleep -Milliseconds 300 } }; if($found){ Write-Output $found }"') do set TUNNEL_URL=%%a

cd C:\Kitty

if "%TUNNEL_URL%"=="" (
    :: URL topilmasa ham botni to'xtatmaymiz - eski .env'dagi URL bilan urinib ko'radi
    echo [%date% %time%] XATO: Tunnel URL topilmadi, eski .env bilan davom etilmoqda >> C:\Kitty\slave-error.log
) else (
    powershell -NoProfile -command "(Get-Content '.env') -replace 'SLAVE_PUBLIC_URL=.*', 'SLAVE_PUBLIC_URL=%TUNNEL_URL%' | Set-Content '.env'"
    echo [%date% %time%] OK: %TUNNEL_URL% >> C:\Kitty\slave-error.log
)

:: Node.js botni butunlay ko'rinmas holda, yangi oyna ochmasdan ishga tushirish
start "" /b node index.js >> C:\Kitty\slave-error.log 2>&1