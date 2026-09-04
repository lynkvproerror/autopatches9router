@echo off
chcp 65001 >nul
title 🔴 9Router - Fix tài khoản Lỗi Token Revoked
cd /d "D:\Music\Ruby\Produce for Customer\Tools\9router-patches"
echo =======================================================================
echo  🔴 9Router - Fix tài khoản Lỗi Token Revoked
echo =======================================================================
node auto-login-all-chrome-sso.mjs --revoked
echo.
echo =======================================================================
echo  🏁 Tiến trình đã hoàn tất. Nhấn phím bất kỳ để đóng cửa sổ.
echo =======================================================================
pause >nul
