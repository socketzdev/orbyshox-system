@echo off
chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion

title Orbyshox - Parando sistema

echo.
echo ============================================================
echo    ORBYSHOX - Parando API e Painel Web
echo ============================================================
echo.

REM Fecha as janelas abertas pelo ligar.bat (pelo titulo)
taskkill /F /FI "WINDOWTITLE eq Orbyshox - API*" >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq Orbyshox - Web*" >nul 2>&1

REM Encerra quem estiver ouvindo nas portas do sistema.
REM O netstat e chamado em arquivo temporario: evita o escape fragil de pipe
REM dentro do for /f, que falhava silenciosamente e deixava os servicos no ar.
set "TMPF=%TEMP%\orbyshox_ports.txt"
netstat -ano > "%TMPF%" 2>nul

for %%P in (3001 5173) do (
  for /f "tokens=5" %%a in ('findstr /R /C:":%%P " "%TMPF%" ^| findstr /C:"LISTENING"') do (
    if not "%%a"=="0" (
      echo    Porta %%P - encerrando PID %%a
      taskkill /F /PID %%a >nul 2>&1
    )
  )
)

del "%TMPF%" >nul 2>&1

echo.
echo Verificando...
set "RESTA="
for %%P in (3001 5173) do (
  netstat -ano | findstr /C:":%%P " | findstr /C:"LISTENING" >nul 2>&1
  if not errorlevel 1 set "RESTA=1"
)

if defined RESTA (
  echo [AVISO] Alguma porta ainda esta ocupada. Rode este arquivo como Administrador.
) else (
  echo [OK] API e Painel encerrados. Portas 3001 e 5173 livres.
)

echo.
echo Pressione qualquer tecla para fechar.
pause >nul
endlocal
