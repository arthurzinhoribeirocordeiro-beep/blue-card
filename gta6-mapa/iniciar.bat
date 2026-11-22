@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul || (echo Instale o Node.js primeiro: https://nodejs.org  && pause && exit /b)
if not exist node_modules (echo Instalando, so na primeira vez... && call npm install)
call npm start
pause
