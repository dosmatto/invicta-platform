"""Testes do LIMITE NA FAIXA DAS AMOSTRAS (backend/interp.py).

Krigagem ordinaria NAO e combinacao convexa: os pesos podem ser NEGATIVOS
(efeito de tela), e a predicao sai da faixa dos dados. Caso real relatado: mapa
de P com minimo -16,1 mg/dm3 e todas as amostras positivas.

Por que nao e cosmetico: o valor entra CRU na equacao de recomendacao. Um P
negativo vira dose inflada — medido em outro experimento: +51% de tonelagem e
+R$2.447 por causa de UM pixel. E o erro e INVISIVEL no mapa: a dose inflada
recebe uma cor normal da legenda.

Roda: `npm run teste:faixa`
"""
import sys
import os
import random
import warnings

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
warnings.filterwarnings("ignore")

import numpy as np                      # noqa: E402
import interp                           # noqa: E402

ok = 0
fail = 0


def t(nome, fn):
    global ok, fail
    try:
        fn()
        ok += 1
        print("  ✓", nome)
    except AssertionError as e:
        fail += 1
        print("  ✗", nome, "—", e)
    except Exception as e:  # pragma: no cover
        fail += 1
        print("  ✗", nome, "— erro:", e)


POLY = {"type": "Polygon", "coordinates": [[
    [-48.300, -9.200], [-48.288, -9.200], [-48.288, -9.190], [-48.300, -9.190], [-48.300, -9.200],
]]}
# Perfil de dado que provoca o problema: muitos valores baixos e alguns picos —
# a cara do fosforo. Os mesmos sorteios em que 4 de 12 saiam da faixa.
VALORES = [4, 5, 6, 7, 8, 9, 10, 12, 16, 26, 70]


def pontos(seed, n=28):
    random.seed(seed)
    return [{"lng": -48.2990 + 0.0100 * random.random(),
             "lat": -9.1990 + 0.0080 * random.random(),
             "valor": float(random.choice(VALORES))} for _ in range(n)]


def faixa(pts):
    z = [p["valor"] for p in pts]
    return min(z), max(z)


def rodar(pts, metodo="krige", **kw):
    g = interp.gerar_grid(pts, POLY, pixel_m=10.0, metodo=metodo, **kw)
    return g["grid"][np.isfinite(g["grid"])], g


def _nenhum_sorteio_sai_da_faixa():
    fora = []
    for s in range(12):
        pts = pontos(s)
        v, _ = rodar(pts)
        zmin, zmax = faixa(pts)
        if v.min() < zmin - 1e-6 or v.max() > zmax + 1e-6:
            fora.append((s, float(v.min()), float(v.max()), zmin, zmax))
    assert not fora, f"sairam da faixa: {fora}"


def _o_pior_caso_conhecido():
    # seed 11 dava [-30.69, 87.08] com amostras [4, 70]
    pts = pontos(11)
    v, _ = rodar(pts)
    zmin, zmax = faixa(pts)
    assert v.min() >= zmin - 1e-6, f"minimo {v.min()} abaixo de {zmin}"
    assert v.max() <= zmax + 1e-6, f"maximo {v.max()} acima de {zmax}"


def _gaussiano_tambem():
    # o modelo mais propenso a ultrapassar
    for s in (0, 11):
        pts = pontos(s)
        v, _ = rodar(pts, modelo_fixo="gaussian")
        zmin, zmax = faixa(pts)
        assert v.min() >= zmin - 1e-6 and v.max() <= zmax + 1e-6, \
            f"gaussiano seed {s}: [{v.min()}, {v.max()}] fora de [{zmin}, {zmax}]"


def _krigagem_fixa_tambem():
    # Krigagem fixa (400/300/10): pepita baixa = mais propensa a peso negativo
    vm = {"modelo": "spherical", "alcance": 400, "patamar": 300, "pepita": 10}
    pts = pontos(11)
    v, _ = rodar(pts, variograma_manual=vm)
    zmin, zmax = faixa(pts)
    assert v.min() >= zmin - 1e-6 and v.max() <= zmax + 1e-6


def _mapa_dentro_da_faixa_nao_muda():
    # A correcao tem de ser CIRURGICA: onde a krigagem ja estava no lugar, o
    # resultado precisa ser identico. Compara com o clamp desligado.
    orig = interp.np.clip
    intactos = 0
    for s in range(12):
        pts = pontos(s)
        com, _ = rodar(pts)
        interp.np.clip = lambda a, lo, hi: a
        try:
            sem, _ = rodar(pts)
        finally:
            interp.np.clip = orig
        zmin, zmax = faixa(pts)
        if sem.min() >= zmin - 1e-6 and sem.max() <= zmax + 1e-6:
            assert np.allclose(com, sem, atol=0, rtol=0), \
                f"seed {s} estava na faixa e mudou — o limite nao pode tocar nele"
            intactos += 1
    assert intactos >= 6, f"esperava varios mapas intactos, houve {intactos}"


def _amostras_quase_iguais_nao_quebram():
    # min ~= max: o intervalo do clamp fica minusculo. Nao pode virar NaN nem
    # estourar. (Valores IDENTICOS nao chegam aqui: a krigagem ja recusa antes,
    # por variograma degenerado — comportamento anterior, alheio a este limite.)
    pts = [{"lng": -48.2990 + 0.0015 * i, "lat": -9.1990 + 0.0012 * i,
            "valor": 7.0 + 0.001 * i} for i in range(8)]
    v, _ = rodar(pts, metodo="idw")
    zmin, zmax = faixa(pts)
    assert np.all(np.isfinite(v)), "o limite nao pode gerar NaN"
    assert v.min() >= zmin - 1e-6 and v.max() <= zmax + 1e-6


def _idw_segue_igual():
    # IDW e convexo: nunca saiu da faixa, entao o limite e no-op ali.
    pts = pontos(11)
    v, _ = rodar(pts, metodo="idw")
    zmin, zmax = faixa(pts)
    assert v.min() >= zmin - 1e-6 and v.max() <= zmax + 1e-6


t("nenhum dos 12 sorteios sai da faixa (antes eram 4)", _nenhum_sorteio_sai_da_faixa)
t("o pior caso conhecido (-30,7 a 87,1) fica na faixa", _o_pior_caso_conhecido)
t("modelo gaussiano — o mais propenso — respeita a faixa", _gaussiano_tambem)
t("Krigagem fixa 400/300/10 respeita a faixa", _krigagem_fixa_tambem)
t("mapa que JA estava na faixa nao muda um pixel", _mapa_dentro_da_faixa_nao_muda)
t("amostras quase iguais nao quebram o limite", _amostras_quase_iguais_nao_quebram)
t("IDW segue igual (ja era convexo)", _idw_segue_igual)

print(f"\n{ok} passaram, {fail} falharam")
sys.exit(1 if fail else 0)
