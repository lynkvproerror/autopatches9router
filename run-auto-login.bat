@echo off
chcp 65001 >nul
title 9Router Auto-Login Runner
cd /d "D:\Music\Ruby\Produce for Customer\Tools\9router-patches"
echo =======================================================================
echo  ⚡ 9Router - TRÌNH ĐĂNG NHẬP VÀ ĐỒNG BỘ OAUTH TOKEN TỰ ĐỘNG
echo =======================================================================
node auto-login-all-chrome-sso.mjs %*
echo.
echo =======================================================================
echo  🏁 Tiến trình đã hoàn tất. Nhấn phím bất kỳ để đóng cửa sổ.
echo =======================================================================
pause >nul
