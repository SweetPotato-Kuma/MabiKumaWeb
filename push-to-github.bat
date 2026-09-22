@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ==========================================================
echo   MabiKumaWeb  -  설치 / 검증 / GitHub 업로드
echo ==========================================================
echo.

if not exist ".github\workflows\deploy.yml" (
  echo [중단] .github\workflows\deploy.yml 이 없습니다.
  echo.
  echo   Claude 가 채팅으로 보낸 deploy.yml 과 ci.yml 을
  echo   %cd%\.github\workflows\  폴더에 먼저 넣어 주세요.
  echo   (폴더가 없으면 만드셔야 합니다)
  echo.
  pause
  exit /b 1
)

where git >nul 2>&1
if errorlevel 1 (
  echo [중단] git 이 설치되어 있지 않습니다. https://git-scm.com 에서 설치해 주세요.
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [중단] Node.js 가 설치되어 있지 않습니다. https://nodejs.org 에서 설치해 주세요.
  pause
  exit /b 1
)

echo [1/5] 의존성 설치 중... 처음에는 몇 분 걸립니다.
call npm install
if errorlevel 1 goto fail
echo.

echo [2/5] 코드 서식 정리
call npm run format
call npm run lint:fix
echo.

echo [3/5] 빌드 검증
call npm run build
if errorlevel 1 goto fail
echo.

echo [4/5] git 준비
if not exist ".git" (
  git init -b main
  if errorlevel 1 goto fail
)
git config user.name "SweetPotato-Kuma"
git config user.email "ingyer96@gmail.com"
git add -A
if errorlevel 1 goto fail
git commit -m "chore: bootstrap MabiKumaWeb with Cloudflare Worker proxy" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git branch -M main
git remote remove origin 2>nul
git remote add origin https://github.com/SweetPotato-Kuma/MabiKumaWeb.git
if errorlevel 1 goto fail
echo.

echo [5/5] GitHub 으로 업로드
echo       로그인 창이 뜨면 GitHub 계정으로 승인해 주세요.
git push -u origin main
if errorlevel 1 goto fail
echo.

echo ==========================================================
echo   완료. 배포가 자동으로 시작됩니다.
echo   https://github.com/SweetPotato-Kuma/MabiKumaWeb/actions
echo ==========================================================
echo.
pause
exit /b 0

:fail
echo.
echo ==========================================================
echo   [실패] 위에 마지막으로 나온 빨간 메시지를 복사해서
echo          Claude 에게 그대로 보내주세요.
echo ==========================================================
echo.
pause
exit /b 1
