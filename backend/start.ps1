# Backend de interpolacao (fertilidade) - WINDOWS.
# Uso: 2 cliques em start.bat (que chama este arquivo).
#
# Este backend LOCAL atende o app (inclusive o publicado em HTTPS) quando voce liga
# "Usar interpolador desta maquina" em Configuracoes. Roda em http://127.0.0.1:8800.
#
# NADA aqui pode fechar a janela sem explicar o motivo: quem da 2 cliques nao ve
# nenhum log depois. Toda falha imprime a causa em portugues e espera ENTER.
#
# ATENCAO ao mexer: NAO use $ErrorActionPreference = "Stop". No Windows PowerShell
# 5.1 isso transforma QUALQUER linha que um programa externo escreva em stderr
# numa excecao - e o pip escreve aviso de rotina ali ("A new release of pip is
# available"). Bastava um desses para a janela fechar no meio da instalacao. O que
# diz se um programa externo falhou e o codigo de saida ($LASTEXITCODE).
$ErrorActionPreference = "Continue"

$here = $PSScriptRoot
if (-not $here) { $here = Split-Path -Parent $MyInvocation.MyCommand.Path }

# venv fora do OneDrive para nao sincronizar milhares de arquivos
$venv     = Join-Path $env:LOCALAPPDATA "invicta-fert-backend\venv"
$py       = Join-Path $venv "Scripts\python.exe"
$req      = Join-Path $here "requirements.txt"
$hashFile = Join-Path $venv ".req.hash"

function Falhar($msg, $dica) {
  Write-Host ""
  Write-Host "  X  $msg" -ForegroundColor Red
  if ($dica) { Write-Host "     $dica" -ForegroundColor Yellow }
  Write-Host ""
  Read-Host "Pressione ENTER para fechar"
  exit 1
}

# Roda um comando externo e devolve $true/$false pelo CODIGO DE SAIDA (nao pelo
# que ele escreveu em stderr).
# O 2>&1 | Write-Host e obrigatorio: sem ele, o que o pip imprime entraria no
# valor de RETORNO da funcao (em PowerShell tudo que sobra no fluxo e retornado)
# e o "if (Rodar ...)" passaria a testar um texto qualquer em vez do sucesso.
function Rodar([string[]]$argumentos) {
  & $py @argumentos 2>&1 | ForEach-Object { Write-Host $_ }
  return ($LASTEXITCODE -eq 0)
}

try {

# A pasta extraida tem de ser uma pasta de verdade. Dar 2 cliques no start.bat
# de DENTRO do .zip faz o Windows extrair uma copia temporaria, onde o venv ate
# sobe mas os .py somem no meio do caminho.
if ($here -match '\\AppData\\Local\\Temp\\.*\.zip' -or $here -match 'Temp\\[0-9a-zA-Z]*\.zip') {
  Falhar "Voce esta rodando de dentro do .zip (pasta temporaria do Windows)." `
         "Clique com o botao direito no .zip -> 'Extrair tudo' e rode o start.bat da pasta extraida."
}
if (-not (Test-Path $req)) {
  Falhar "Nao achei o requirements.txt ao lado deste script." `
         "Descompacte o .zip inteiro e rode o start.bat de dentro da pasta extraida."
}

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

# -- 1) Ambiente Python (so na primeira vez) ---------------------------------
if (-not (Test-Path $py)) {
  # acha um Python para criar o ambiente: tenta o launcher 'py', depois 'python'
  $base = $null
  if (Get-Command py -ErrorAction SilentlyContinue)          { $base = 'py' }
  elseif (Get-Command python -ErrorAction SilentlyContinue)  { $base = 'python' }
  if (-not $base) {
    Falhar "Python 3 nao encontrado no PATH." `
           "Instale em https://python.org/downloads e MARQUE 'Add python.exe to PATH' na primeira tela. Depois rode de novo."
  }

  Write-Host "Criando ambiente Python em $venv (primeira vez, ~2-4 min)..." -ForegroundColor Cyan
  if ($base -eq 'py') { & py -3 -m venv $venv } else { & python -m venv $venv }
  if (-not (Test-Path $py)) {
    Falhar "Falha ao criar o ambiente Python em $venv." `
           "Verifique se sobrou espaco em disco e se o antivirus nao bloqueou a pasta."
  }
  Rodar @('-m', 'pip', 'install', '--upgrade', 'pip') | Out-Null   # falha aqui nao e fatal
}

# -- 2) Bibliotecas: reinstala quando o requirements.txt MUDA ----------------
# ERA AQUI O DEFEITO: o pip install so rodava JUNTO COM A CRIACAO do ambiente.
# Quem ja tinha o ambiente e baixava o pacote novo atualizava os .py e continuava
# com as bibliotecas velhas - uma biblioteca nova no requirements derrubava o
# backend, e a "atualizacao" era justamente o que quebrava. (O Mac ja fazia assim.)
$reqHash = (Get-FileHash -Path $req -Algorithm SHA256).Hash
$hashAtual = ""
if (Test-Path $hashFile) { $hashAtual = (Get-Content $hashFile -Raw -ErrorAction SilentlyContinue).Trim() }

if ($hashAtual -ne $reqHash) {
  Write-Host "Instalando/atualizando bibliotecas (numpy, scipy, pykrige, shapely, rasterio...)..." -ForegroundColor Cyan
  Write-Host "(avisos amarelos do pip sao normais)" -ForegroundColor DarkGray
  if (Rodar @('-m', 'pip', 'install', '-r', $req)) {
    Set-Content -Path $hashFile -Value $reqHash -Encoding ASCII
  } else {
    Falhar "Falha ao instalar as bibliotecas (pip)." `
           "Confira sua internet/proxy e rode de novo. O erro do pip esta logo acima."
  }
}

# -- 3) Sanidade: as libs essenciais importam? Se nao, repara ----------------
& $py -c "import uvicorn, fastapi, pykrige, numpy, scipy, shapely, rasterio" 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Reparando o ambiente (bibliotecas faltando)..." -ForegroundColor Yellow
  if (Rodar @('-m', 'pip', 'install', '-r', $req)) {
    Set-Content -Path $hashFile -Value $reqHash -Encoding ASCII
  } else {
    Falhar "Nao consegui reparar o ambiente Python." `
           "Apague a pasta $venv e rode o start.bat de novo para instalar do zero."
  }
}

Set-Location $here

# -- 4) O backend CARREGA? (antes de subir o servidor) ----------------------
# Se um .py do pacote faltar (foi o caso do divisas.py), o uvicorn morre em 1
# segundo cuspindo um traceback que a janela leva embora. Testar aqui deixa a
# mensagem em portugues e diz o que fazer.
$carga = & $py -c "import app" 2>&1
if ($LASTEXITCODE -ne 0) {
  $texto = ($carga | Out-String)
  Write-Host ""
  Write-Host "  X  O interpolador nao conseguiu carregar." -ForegroundColor Red
  if ($texto -match "No module named '([A-Za-z0-9_]+)'") {
    $modulo = $Matches[1]
    Write-Host "     Esta faltando o arquivo '$modulo.py' nesta pasta." -ForegroundColor Yellow
    Write-Host "     Baixe o interpolador de novo em Configuracoes e descompacte por cima desta pasta." -ForegroundColor Yellow
  } else {
    Write-Host "     Baixe o interpolador de novo em Configuracoes e descompacte por cima desta pasta." -ForegroundColor Yellow
  }
  Write-Host ""
  Write-Host "     Detalhe tecnico:" -ForegroundColor DarkGray
  Write-Host $texto -ForegroundColor DarkGray
  Read-Host "Pressione ENTER para fechar"
  exit 1
}

# -- 5) No ar ----------------------------------------------------------------
Write-Host ""
Write-Host "==================================================================" -ForegroundColor Green
Write-Host " INVICTA - Interpolador local no ar em:  http://127.0.0.1:8800" -ForegroundColor Green
Write-Host " Deixe esta janela ABERTA enquanto usa o app. Ctrl+C para parar." -ForegroundColor Green
Write-Host " No app: Configuracoes > marque 'Usar interpolador desta maquina'." -ForegroundColor Green
Write-Host ""
Write-Host " Pode processar NDVI, MDE e interpolacoes em sequencia sem reabrir:" -ForegroundColor Gray
Write-Host " os processos se renovam sozinhos para a memoria nao acumular." -ForegroundColor Gray
Write-Host "==================================================================" -ForegroundColor Green
Write-Host ""

# Rasters incham e fragmentam a memoria do processo: um worker de vida longa vai
# para swap e o backend fica tao lento que parece travado - era por isso que so
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
$saida = $LASTEXITCODE

# Ctrl+C do usuario nao e erro; qualquer outra saida precisa ser lida.
if ($saida -ne 0 -and $saida -ne $null) {
  Write-Host ""
  Write-Host "  O interpolador encerrou (codigo $saida)." -ForegroundColor Yellow
  Write-Host "  Se voce nao pediu para parar, o motivo esta nas linhas acima." -ForegroundColor Yellow
  Read-Host "Pressione ENTER para fechar"
}

} catch {
  # Rede de seguranca: qualquer erro inesperado do proprio script aparece aqui
  # em vez de fechar a janela em branco.
  Write-Host ""
  Write-Host "  X  Erro inesperado no start.ps1:" -ForegroundColor Red
  Write-Host "     $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "     $($_.ScriptStackTrace)" -ForegroundColor DarkGray
  Write-Host ""
  Read-Host "Pressione ENTER para fechar"
  exit 1
}
