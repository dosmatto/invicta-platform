#!/usr/bin/env bash
# Backend de interpolacao (fertilidade) — macOS / Linux.
# Uso:  duplo-clique em start.command (Finder)  ou  bash backend/start.sh
#
# Este backend LOCAL atende o app (inclusive o publicado em HTTPS) quando voce liga
# "Usar interpolador desta maquina" em Configuracoes. Roda em http://127.0.0.1:8800.
set -u

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# venv fora do repo (nao sincroniza com nuvem nem polui o projeto)
VENV="$HOME/.invicta-fert-backend/venv"
PY="$VENV/bin/python"
REQ="$HERE/requirements.txt"
HASHFILE="$VENV/.req.hash"

# Mantem a janela aberta se algo falhar (quem deu duplo-clique ve o erro).
pausar_e_sair() { echo ""; echo "Pressione ENTER para fechar."; read -r _ || true; exit 1; }

achar_python() {
  if command -v python3 >/dev/null 2>&1; then echo python3
  elif command -v python  >/dev/null 2>&1; then echo python
  else echo ""; fi
}

# 1) Cria o venv na primeira vez
if [ ! -x "$PY" ]; then
  BASE="$(achar_python)"
  if [ -z "$BASE" ]; then
    echo "Python 3 nao encontrado."
    echo "Instale com 'brew install python' (macOS) ou em https://python.org e rode de novo."
    pausar_e_sair
  fi
  echo "Criando ambiente Python em $VENV (primeira vez, ~2-4 min)..."
  "$BASE" -m venv "$VENV" || pausar_e_sair
  "$PY" -m pip install --upgrade pip || pausar_e_sair
fi

# 2) Instala/atualiza as libs quando o requirements.txt MUDA (ou na 1a vez).
req_hash="$( (shasum "$REQ" 2>/dev/null || md5 -q "$REQ" 2>/dev/null || echo x) | awk '{print $1}')"
if [ ! -f "$HASHFILE" ] || [ "$(cat "$HASHFILE" 2>/dev/null)" != "$req_hash" ]; then
  echo "Instalando/atualizando bibliotecas (numpy, scipy, pykrige, shapely, rasterio...)..."
  "$PY" -m pip install -r "$REQ" && echo "$req_hash" > "$HASHFILE" || { echo "Falha ao instalar as libs."; pausar_e_sair; }
fi

# 3) Sanidade: as libs essenciais importam? Se nao, repara.
if ! "$PY" -c "import uvicorn, fastapi, pykrige, numpy, scipy, shapely" >/dev/null 2>&1; then
  echo "Reparando o ambiente (libs faltando)..."
  "$PY" -m pip install -r "$REQ" && echo "$req_hash" > "$HASHFILE" || pausar_e_sair
fi

echo ""
echo "=================================================================="
echo " INVICTA — Interpolador local no ar em:  http://127.0.0.1:8800"
echo " Deixe esta janela ABERTA enquanto usa o app. Ctrl+C para parar."
echo " No app: Configuracoes > marque 'Usar interpolador desta maquina'."
echo "=================================================================="
echo ""
cd "$HERE"
# uvicorn simples (1 processo) basta no local — a maquina inteira e sua.
exec "$PY" -m uvicorn app:app --host 127.0.0.1 --port 8800
