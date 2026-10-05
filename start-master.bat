@echo off
title Kitty Master Bot
color 0A

echo ========================================
echo   KITTY MASTER - Avtomatik ishga tushish
echo ========================================

:: Eski cloudflared processni to'xtatish
taskkill /f /im cloudflared.exe >nul 2>&1
timeout /t 2 >nul

:: Log faylini tozalash
if exist C:\cloudflared\tunnel.log del C:\cloudflared\tunnel.log

:: Cloudflared'ni fonda ishga tushirish
echo [1/4] Cloudflared tunnel ishga tushmoqda...
start /b C:\cloudflared\cloudflared.exe tunnel --protocol http2 --url http://localhost:3000 > C:\cloudflared\tunnel.log 2>&1

:: URL chiqishini kutish
echo [2/4] URL kutilmoqda...
timeout /t 8 >nul

:: URL ni log'dan olish
echo [3/4] URL olinmoqda...
set TUNNEL_URL=
for /f "delims=" %%a in ('powershell -command "Select-String -Path C:\cloudflared\tunnel.log -Pattern 'https://\S+\.trycloudflare\.com' | ForEach-Object { $_.Matches[0].Value } | Select-Object -First 1"') do set TUNNEL_URL=%%a

if "%TUNNEL_URL%"=="" (
    echo [!] Yana 8 sekund kutilmoqda...
    timeout /t 8 >nul
    for /f "delims=" %%a in ('powershell -command "Select-String -Path C:\cloudflared\tunnel.log -Pattern 'https://\S+\.trycloudflare\.com' | ForEach-Object { $_.Matches[0].Value } | Select-Object -First 1"') do set TUNNEL_URL=%%a
)

if "%TUNNEL_URL%"=="" (
    echo.
    echo [DEBUG] tunnel.log ichidagi matn:
    type C:\cloudflared\tunnel.log
    echo.
    echo [XATO] URL topilmadi!
    pause
    exit
)

echo [OK] URL: %TUNNEL_URL%

:: .env faylini yangilash
echo [4/4] .env yangilanmoqda...
powershell -command "(Get-Content '.env') -replace 'WEBHOOK_URL=.*', 'WEBHOOK_URL=%TUNNEL_URL%' | Set-Content '.env'"

echo.
echo ========================================
echo   Master URL: %TUNNEL_URL%
echo   Bot ishga tushmoqda...
echo ========================================
echo.

node index.js
