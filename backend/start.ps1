$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
# venv fora do OneDrive para nao sincronizar milhares de arquivos
$venv = Join-Path $env:LOCALAPPDATA "invicta-fert-backend\venv"
$py = Join-Path $venv "Scripts\python.exe"

if (-not (Test-Path $py)) {
  Write-Host "Criando ambiente Python em $venv ..." -ForegroundColor Cyan
  py -3 -m venv $venv
  & $py -m pip install --upgrade pip
  & $py -m pip install -r (Join-Path $here "requirements.txt")
}

Write-Host "Backend de fertilidade em http://127.0.0.1:8000  (Ctrl+C para parar)" -ForegroundColor Green
Set-Location $here
& $py -m uvicorn app:app --host 127.0.0.1 --port 8000
