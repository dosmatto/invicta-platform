"""Regras de aceite do robô noturno — roda: npm run teste:msr-regras

As MESMAS regras existem em dois lugares: src/lib/msrSelecao.ts (a tela) e
backend/agenda.py (o robô). O backend não importa TypeScript, então a duplicação
é inevitável — o que este arquivo garante é que ela não DIVERGE: os vetores aqui
são os mesmos de scripts/teste-msr-selecao.mjs, caso a caso.

Divergir seria pior do que duplicar: a tela mostraria a cena como aceita e o robô
a recusaria de madrugada, sem ninguém entender por quê.

Protege também:
  • o formato ISO de largura fixa da trava (o PostgREST compara como TEXTO);
  • o gzip do grid, que o navegador precisa conseguir descomprimir;
  • a leitura do polígono do talhão nos 4 formatos que o banco guarda.
"""
from __future__ import annotations

import base64
import gzip
import json
import os
import re
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend"))

import numpy as np  # noqa: E402

import agenda  # noqa: E402

ok = 0
falhou = 0


def t(nome, fn):
    global ok, falhou
    try:
        fn()
        ok += 1
        print("  ✓", nome)
    except AssertionError as e:
        falhou += 1
        print("  ✗", nome, "—", e)
    except Exception as e:  # erro de programação no próprio teste
        falhou += 1
        print("  ✗", nome, "—", type(e).__name__, e)


def _assert(cond, msg=""):
    assert cond, msg
    return True


def _erro_de(fn):
    """Mensagem do RuntimeError, ou '' se não levantou."""
    try:
        fn()
        return ""
    except RuntimeError as e:
        return str(e)


R = agenda.REGRAS_PADRAO


def boa(**extra):
    c = {"data": "2026-03-10", "nuvem": 5, "pct_limpo": 92, "ndvi_medio": 0.71, "sem_mascara": False}
    c.update(extra)
    return c


print("\nos padrões batem com os do front (src/lib/msrSelecao.ts)")

t("nuvemMaxCena 20 / pctLimpoMin 70 / ndviMin 0,15 / intervaloMinDias 5", lambda: (
    _assert(R["nuvemMaxCena"] == 20, "nuvemMaxCena"),
    _assert(R["pctLimpoMin"] == 70, "pctLimpoMin"),
    _assert(abs(R["ndviMin"] - 0.15) < 1e-9, "ndviMin"),
    _assert(R["intervaloMinDias"] == 5, "intervaloMinDias"),
))



print("\nas 4 regras, uma a uma")

t("cena boa passa", lambda: _assert(agenda.avaliar_regras(boa(), R) == (True, "ok")))
t("regra 1: nuvem da cena acima do limite",
  lambda: _assert(agenda.avaliar_regras(boa(nuvem=40), R) == (False, "nuvem_cena")))
t("regra 2: talhão encoberto",
  lambda: _assert(agenda.avaliar_regras(boa(pct_limpo=41), R) == (False, "pct_limpo")))
t("regra 3: vigor abaixo do mínimo",
  lambda: _assert(agenda.avaliar_regras(boa(ndvi_medio=0.08), R) == (False, "ndvi_min")))
t("regra 4: colada na cena anterior",
  lambda: _assert(agenda.avaliar_regras(boa(data="2026-03-10"), R, "2026-03-07") == (False, "intervalo")))
t("regra 4 não se aplica sem cena anterior",
  lambda: _assert(agenda.avaliar_regras(boa(), R, None)[0] is True))

print("\nbordas exatas (o limiar batido PASSA — igual ao front)")

t("pctLimpo exatamente no limiar passa", lambda: (
    _assert(agenda.avaliar_regras(boa(pct_limpo=R["pctLimpoMin"]), R)[0] is True),
    _assert(agenda.avaliar_regras(boa(pct_limpo=R["pctLimpoMin"] - 0.1), R)[1] == "pct_limpo"),
))
t("ndviMedio exatamente no limiar passa", lambda: (
    _assert(agenda.avaliar_regras(boa(ndvi_medio=R["ndviMin"]), R)[0] is True),
    _assert(agenda.avaliar_regras(boa(ndvi_medio=R["ndviMin"] - 0.001), R)[1] == "ndvi_min"),
))
t("nuvem exatamente no limiar passa", lambda: (
    _assert(agenda.avaliar_regras(boa(nuvem=R["nuvemMaxCena"]), R)[0] is True),
    _assert(agenda.avaliar_regras(boa(nuvem=R["nuvemMaxCena"] + 0.1), R)[1] == "nuvem_cena"),
))
t("intervalo exatamente no limiar passa", lambda: (
    _assert(agenda.avaliar_regras(boa(data="2026-03-10"), R, "2026-03-05")[0] is True),
    _assert(agenda.avaliar_regras(boa(data="2026-03-09"), R, "2026-03-05")[1] == "intervalo"),
))

print("\nnão avaliada e sensor sem máscara")

t("sem pct_limpo → sem_avaliacao (nunca aceita por omissão)",
  lambda: _assert(agenda.avaliar_regras(boa(pct_limpo=None), R) == (False, "sem_avaliacao")))
t("sem ndvi_medio → sem_avaliacao",
  lambda: _assert(agenda.avaliar_regras(boa(ndvi_medio=None), R) == (False, "sem_avaliacao")))
t("CBERS (sem máscara) recusado por padrão, aceito só se mandarem", lambda: (
    _assert(agenda.avaliar_regras(boa(sem_mascara=True), R)[1] == "sem_mascara"),
    _assert(agenda.avaliar_regras(boa(sem_mascara=True), R, None, True)[0] is True),
))
t("nuvem nula não reprova",
  lambda: _assert(agenda.avaliar_regras(boa(nuvem=None), R)[0] is True))

print("\nordem das checagens (o que segura o custo do robô)")

t("nuvem alta reprova ANTES de exigir avaliação",
  lambda: _assert(agenda.avaliar_regras(boa(nuvem=90, pct_limpo=None, ndvi_medio=None), R)[1] == "nuvem_cena"))
t("talhão encoberto reprova ANTES da regra de vigor",
  lambda: _assert(agenda.avaliar_regras(boa(pct_limpo=10, ndvi_medio=0.01), R)[1] == "pct_limpo"))
t("todo motivo tem texto para o log", lambda: _assert(
    all(agenda.TEXTO_MOTIVO.get(m) for m in
        ["ok", "sem_mascara", "nuvem_cena", "pct_limpo", "ndvi_min", "intervalo", "sem_avaliacao"])))

print("\ntrava: o carimbo de tempo tem que ordenar como texto")

t("formato ISO de largura fixa, sempre em UTC e sem microssegundos", lambda: _assert(
    re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", agenda._iso_utc()) is not None,
    agenda._iso_utc()))

t("comparação de texto concorda com a de data (é disso que a trava depende)", lambda: (
    _assert(agenda._iso_utc(datetime(2026, 3, 9, 23, 59, 59, tzinfo=timezone.utc))
            < agenda._iso_utc(datetime(2026, 3, 10, 0, 0, 0, tzinfo=timezone.utc))),
    _assert(agenda._iso_utc(datetime(2026, 9, 30, 23, 0, 0, tzinfo=timezone.utc))
            < agenda._iso_utc(datetime(2026, 10, 1, 1, 0, 0, tzinfo=timezone.utc))),
    _assert(agenda._iso_utc(datetime(2026, 1, 2, 3, 4, 5, tzinfo=timezone.utc)) == "2026-01-02T03:04:05Z"),
))

print("\njanela de execução")

t("dentro e fora da janela padrão (02:00–05:30)", lambda: (
    _assert(agenda.na_janela(datetime(2026, 3, 10, 3, 0)) is True, "03:00 deveria estar dentro"),
    _assert(agenda.na_janela(datetime(2026, 3, 10, 2, 0)) is True, "02:00 é o início, inclusive"),
    _assert(agenda.na_janela(datetime(2026, 3, 10, 5, 30)) is False, "05:30 é o fim, exclusivo"),
    _assert(agenda.na_janela(datetime(2026, 3, 10, 14, 0)) is False, "14:00 é fora"),
))

t("janela que atravessa a meia-noite", lambda: (
    os.environ.update({"MSR_JANELA_INI": "23:00", "MSR_JANELA_FIM": "02:00"}),
    _assert(agenda.na_janela(datetime(2026, 3, 10, 23, 30)) is True),
    _assert(agenda.na_janela(datetime(2026, 3, 10, 1, 0)) is True),
    _assert(agenda.na_janela(datetime(2026, 3, 10, 12, 0)) is False),
    os.environ.pop("MSR_JANELA_INI"), os.environ.pop("MSR_JANELA_FIM"),
))

print("\ngrid: o navegador precisa conseguir descomprimir")

t("gzip + base64 volta ao mesmo Float32", lambda: (
    lambda g, d: (
        _assert(d["shape"] == [3, 4]),
        _assert(d["comp"] == "gz"),
        _assert(np.array_equal(
            np.frombuffer(gzip.decompress(base64.b64decode(d["b64"])), dtype="float32").reshape(3, 4), g)),
    )
)(np.arange(12, dtype="float32").reshape(3, 4),
  agenda.comprimir_grid(np.arange(12, dtype="float32").reshape(3, 4))))

t("é container gzip de verdade (magic 1f 8b)", lambda: _assert(
    base64.b64decode(agenda.comprimir_grid(np.zeros((2, 2), dtype="float32"))["b64"])[:2] == b"\x1f\x8b"))

t("saída determinística (mtime=0) — o mesmo raster dá os mesmos bytes", lambda: _assert(
    agenda.comprimir_grid(np.arange(9, dtype="float32").reshape(3, 3))["b64"]
    == agenda.comprimir_grid(np.arange(9, dtype="float32").reshape(3, 3))["b64"]))

t("NaN sobrevive (é como fora do talhão é gravado)", lambda: (
    lambda g: _assert(np.isnan(np.frombuffer(
        gzip.decompress(base64.b64decode(agenda.comprimir_grid(g)["b64"])), dtype="float32")[1]))
)(np.array([[1.0, np.nan]], dtype="float32")))

print("\npolígono do talhão (os 4 formatos que o banco guarda)")

QUAD = [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]

t("Polygon cru", lambda: _assert(
    agenda.poligono_de(json.dumps({"type": "Polygon", "coordinates": QUAD}))["type"] == "Polygon"))
t("Feature", lambda: _assert(
    agenda.poligono_de(json.dumps({"type": "Feature", "geometry": {"type": "Polygon", "coordinates": QUAD}}))["type"] == "Polygon"))
t("FeatureCollection de 1 vira Polygon", lambda: _assert(
    agenda.poligono_de(json.dumps({"type": "FeatureCollection", "features": [
        {"type": "Feature", "geometry": {"type": "Polygon", "coordinates": QUAD}}]}))["type"] == "Polygon"))
t("FeatureCollection de 2 vira MultiPolygon (talhão em partes)", lambda: (
    lambda p: (_assert(p["type"] == "MultiPolygon"), _assert(len(p["coordinates"]) == 2))
)(agenda.poligono_de(json.dumps({"type": "FeatureCollection", "features": [
    {"type": "Feature", "geometry": {"type": "Polygon", "coordinates": QUAD}},
    {"type": "Feature", "geometry": {"type": "Polygon", "coordinates": QUAD}}]}))))
t("MultiPolygon é preservado", lambda: _assert(
    agenda.poligono_de(json.dumps({"type": "MultiPolygon", "coordinates": [QUAD, QUAD]}))["type"] == "MultiPolygon"))
t("lixo devolve None em vez de estourar", lambda: (
    _assert(agenda.poligono_de(None) is None),
    _assert(agenda.poligono_de("") is None),
    _assert(agenda.poligono_de("{nao é json") is None),
    _assert(agenda.poligono_de(json.dumps({"type": "Point", "coordinates": [0, 0]})) is None),
))

print("\nsegurança: nada arma sem as credenciais")

t("ligada() é False sem MSR_AGENDA e sem Supabase",
  lambda: _assert(agenda.ligada() is False))
t("iniciar() é no-op silencioso quando desligado",
  lambda: _assert(agenda.iniciar() is False))
t("rodar_agora() recusa sem Supabase, com mensagem clara", lambda: (
    _assert(_erro_de(agenda.rodar_agora).startswith("Supabase nao configurado"))
))



print(f"\n{ok} passaram, {falhou} falharam\n")
sys.exit(1 if falhou else 0)
