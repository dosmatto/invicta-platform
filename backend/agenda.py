"""Robo noturno do satelite (pendencia 40).

Varre os talhoes marcados como monitorados, busca cenas novas do Sentinel-2,
aplica as regras de aceite e guarda as camadas prontas — em horario de baixo uso,
para que de manha o indice ja esteja la sem ninguem ter pedido.

DESENHO, e por que assim:

* Sem dependencia nova. Uma thread daemon com laco proprio resolve; o APScheduler
  agendaria em memoria (que morre junto com o worker no --max-requests) e ainda
  exigiria a mesma trava distribuida.

* TRAVA em linha do banco. O gunicorn sobe 2 workers e os dois armam este
  agendador. A trava e um UPDATE condicional no app_kv: o Postgres serializa a
  linha, entao so um worker enxerga a versao expirada e leva a noite.

* PROGRESSO COMMITADO POR CENA. O worker e reciclado a cada ~100 requisicoes
  (GDAL/rasterio fragmentam a memoria — ver o Dockerfile), e uma thread de job e
  morta junto. Por isso cada cena aceita e gravada na hora, com id
  deterministico, e o log e reescrito a cada passo: morrer no meio custa UMA
  cena. Quando a trava expira (5 min), o worker seguinte retoma de onde parou,
  porque o job pula o que ja esta no banco.

* SERIAL e com teto. O mesmo processo atende usuarios; o robo anda de uma cena
  por vez, respira entre elas e para na hora marcada.

Tudo OPT-IN: sem MSR_AGENDA=1 (e sem as credenciais do Supabase) nada arma.
"""
from __future__ import annotations

import base64
import gc
import gzip
import json
import os
import socket
import threading
import traceback
from datetime import date, datetime, timedelta, timezone
from typing import Any

import numpy as np

import msr
import supa

VERSION = "agenda-1"

COL_MONITOR = "inv_msr_monitor"
COL_EXEC = "inv_msr_execucoes"
COL_ESTADO = "inv_msr_estado"
COL_LOCK = "inv_msr_lock"
ITEM_LOCK = "noturno"

# TTL curto de proposito: worker morto no meio da noite precisa que o substituto
# retome em minutos, nao na noite seguinte.
TTL_TRAVA_S = 300
RENOVAR_A_CADA_S = 60


def _env(nome: str, padrao: str) -> str:
    return (os.environ.get(nome) or padrao).strip()


def _env_int(nome: str, padrao: int) -> int:
    try:
        return int(_env(nome, str(padrao)))
    except ValueError:
        return padrao


def ligada() -> bool:
    return _env("MSR_AGENDA", "") == "1" and supa.configurado()


def _fuso():
    try:
        from zoneinfo import ZoneInfo
        return ZoneInfo(_env("MSR_TZ", "America/Sao_Paulo"))
    except Exception:
        return timezone(timedelta(hours=-3))   # Brasil continental, sem tzdata


def _agora_local() -> datetime:
    return datetime.now(_fuso())


def _iso_utc(quando: datetime | None = None) -> str:
    """ISO de LARGURA FIXA em UTC.

    Obrigatorio: o PostgREST compara `dados->>expira` como TEXTO, e so um
    formato de largura fixa ordena igual a data.
    """
    d = (quando or datetime.now(timezone.utc)).astimezone(timezone.utc)
    return d.strftime("%Y-%m-%dT%H:%M:%SZ")


def _hhmm(txt: str, padrao: tuple[int, int]) -> tuple[int, int]:
    try:
        h, m = txt.split(":")
        return int(h), int(m)
    except Exception:
        return padrao


def na_janela(agora: datetime | None = None) -> bool:
    a = agora or _agora_local()
    hi, mi = _hhmm(_env("MSR_JANELA_INI", "02:00"), (2, 0))
    hf, mf = _hhmm(_env("MSR_JANELA_FIM", "05:30"), (5, 30))
    minutos = a.hour * 60 + a.minute
    ini, fim = hi * 60 + mi, hf * 60 + mf
    return ini <= minutos < fim if ini <= fim else (minutos >= ini or minutos < fim)


# ── trava distribuida ────────────────────────────────────────────────────────

def _quem_sou() -> str:
    return f"{socket.gethostname()}:{os.getpid()}"


def _tentar_travar(exec_id: str) -> bool:
    dados = {"dono": _quem_sou(), "expira": _iso_utc(datetime.now(timezone.utc) + timedelta(seconds=TTL_TRAVA_S)),
             "iniciadoEm": _iso_utc(), "execucaoId": exec_id}
    if supa.inserir_se_novo(COL_LOCK, ITEM_LOCK, dados):
        return True                                   # primeira noite da instalacao
    # A linha existe: so leva quem encontrar a trava JA EXPIRADA.
    return supa.atualizar_se(COL_LOCK, ITEM_LOCK, dados,
                             {"dados->>expira": f"lt.{_iso_utc()}"}) > 0


def _renovar_trava(exec_id: str) -> bool:
    dados = {"dono": _quem_sou(), "expira": _iso_utc(datetime.now(timezone.utc) + timedelta(seconds=TTL_TRAVA_S)),
             "iniciadoEm": _iso_utc(), "execucaoId": exec_id}
    return supa.atualizar_se(COL_LOCK, ITEM_LOCK, dados,
                             {"dados->>dono": f"eq.{_quem_sou()}"}) > 0


def _soltar_trava() -> None:
    try:
        supa.atualizar_se(COL_LOCK, ITEM_LOCK,
                          {"dono": "", "expira": _iso_utc(datetime.now(timezone.utc) - timedelta(seconds=1))},
                          {"dados->>dono": f"eq.{_quem_sou()}"})
    except Exception:
        pass


# ── grid no MESMO formato do front ───────────────────────────────────────────

def comprimir_grid(g: np.ndarray) -> dict:
    """gzip(Float32 em ordem C) + base64 — igual a comprimirGrid() do front.

    O navegador descomprime com DecompressionStream('gzip'), que le exatamente o
    container que gzip.compress produz. mtime=0 deixa a saida deterministica (o
    mesmo raster gera os mesmos bytes, o que evita gravacao inutil).
    """
    b = np.ascontiguousarray(g, dtype="float32").tobytes()
    return {
        "shape": [int(g.shape[0]), int(g.shape[1])],
        "b64": base64.b64encode(gzip.compress(b, compresslevel=6, mtime=0)).decode(),
        "comp": "gz",
    }


def poligono_de(geojson_txt: str | None) -> dict | None:
    """Espelha extrairPoligono() do front (src/lib/fertilidade.ts)."""
    if not geojson_txt:
        return None
    try:
        g = json.loads(geojson_txt) if isinstance(geojson_txt, str) else geojson_txt
    except Exception:
        return None
    polis: list[Any] = []

    def add(geom):
        if not geom:
            return
        t = geom.get("type")
        if t == "Polygon":
            polis.append(geom["coordinates"])
        elif t == "MultiPolygon":
            polis.extend(geom["coordinates"])
        elif t == "GeometryCollection":
            for x in geom.get("geometries") or []:
                add(x)

    if g.get("type") == "FeatureCollection":
        for f in g.get("features") or []:
            add(f.get("geometry"))
    elif g.get("type") == "Feature":
        add(g.get("geometry"))
    else:
        add(g)

    if not polis:
        return None
    if len(polis) == 1:
        return {"type": "Polygon", "coordinates": polis[0]}
    return {"type": "MultiPolygon", "coordinates": polis}


# ── regras de aceite (gemeas de src/lib/msrSelecao.ts) ───────────────────────
# A duplicacao e consciente: o backend nao importa TypeScript. Os dois lados
# usam os MESMOS vetores de teste — scripts/teste-msr-selecao.mjs (front) e
# scripts/teste-msr-regras.py (aqui). Mexeu num, mexa no outro.

REGRAS_PADRAO = {
    "nuvemMaxCena": 20.0,
    "pctLimpoMin": 70.0,
    "ndviMin": 0.15,
    "intervaloMinDias": 5,
}

TEXTO_MOTIVO = {
    "ok": "aceita",
    "sem_mascara": "sensor sem mascara de nuvem",
    "nuvem_cena": "nuvem da cena acima do limite",
    "pct_limpo": "talhao encoberto (pouco pixel limpo)",
    "ndvi_min": "vigor abaixo do minimo — provavel solo exposto ou pos-colheita",
    "intervalo": "muito perto da cena anterior ja guardada",
    "sem_avaliacao": "cena ainda nao avaliada",
}


def _dias(a: str, b: str) -> int:
    return (date.fromisoformat(b) - date.fromisoformat(a)).days


def avaliar_regras(cena: dict, regras: dict, ultima_salva: str | None = None,
                   aceitar_sem_mascara: bool = False) -> tuple[bool, str]:
    """Do mais barato ao mais caro — e essa ordem que impede o robo de baixar
    banda de cena que ja reprovou na nuvem."""
    if cena.get("sem_mascara") and not aceitar_sem_mascara:
        return False, "sem_mascara"
    nuvem = cena.get("nuvem")
    if nuvem is not None and float(nuvem) > float(regras["nuvemMaxCena"]):
        return False, "nuvem_cena"
    pct = cena.get("pct_limpo")
    if pct is None:
        return False, "sem_avaliacao"
    if float(pct) < float(regras["pctLimpoMin"]):
        return False, "pct_limpo"
    ndvi = cena.get("ndvi_medio")
    if ndvi is None:
        return False, "sem_avaliacao"
    if float(ndvi) < float(regras["ndviMin"]):
        return False, "ndvi_min"
    if ultima_salva and _dias(ultima_salva, cena["data"]) < int(regras["intervaloMinDias"]):
        return False, "intervalo"
    return True, "ok"


# ── o job ────────────────────────────────────────────────────────────────────

def _regras_de(monitor: dict) -> dict:
    r = dict(REGRAS_PADRAO)
    r.update(monitor.get("regras") or {})
    return r


def _prefixo(talhao_id: str) -> str:
    return f"{talhao_id}__ndvi__"          # Sentinel — igual ao idNuvem() do front


def _datas_ja_salvas(talhao_id: str) -> set[str]:
    """Datas ja no banco (de qualquer indice) — e o que torna a retomada segura."""
    fora = set()
    for item in supa.ids_de_mapas(_prefixo(talhao_id)):
        partes = item.split("__")
        if len(partes) >= 4:
            fora.add(partes[-1])
    return fora


def rodar_noite(parar: threading.Event | None = None, exec_id: str | None = None) -> dict:
    """Uma passada completa. Idempotente: pula o que ja esta gravado."""
    parar = parar or threading.Event()
    exec_id = exec_id or f"exec_{_agora_local().date().isoformat()}"
    limite_cenas = _env_int("MSR_MAX_CENAS_NOITE", 60)
    limite_talhao = _env_int("MSR_MAX_CENAS_TALHAO", 3)
    dias_retro = _env_int("MSR_JANELA_DIAS", 30)
    pausa = _env_int("MSR_PAUSA_S", 2)

    log = supa.obter(COL_EXEC, exec_id) or {
        "id": exec_id, "iniciadoEm": _iso_utc(), "host": _quem_sou(),
        "status": "rodando", "totais": {"talhoes": 0, "avaliadas": 0, "salvas": 0, "erros": 0},
        "itens": [],
    }
    log["status"] = "rodando"
    log["host"] = _quem_sou()

    monitores = [m["dados"] for m in supa.listar(COL_MONITOR) if (m.get("dados") or {}).get("ativo")]
    # Quem esta ha mais tempo sem imagem passa primeiro: se o teto da noite
    # acabar, o prejuizo nao cai sempre nos mesmos talhoes.
    estados = {e["item_id"]: (e.get("dados") or {}) for e in supa.listar(COL_ESTADO)}
    monitores.sort(key=lambda m: (estados.get(m.get("talhaoId", ""), {}).get("ultimaVarreduraEm") or ""))
    log["totais"]["talhoes"] = len(monitores)
    supa.salvar(COL_EXEC, exec_id, log)

    if not monitores:
        log["status"] = "ok"
        log["terminadoEm"] = _iso_utc()
        supa.salvar(COL_EXEC, exec_id, log)
        return log

    dados_talhao = {t["id"]: t for t in supa.talhoes([m["talhaoId"] for m in monitores if m.get("talhaoId")])}
    salvas_total = 0
    hoje = _agora_local().date()

    for mon in monitores:
        if parar.is_set() or salvas_total >= limite_cenas:
            break
        tid = mon.get("talhaoId") or ""
        try:
            salvas_total += _um_talhao(mon, dados_talhao.get(tid), log, exec_id, parar,
                                       hoje, dias_retro, limite_talhao,
                                       limite_cenas - salvas_total, pausa)
        except Exception as e:
            log["totais"]["erros"] += 1
            log["itens"].append({"talhaoId": tid, "decisao": "erro", "motivo": str(e)[:200]})
            print(f"[msr] talhao {tid}: {e}\n{traceback.format_exc()}", flush=True)
        supa.salvar(COL_EXEC, exec_id, log)

    log["status"] = "interrompida" if parar.is_set() else "ok"
    log["terminadoEm"] = _iso_utc()
    supa.salvar(COL_EXEC, exec_id, log)
    return log


def _um_talhao(mon: dict, talhao: dict | None, log: dict, exec_id: str,
               parar: threading.Event, hoje: date, dias_retro: int,
               limite_talhao: int, resta: int, pausa: int) -> int:
    tid = mon.get("talhaoId") or ""
    if not talhao:
        raise ValueError("talhao nao encontrado no banco")
    poly = poligono_de((talhao.get("dados") or {}).get("geojson"))
    if not poly:
        raise ValueError("talhao sem limite (geojson)")

    regras = _regras_de(mon)
    indices = mon.get("indices") or ["NDVI"]
    pixel_m = float(mon.get("pixelM") or 10.0)

    ja = _datas_ja_salvas(tid)
    ultima = max(ja) if ja else None
    ini = max(
        date.fromisoformat(ultima) + timedelta(days=1) if ultima else hoje - timedelta(days=dias_retro),
        hoje - timedelta(days=dias_retro),
    )
    desde = (mon.get("desde") or "")[:10]
    if desde:
        try:
            ini = max(ini, date.fromisoformat(desde))
        except ValueError:
            pass
    if ini > hoje:
        return 0

    # Regra 1 (a barata) ja no catalogo: nem chega a olhar cena nublada.
    itens = msr._buscar_itens(msr.shape(poly).bounds, ini.isoformat(), hoje.isoformat(),
                              float(regras["nuvemMaxCena"]), limite=40)
    itens.sort(key=lambda it: it.datetime)          # crescente: intervalo minimo so faz sentido para frente
    salvas = 0

    for item in itens:
        if parar.is_set() or salvas >= limite_talhao or salvas >= resta:
            break
        data = item.datetime.date().isoformat()
        if data in ja:
            continue
        meta = msr._cena_meta(item)
        base = {"data": data, "nuvem": meta.get("nuvem"), "sem_mascara": False}

        # Regra 4 (barata): colada na anterior.
        ok, motivo = avaliar_regras({**base, "pct_limpo": 100.0, "ndvi_medio": 1.0}, regras, ultima)
        if not ok and motivo == "intervalo":
            _anotar(log, tid, meta, None, None, "rejeitada", motivo)
            continue

        # Regras 2 e 3: exigem ler a mascara — com corte, para nao ler bandas a toa.
        av = msr.avaliar_cenas(poly, [item.id], corte_limpo=float(regras["pctLimpoMin"]))["cenas"][0]
        log["totais"]["avaliadas"] += 1
        if av.get("erro"):
            log["totais"]["erros"] += 1
            _anotar(log, tid, meta, av.get("pct_limpo"), None, "erro", str(av["erro"])[:160])
            continue
        cena = {**base, "pct_limpo": av.get("pct_limpo"), "ndvi_medio": av.get("ndvi_medio"),
                "sem_mascara": bool(av.get("sem_mascara"))}
        ok, motivo = avaliar_regras(cena, regras, ultima)
        if not ok:
            _anotar(log, tid, meta, cena["pct_limpo"], cena["ndvi_medio"], "rejeitada", motivo)
            continue

        r = msr.gerar_indices(poly, item.id, indices, pixel_m)
        # A avaliacao foi numa grade grossa; na resolucao final o percentual pode
        # discordar. Vale o fino — e ele que vira a camada.
        st_ndvi = (r["resultados"].get(indices[0]) or {}).get("stats") or {}
        pct_fino = st_ndvi.get("pct_validos")
        if pct_fino is not None and float(pct_fino) < float(regras["pctLimpoMin"]):
            _anotar(log, tid, meta, pct_fino, st_ndvi.get("media"), "rejeitada", "pct_limpo")
            del r
            gc.collect()
            continue

        agora = _iso_utc()
        for ind, res in r["resultados"].items():
            grid = np.frombuffer(base64.b64decode(res["grid"]["b64"]), dtype="float32").reshape(res["grid"]["shape"])
            doc = {
                "resp": {"bounds": r["bounds"], "grid": comprimir_grid(grid),
                         "stats": res["stats"], "cena": r["cena"]},
                "criadoEm": agora, "salvoEm": agora,
                "indice": ind, "formula": res["formula"], "bandas": res["bandas"],
                "mascara": r["mascara"],
                "usuario": "automático",
                "automatico": True,
                "pctLimpo": res["stats"].get("pct_validos"),
                "ndviMedio": res["stats"].get("media"),
                "regras": regras, "execucaoId": exec_id,
            }
            supa.salvar_mapa(f"{_prefixo(tid)}{ind}__{data}", doc)
            del grid
        log["totais"]["salvas"] += 1
        _anotar(log, tid, meta, pct_fino, st_ndvi.get("media"), "salva", "ok", indices)
        ja.add(data)
        ultima = data
        salvas += 1
        del r
        gc.collect()
        parar.wait(pausa)

    supa.salvar(COL_ESTADO, tid, {
        "talhaoId": tid, "ultimaVarreduraEm": _iso_utc(),
        "ultimaCenaData": ultima, "salvasNaUltima": salvas,
    })
    return salvas


def _anotar(log: dict, tid: str, meta: dict, pct, ndvi, decisao: str, motivo: str,
            indices: list[str] | None = None) -> None:
    log["itens"].append({
        "talhaoId": tid, "cenaId": meta.get("id"), "data": meta.get("data"),
        "nuvem": meta.get("nuvem"), "pctLimpo": pct, "ndviMedio": ndvi,
        "decisao": decisao, "motivo": TEXTO_MOTIVO.get(motivo, motivo),
        **({"indices": indices} if indices else {}),
    })
    # O log cresce a cada cena; guarda so o rabo (o que interessa e o recente).
    if len(log["itens"]) > 400:
        del log["itens"][:-400]


# ── agendador ────────────────────────────────────────────────────────────────

_parar = threading.Event()
_thread: threading.Thread | None = None
_ultima: dict[str, Any] = {}


def _ja_concluida(exec_id: str) -> bool:
    doc = supa.obter(COL_EXEC, exec_id)
    return bool(doc and doc.get("status") == "ok")


def _uma_rodada(forcar: bool = False) -> None:
    exec_id = f"exec_{_agora_local().date().isoformat()}"
    if not forcar and _ja_concluida(exec_id):
        return
    if not _tentar_travar(exec_id):
        return                                  # o outro worker levou a noite
    _ultima["exec"] = exec_id
    _ultima["inicio"] = _iso_utc()
    parou = threading.Event()

    def bater():
        while not parou.is_set() and not _parar.is_set():
            parou.wait(RENOVAR_A_CADA_S)
            if parou.is_set():
                break
            try:
                _renovar_trava(exec_id)
            except Exception:
                pass

    hb = threading.Thread(target=bater, name="msr-heartbeat", daemon=True)
    hb.start()
    try:
        print(f"[msr] rodando {exec_id} em {_quem_sou()}", flush=True)
        log = rodar_noite(_parar, exec_id)
        _ultima["status"] = log.get("status")
        _ultima["totais"] = log.get("totais")
        print(f"[msr] {exec_id}: {log.get('totais')}", flush=True)
    except Exception as e:
        _ultima["status"] = "erro"
        _ultima["erro"] = str(e)[:300]
        print(f"[msr] falhou: {e}\n{traceback.format_exc()}", flush=True)
    finally:
        parou.set()
        _soltar_trava()


def _laco() -> None:
    intervalo = _env_int("MSR_INTERVALO_S", 300)
    while not _parar.is_set():
        try:
            if na_janela():
                _uma_rodada()
        except Exception as e:
            print(f"[msr] laco: {e}", flush=True)
        _parar.wait(intervalo)


def rodar_agora(forcar: bool = True) -> dict:
    """Dispara UMA passada fora do horario, em segundo plano.

    E o que permite testar o robo sem esperar a madrugada nem mexer no relogio
    do servidor. Passa pela MESMA trava, entao dois gatilhos simultaneos nao
    viram duas execucoes.
    """
    if not supa.configurado():
        raise RuntimeError("Supabase nao configurado no backend (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).")
    _parar.clear()
    t = threading.Thread(target=lambda: _uma_rodada(forcar), name="msr-manual", daemon=True)
    t.start()
    return {"disparado": True, "host": _quem_sou()}


def iniciar() -> bool:
    """Arma o laco neste worker. Sem MSR_AGENDA=1, no-op."""
    global _thread
    if not ligada() or (_thread and _thread.is_alive()):
        return False
    _parar.clear()
    _thread = threading.Thread(target=_laco, name="msr-agenda", daemon=True)
    _thread.start()
    print(f"[msr] agendador armado ({_env('MSR_JANELA_INI', '02:00')}–{_env('MSR_JANELA_FIM', '05:30')} {_env('MSR_TZ', 'America/Sao_Paulo')})", flush=True)
    return True


def parar_tudo() -> None:
    """Chamado no shutdown: o job para ENTRE cenas e solta a trava."""
    _parar.set()


def estado() -> dict:
    return {
        "ligada": ligada(),
        "supabase": supa.configurado(),
        "janela": f"{_env('MSR_JANELA_INI', '02:00')}-{_env('MSR_JANELA_FIM', '05:30')}",
        "tz": _env("MSR_TZ", "America/Sao_Paulo"),
        "na_janela": na_janela() if ligada() else False,
        "rodando": bool(_thread and _thread.is_alive()),
        "ultima": _ultima,
        "v": VERSION,
    }
