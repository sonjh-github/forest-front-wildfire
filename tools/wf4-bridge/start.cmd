@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto missing_node
node -e "process.exit(process.versions.node === require('./package.json').engines.node ? 0 : 1)"
if errorlevel 1 goto missing_node
node server.cjs
set "WF4_EXIT_CODE=%errorlevel%"
pause
exit /b %WF4_EXIT_CODE%
:missing_node
echo Node.js 26.13.1 설치가 필요합니다: https://nodejs.org/en/download/archive/v26.13.1
echo 설치 후 이 창을 닫고 start.cmd를 다시 실행하세요.
pause
exit /b 1
