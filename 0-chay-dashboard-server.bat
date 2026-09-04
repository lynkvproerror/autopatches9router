@echo off
chcp 65001 >nul
title 🌐 9Router Web Dashboard Server (Port 20128)
cd /d "D:\Music\Ruby\Produce for Customer\Tools\9router-patches\automation\work\dashboard-stage\releases\0.5.59-20260902-074106-83aec8e4\app"
set NINE_ROUTER_DASHBOARD_APP_ROOT=D:\Music\Ruby\Produce for Customer\Tools\9router-patches\automation\work\dashboard-stage\releases\0.5.59-20260902-074106-83aec8e4\app
set PORT=20128
set HOSTNAME=127.0.0.1
echo =======================================================================
echo  🌐 9Router Dashboard Staging Server - http://localhost:20128
echo =======================================================================
node "D:\Music\Ruby\Produce for Customer\Tools\9router-patches\automation\dashboard-staging-server.js"
pause
