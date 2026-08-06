$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

# venv fora do OneDrive para nao sincronizar milhares de arquivos
$venv = Join-Path $env:LOCALAPPDATA "invicta-fert-backend\venv"

# Mata qualquer backend ANTIGO preso. No Windows, fechar a janela nem sempre
# encerra o uvicorn -> ele continua VIVO com o codigo antigo (mesmo sem segurar a
# porta, um orfao reassume a 8800 e parece que "nada mudou" / rotas novas dao 404).
# Matamos (1) quem escuta a 8800 e (2) qualquer python do venv do backend.
try {
  Get-NetTCPConnection -LocalPort 8800 -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
  Get-Process python, pythonw -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -and $_.Path.StartsWith($venv, [System.StringComparison]::OrdinalIgnoreCase) } |
    ForEach-Object {
      Write-Host "Encerrando backend antigo (PID $($_.Id))..." -ForegroundColor DarkYellow
      Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
  Start-Sleep -Milliseconds 600
} catch {}

$py = Join-Path $venv "Scripts\python.exe"

if (-not (Test-Path $py)) {
  # acha um Python para criar o ambiente: tenta o launcher 'py', depois 'python'
  $base = $null
  if (Get-Command py -ErrorAction SilentlyContinue)          { $base = 'py' }
  elseif (Get-Command python -ErrorAction SilentlyContinue)  { $base = 'python' }
  if (-not $base) {
    Write-Host "Python 3 nao encontrado no PATH." -ForegroundColor Red
    Write-Host "Instale em https://python.org (marque 'Add python.exe to PATH') e rode de novo." -ForegroundColor Yellow
    Read-Host "Enter para sair"; exit 1
  }

  Write-Host "Criando ambiente Python em $venv (primeira vez, ~2-4 min)..." -ForegroundColor Cyan
  if ($base -eq 'py') { & py -3 -m venv $venv } else { & python -m venv $venv }
  if (-not (Test-Path $py)) {
    Write-Host "Falha ao criar o ambiente Python." -ForegroundColor Red
    Read-Host "Enter para sair"; exit 1
  }
  & $py -m pip install --upgrade pip
  & $py -m pip install -r (Join-Path $here "requirements.txt")
}

Write-Host "Backend de fertilidade em http://127.0.0.1:8800  (Ctrl+C para parar)" -ForegroundColor Green
Write-Host ""
Write-Host " Pode processar NDVI, MDE e interpolacoes em sequencia sem reabrir:" -ForegroundColor Gray
Write-Host " os processos se renovam sozinhos para a memoria nao acumular." -ForegroundColor Gray
Write-Host ""
Set-Location $here

# Rasters incham e fragmentam a memoria do processo: um worker de vida longa vai
# para swap e o backend fica tao lento que parece travado — era por isso que so
# fechando a janela voltava ao normal. Na nuvem e no macOS quem resolve e o
# gunicorn (--max-requests), mas o gunicorn NAO roda no Windows.
#
# Aqui a reciclagem vem do proprio app (RECICLAR_APOS, em app.py): passado o
# limite, o worker se aposenta OCIOSO e o supervisor do uvicorn sobe outro no
# lugar. Por isso --workers 2: enquanto um renasce, o outro segue atendendo.
# Use $env:WORKERS = "1" antes de rodar se a maquina for apertada de RAM
# (~300 MB por worker sob carga).
if (-not $env:WORKERS)         { $env:WORKERS = "2" }
if (-not $env:RECICLAR_APOS)   { $env:RECICLAR_APOS = "100" }
if (-not $env:RECICLAR_JITTER) { $env:RECICLAR_JITTER = "25" }

& $py -m uvicorn app:app --host 127.0.0.1 --port 8800 --workers $env:WORKERS
