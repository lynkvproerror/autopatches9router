@echo off
chcp 65001 >nul
title 🏢 9Router - Nạp Email Domain (Bỏ qua Domain đã Live & Tắt)
cd /d "D:\Music\Ruby\Produce for Customer\Tools\9router-patches"
echo =======================================================================
echo  🏢 9Router - Nạp Email Domain (Bỏ qua Domain đã Live & Tắt)
echo =======================================================================
node auto-login-all-chrome-sso.mjs --domain
echo.
echo =======================================================================
echo  🏁 Tiến trình đã hoàn tất. Nhấn phím bất kỳ để đóng cửa sổ.
echo =======================================================================
pause >nul
