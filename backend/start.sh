#!/usr/bin/env bash
# Backend de interpolacao (fertilidade) — macOS / Linux.
# Uso:  bash backend/start.sh
set -e

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# venv fora do repo (nao sincroniza com nuvem nem polui o projeto)
VENV="$HOME/.invicta-fert-backend/venv"
PY="$VENV/bin/python"

if [ ! -x "$PY" ]; then
  if command -v python3 >/dev/null 2>&1; then BASE=python3
  elif command -v python  >/dev/null 2>&1; then BASE=python
  else
    echo "Python 3 nao encontrado."
    echo "Instale com 'brew install python' (macOS) ou em https://python.org e rode de novo."
    exit 1
  fi
  echo "Criando ambiente Python em $VENV (primeira vez, ~2-4 min)..."
  "$BASE" -m venv "$VENV"
  "$PY" -m pip install --upgrade pip
  "$PY" -m pip install -r "$HERE/requirements.txt"
fi

echo "Backend de fertilidade em http://127.0.0.1:8800  (Ctrl+C para parar)"
cd "$HERE"
exec "$PY" -m uvicorn app:app --host 127.0.0.1 --port 8800
