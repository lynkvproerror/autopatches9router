@echo off
chcp 65001 >nul
title 🌐 9Router - Nạp Gmail Chrome SSO (Bỏ qua Gmail đã Live)
cd /d "D:\Music\Ruby\Produce for Customer\Tools\9router-patches"
echo =======================================================================
echo  🌐 9Router - Nạp Gmail Chrome SSO (Bỏ qua Gmail đã Live)
echo =======================================================================
node auto-login-all-chrome-sso.mjs --gmail
echo.
echo =======================================================================
echo  🏁 Tiến trình đã hoàn tất. Nhấn phím bất kỳ để đóng cửa sổ.
echo =======================================================================
pause >nul
