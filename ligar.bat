@echo off
chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion

title Orbyshox - Iniciando sistema

set "ROOT=%~dp0"
cd /d "%ROOT%"

echo.
echo ============================================================
echo    ORBYSHOX - Subindo API + Painel Web
echo ============================================================
echo.

REM ---------- 0. Elevar para Administrador (necessario p/ firewall) ----------
REM Sem privilegio de administrador o Windows nao libera as portas 3001/5173
REM para acesso via Radmin VPN / rede local, e outro dispositivo nao consegue
REM abrir o painel. Auto-elevamos uma unica vez.
net session >nul 2>&1
if errorlevel 1 (
  echo [INFO] Solicitando permissao de Administrador ^(para liberar o firewall^)...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs" >nul 2>&1
  if errorlevel 1 (
    echo [AVISO] Nao foi possivel elevar. O sistema sobe mesmo assim, mas o
    echo         acesso pelo Radmin VPN pode ser bloqueado pelo firewall.
    echo.
    timeout /t 3 /nobreak >nul
  ) else (
    exit /b 0
  )
) else (
  echo [OK] Executando como Administrador
)

REM ---------- 1. Pre-requisitos ----------
where node >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Node.js nao encontrado no PATH.
  echo        Instale em https://nodejs.org e rode de novo.
  goto :fim
)

where pnpm >nul 2>&1
if errorlevel 1 (
  echo [ERRO] pnpm nao encontrado no PATH.
  echo        Instale com:  npm install -g pnpm
  goto :fim
)

for /f "tokens=*" %%v in ('node -v') do echo [OK] Node %%v
for /f "tokens=*" %%v in ('pnpm -v') do echo [OK] pnpm %%v

REM ---------- 2. Liberar portas no firewall ----------
echo.
echo [1/5] Liberando portas 3001 ^(API^) e 5173 ^(Web^) no firewall...
for %%P in (3001 5173) do (
  netsh advfirewall firewall delete rule name="Orbyshox Porta %%P" >nul 2>&1
  netsh advfirewall firewall add rule name="Orbyshox Porta %%P" dir=in action=allow protocol=TCP localport=%%P profile=any >nul 2>&1
  if errorlevel 1 (
    echo     [AVISO] Nao foi possivel liberar a porta %%P.
  ) else (
    echo     Porta %%P liberada
  )
)

REM ---------- 3. Dependencias ----------
if not exist "%ROOT%node_modules" (
  echo.
  echo [2/5] Instalando dependencias ^(primeira vez, pode demorar^)...
  call pnpm install
  if errorlevel 1 (
    echo [ERRO] Falha no pnpm install.
    goto :fim
  )
) else (
  echo.
  echo [2/5] Dependencias ja instaladas
)

REM ---------- 4. Banco ----------
if not exist "%ROOT%packages\database\prisma\dev.db" (
  echo.
  echo [3/5] Banco nao encontrado. Criando estrutura e dados iniciais...
  call pnpm db:generate
  call pnpm db:migrate
  call pnpm db:seed
) else (
  echo [3/5] Banco de dados encontrado
)

REM ---------- 5. Liberar portas ocupadas ----------
echo.
echo [4/5] Verificando portas 3001 ^(API^) e 5173 ^(Web^)...

for %%P in (3001 5173) do (
  for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%%P " ^| findstr "LISTENING" 2^>nul') do (
    if not "%%a"=="0" (
      echo     Porta %%P ocupada pelo PID %%a - encerrando...
      taskkill /F /PID %%a >nul 2>&1
    )
  )
)
echo     Portas livres.

REM Descobre o IP do Radmin VPN (faixa 26.x.x.x) para exibir o endereco certo.
set "RADMIN_IP="
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /R /C:"IPv4.*26\." 2^>nul') do (
  set "TMP_IP=%%a"
  set "TMP_IP=!TMP_IP: =!"
  set "RADMIN_IP=!TMP_IP!"
)

REM ---------- 6. Subir servicos ----------
echo.
echo [5/5] Iniciando servicos em janelas separadas...
echo.

start "Orbyshox - API (3001)" cmd /k "cd /d "%ROOT%apps\api" && set REDIS_HOST=disabled && pnpm dev"
timeout /t 3 /nobreak >nul

start "Orbyshox - Web (5173)" cmd /k "cd /d "%ROOT%apps\web" && pnpm dev"

REM ---------- 7. Aguardar a API responder ----------
echo.
echo Aguardando a API ficar pronta...
set "API_OK="
for /l %%i in (1,1,30) do (
  if not defined API_OK (
    curl -s -m 2 -o nul "http://localhost:3001/api/v1/tenant-app/bali-jack/public-info" >nul 2>&1
    if not errorlevel 1 (
      set "API_OK=1"
    ) else (
      timeout /t 2 /nobreak >nul
    )
  )
)

echo.
if defined API_OK (
  echo ============================================================
  echo    TUDO NO AR
  echo ------------------------------------------------------------
  echo    Neste PC:
  echo      Painel Web .... http://localhost:5173
  echo      API ........... http://localhost:3001/api/v1
  echo      Documentacao .. http://localhost:3001/api/docs
  echo.
  if defined RADMIN_IP (
    echo    Pela rede / Radmin VPN:
    echo      Painel Web .... http://!RADMIN_IP!:5173
    echo      API ........... http://!RADMIN_IP!:3001/api/v1
  ) else (
    echo    Pela rede / Radmin VPN:
    echo      Painel Web .... http://SEU_IP_RADMIN:5173   ^(use HTTP, nao HTTPS^)
  )
  echo ------------------------------------------------------------
  echo    Login Super Admin:
  echo      Telefone: 9182413394
  echo      Senha ...: admin123456
  echo ------------------------------------------------------------
  echo    Para parar tudo, rode: parar.bat
  echo ============================================================
  echo.
  start "" "http://localhost:5173"
) else (
  echo [AVISO] A API ainda nao respondeu. Verifique a janela "Orbyshox - API".
  echo         Ela costuma levar alguns segundos a mais na primeira vez.
)

:fim
echo.
echo Pressione qualquer tecla para fechar esta janela.
pause >nul
endlocal
