"""Cliente PostgREST (Supabase) do backend — leitura/escrita de dados.

Existe para o ROBO NOTURNO (pendencia 40): o backend sempre foi stateless, mas
a rotina que processa satelite de madrugada precisa ler os talhoes monitorados e
gravar as camadas geradas. Ate aqui o unico contato com o Supabase era o GoTrue
(admin_usuarios.py); este modulo fala com a API de DADOS.

Usa urllib, como todo o resto do backend — nenhuma dependencia nova.

Tudo OPT-IN: sem SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY no ambiente,
configurado() e False e o agendador simplesmente nao arma (em vez de falhar em
silencio toda noite).

A service_role passa POR CIMA da RLS. E o correto para um robo — ele grava em
nome de varios clientes — mas significa que esta chave nunca pode chegar ao
front, e que todo filtro de escopo tem que ser explicito aqui.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

SUPABASE_URL = (os.environ.get("SUPABASE_URL") or "").rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
_TIMEOUT = 30

# Coleção dos rasters — a MESMA que o front usa (src/lib/supabaseData.ts).
COL_MAPAS = "inv_mapas_fert"


def configurado() -> bool:
    return bool(SUPABASE_URL and SERVICE_KEY)


def _req(metodo: str, caminho: str, params: dict[str, str] | None = None,
         corpo: Any = None, prefer: str | None = None) -> tuple[int, Any]:
    url = f"{SUPABASE_URL}/rest/v1{caminho}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    headers = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    data = json.dumps(corpo).encode() if corpo is not None else None
    req = urllib.request.Request(url, data=data, method=metodo, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as r:
            texto = r.read().decode() or ""
            return r.status, (json.loads(texto) if texto.strip() else None)
    except urllib.error.HTTPError as e:
        try:
            texto = e.read().decode() or ""
            return e.code, (json.loads(texto) if texto.strip() else None)
        except Exception:
            return e.code, None


def _erro(st: int, corpo: Any, o_que: str) -> None:
    if st >= 300:
        raise RuntimeError(f"Supabase {st} ao {o_que}: {corpo}")


# ── app_kv (colecao + item_id + dados jsonb) ─────────────────────────────────

def listar(colecao: str, filtros: dict[str, str] | None = None,
           campos: str = "item_id,dados", limite: int | None = None) -> list[dict]:
    params = {"colecao": f"eq.{colecao}", "select": campos}
    if filtros:
        params.update(filtros)
    if limite:
        params["limit"] = str(limite)
    st, corpo = _req("GET", "/app_kv", params)
    _erro(st, corpo, f"listar {colecao}")
    return corpo or []


def obter(colecao: str, item_id: str) -> dict | None:
    linhas = listar(colecao, {"item_id": f"eq.{item_id}"}, limite=1)
    return (linhas[0].get("dados") if linhas else None)


def salvar(colecao: str, item_id: str, dados: dict, atualizado_em: str | None = None) -> None:
    """Upsert por (colecao, item_id) — a mesma chave composta do front."""
    from datetime import datetime, timezone
    linha = {
        "colecao": colecao, "item_id": item_id, "dados": dados,
        "atualizado_em": atualizado_em or datetime.now(timezone.utc).isoformat(),
    }
    st, corpo = _req("POST", "/app_kv", {"on_conflict": "colecao,item_id"}, linha,
                     prefer="resolution=merge-duplicates,return=minimal")
    _erro(st, corpo, f"salvar {colecao}/{item_id}")


def inserir_se_novo(colecao: str, item_id: str, dados: dict) -> bool:
    """POST sem merge: True se CRIOU, False se a linha ja existia (409)."""
    from datetime import datetime, timezone
    linha = {
        "colecao": colecao, "item_id": item_id, "dados": dados,
        "atualizado_em": datetime.now(timezone.utc).isoformat(),
    }
    st, corpo = _req("POST", "/app_kv", None, linha, prefer="return=minimal")
    if st == 409:
        return False
    _erro(st, corpo, f"inserir {colecao}/{item_id}")
    return True


def atualizar_se(colecao: str, item_id: str, dados: dict, condicao: dict[str, str]) -> int:
    """UPDATE condicional — devolve quantas linhas mudaram.

    E o compare-and-swap que serve de TRAVA distribuida: o filtro vira um
    `UPDATE ... WHERE ...` que o Postgres serializa por linha, entao entre os 2
    workers do gunicorn apenas UM enxerga a versao antiga e leva a linha. O outro
    recebe zero e sabe que perdeu.
    """
    from datetime import datetime, timezone
    params = {"colecao": f"eq.{colecao}", "item_id": f"eq.{item_id}"}
    params.update(condicao)
    corpo = {"dados": dados, "atualizado_em": datetime.now(timezone.utc).isoformat()}
    st, resp = _req("PATCH", "/app_kv", params, corpo, prefer="return=representation")
    _erro(st, resp, f"atualizar {colecao}/{item_id}")
    return len(resp or [])


def excluir(colecao: str, filtros: dict[str, str]) -> None:
    params = {"colecao": f"eq.{colecao}"}
    params.update(filtros)
    st, corpo = _req("DELETE", "/app_kv", params, prefer="return=minimal")
    _erro(st, corpo, f"excluir de {colecao}")


# ── atalhos do robo ──────────────────────────────────────────────────────────

def _escapar_like(s: str) -> str:
    """Escapa curingas do LIKE — os ids de mapa usam '__' de propósito."""
    return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def ids_de_mapas(prefixo: str) -> list[str]:
    """So os item_id (sem os rasters) das camadas que comecam com o prefixo."""
    params = {
        "colecao": f"eq.{COL_MAPAS}",
        "item_id": f"like.{_escapar_like(prefixo)}*",
        "select": "item_id",
    }
    st, corpo = _req("GET", "/app_kv", params)
    _erro(st, corpo, "listar ids de mapas")
    return [linha["item_id"] for linha in (corpo or [])]


def salvar_mapa(item_id: str, dados: dict) -> None:
    salvar(COL_MAPAS, item_id, dados)


def talhoes(ids: list[str]) -> list[dict]:
    """Talhoes por id — `talhoes` e a unica entidade com tabela propria."""
    if not ids:
        return []
    lista = ",".join(f'"{i}"' for i in ids)
    params = {"id": f"in.({lista})", "select": "id,nome,fazenda_id,empresa_id,dados"}
    st, corpo = _req("GET", "/talhoes", params)
    _erro(st, corpo, "buscar talhoes")
    return corpo or []
