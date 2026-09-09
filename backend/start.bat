@echo off
rem INVICTA - Interpolador local (Windows). De 2 cliques neste arquivo.
rem
rem -NoProfile: um perfil de PowerShell do usuario com erro derrubava o script
rem antes mesmo de ele comecar (a janela piscava e fechava).
rem -ExecutionPolicy Bypass: o .ps1 vem baixado da internet.
title INVICTA - Interpolador local
cd /d "%~dp0"

if not exist "%~dp0start.ps1" (
  echo.
  echo   X  Nao achei o start.ps1 nesta pasta.
  echo      Descompacte o .zip INTEIRO e rode o start.bat de dentro da pasta extraida.
  echo.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"
set ERR=%ERRORLEVEL%

rem Se o proprio PowerShell nao rodou (bloqueio de politica, PowerShell ausente),
rem o start.ps1 nunca chegou a imprimir nada - e a janela fecharia em branco.
if %ERR% NEQ 0 (
  echo.
  echo   O interpolador encerrou com erro (codigo %ERR%).
  echo   Se nada apareceu acima, o Windows bloqueou a execucao do script:
  echo   abra o PowerShell como Administrador e rode
  echo       Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
  echo   e depois tente de novo.
  echo.
  pause
)
