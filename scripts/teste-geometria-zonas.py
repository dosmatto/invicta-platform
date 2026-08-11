# Geometria das zonas de manejo (backend) — roda: npm run teste:geometria
#
# O que este arquivo protege são as duas formas de "quebrar a geometria" que
# apareceram no campo (IGEFI 04, malha de 5 m):
#
#   1. ESCADINHA — o Gerar entregava a divisa em degraus de UM pixel. Medido no
#      talhão real: mediana dos segmentos das divisas internas = 4,98 m (a
#      célula) e 69% deles cabiam numa célula. Somado a isso, manchas de 25, 54,
#      74 e 215 m² saíam como ZONAS, com número próprio.
#
#   2. AUTOINTERSEÇÃO QUE PASSAVA PELA VALIDAÇÃO — o `suavizar_zonas` valida a
#      geometria no plano MÉTRICO e devolve em GRAUS. Duas das 31 zonas do
#      IGEFI 04 saíam válidas em metros e com self-intersection em graus: a
#      checagem obrigatória olhava o sistema errado e o app recebia a zona
#      quebrada. Ver `_para_graus`.
#
# Nada aqui depende de dado do usuário: o raster é sintético, mas com a mesma
# geometria de problema (talhão irregular + gradiente + ruído).

import math
import os
import sys

import numpy as np
import shapely
from scipy import ndimage
from shapely.geometry import mapping, shape

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend"))

import interp  # noqa: E402

ok = fail = 0


def t(nome, fn):
    global ok, fail
    try:
        fn()
        ok += 1
        print("  ✓", nome)
    except Exception as e:
        fail += 1
        print("  ✗", nome, "—", e)


# ── cenário: talhão irregular de ~90 ha, malha de 5 m, 2 camadas ────────────
LON0, LAT0 = -50.30, -24.89
ROWS, COLS = 240, 190
BOUNDS = [LON0, LAT0 - ROWS * 5 / 110540.0, LON0 + COLS * 5 / (111320.0 * math.cos(math.radians(LAT0))), LAT0]
CELULA_M = 5.0


def _b64(a):
    import base64
    return base64.b64encode(np.asarray(a, dtype=np.float32).tobytes()).decode()


def _camadas():
    """Gradiente diagonal + bolhas + ruído CORRELACIONADO no espaço: é assim que
    um mapa krigado se parece — manchas contínuas de contorno recortado, que é
    o que produz escadinha e caco na vetorização. Ruído branco puro faria
    milhares de pixels soltos, que não é o caso real e leva minutos p/ montar."""
    rng = np.random.default_rng(7)
    yy, xx = np.mgrid[0:ROWS, 0:COLS]
    base = (xx / COLS) * 2.0 + (yy / ROWS) * 1.2
    bolhas = 1.5 * np.exp(-(((xx - 60) ** 2 + (yy - 80) ** 2) / 900.0))
    bolhas += 1.2 * np.exp(-(((xx - 140) ** 2 + (yy - 170) ** 2) / 1200.0))
    manchado = lambda: ndimage.gaussian_filter(rng.normal(0, 1, (ROWS, COLS)), 3.0) * 0.8
    return [{"nome": "MO 0-20", "b64": _b64(base + bolhas + manchado())},
            {"nome": "CTC 0-20", "b64": _b64(base * 0.7 - bolhas + manchado())}]


def _talhao():
    """Contorno irregular (não retangular) — o limite externo do talhão é o que
    NUNCA pode ser suavizado, então ele precisa ter forma própria no teste."""
    w, s, e, n = BOUNDS
    cx, cy = (w + e) / 2, (s + n) / 2
    rx, ry = (e - w) * 0.46, (n - s) * 0.46
    pts = []
    for i in range(120):
        th = 2 * math.pi * i / 120
        r = 1.0 + 0.16 * math.sin(3 * th) + 0.08 * math.cos(5 * th)
        pts.append((cx + rx * r * math.cos(th), cy + ry * r * math.sin(th)))
    pts.append(pts[0])
    return mapping(shapely.Polygon(pts))


CAMADAS, TALHAO = _camadas(), _talhao()
FC = interp.gerar_multi(CAMADAS, BOUNDS, [ROWS, COLS], 5, algoritmo="fcm",
                        polygon_geojson=TALHAO, area_min_ha=0.0)


def _local(fc):
    geos = [shape(f["geometry"]) for f in fc["features"]]
    minx, miny, maxx, maxy = shapely.union_all(geos).bounds
    lo, la = (minx + maxx) / 2, (miny + maxy) / 2
    return [interp._tf_local(g, lo, la) for g in geos], lo, la


def _passo_das_divisas(fc):
    """Mediana do comprimento dos segmentos das DIVISAS INTERNAS — a medida
    direta da escadinha: se sai 1 célula, a divisa é o desenho do pixel."""
    gs, lo, la = _local(fc)
    poly_loc = interp._tf_local(shape(TALHAO), lo, la)
    faixa = interp._borda(poly_loc).buffer(CELULA_M * 0.25)
    segs = []
    for ln in interp._arestas_do_arranjo(gs):
        if ln.within(faixa):
            continue
        c = np.asarray(ln.coords)
        segs.extend(np.hypot(*(c[1:] - c[:-1]).T).tolist())
    return np.array(segs) if segs else np.array([0.0])


# ── 1. o Gerar não entrega mais a escadinha da célula ────────────────────────
def escadinha_saiu():
    segs = _passo_das_divisas(FC)
    med = float(np.median(segs))
    numa_celula = float(np.mean(segs <= CELULA_M * 1.05))
    assert med > CELULA_M * 2, f"divisa ainda no passo do pixel: mediana {med:.2f} m (célula {CELULA_M} m)"
    assert numa_celula < 0.25, f"{numa_celula:.0%} dos segmentos cabem numa célula — escadinha"


def sem_caco_de_vetorizacao():
    gs, _, _ = _local(FC)
    cacos = [p.area for g in gs for p in interp._so_poligonos(g) if p.area < interp.RUIDO_M2]
    assert not cacos, f"{len(cacos)} zona(s) menores que {interp.RUIDO_M2:.0f} m²: {[round(a) for a in cacos]}"


# ── 2. o que sai é válido NO SISTEMA QUE SAI (graus), não só em metros ───────
def gerar_devolve_valido_em_graus():
    ruins = [f["properties"].get("id") for f in FC["features"] if not shape(f["geometry"]).is_valid]
    assert not ruins, f"zonas inválidas em graus na saída do Gerar: {ruins}"


def suavizar_devolve_valido_em_graus():
    for nivel in ("leve", "moderado", "intenso"):
        r = interp.suavizar_zonas(FC, TALHAO, nivel=nivel)
        ruins = [f["properties"].get("id") for f in r["fc"]["features"]
                 if not shape(f["geometry"]).is_valid]
        assert not ruins, f"nível {nivel}: zonas inválidas em graus {ruins}"


def suavizar_tolerancia_pequena_tambem():
    # Tolerância baixa é onde o Chaikin mais cria laço — foi com tol=2 m que
    # saíram 4 zonas com self-intersection no talhão real.
    for tol in (2.0, 4.0, 6.0):
        r = interp.suavizar_zonas(FC, TALHAO, nivel="personalizado", tolerancia_m=tol, iteracoes=2)
        ruins = [f["properties"].get("id") for f in r["fc"]["features"]
                 if not shape(f["geometry"]).is_valid]
        assert not ruins, f"tolerância {tol} m: zonas inválidas em graus {ruins}"


def para_graus_conserta_o_que_recebe():
    # Contrato direto: entrou laçada, sai válida. É o que impede a zona quebrada
    # de chegar ao app quando a conversão métrica→graus cria o cruzamento.
    laco = shapely.Polygon([(0, 0), (100, 100), (100, 0), (0, 100), (0, 0)])
    assert not laco.is_valid, "fixture do teste deixou de ser inválida"
    (saida,) = interp._para_graus([laco], LON0, LAT0)
    assert saida.is_valid, "_para_graus devolveu geometria inválida"
    assert not saida.is_empty, "_para_graus devolveu geometria vazia"


# ── 3. as garantias que já existiam continuam de pé ──────────────────────────
def cobertura_exata():
    gs, lo, la = _local(FC)
    poly_loc = shapely.make_valid(interp._tf_local(shape(TALHAO), lo, la))
    uniao = shapely.union_all(gs)
    vao = poly_loc.difference(uniao).area
    sobra = uniao.difference(poly_loc).area
    assert vao < 5.0, f"vão de {vao:.1f} m² entre as zonas e o talhão"
    assert sobra < 5.0, f"{sobra:.1f} m² de zona fora do talhão"


def sem_sobreposicao():
    gs, _, _ = _local(FC)
    total = 0.0
    for i in range(len(gs)):
        for j in range(i + 1, len(gs)):
            total += gs[i].intersection(gs[j]).area
    assert total < 5.0, f"{total:.1f} m² de sobreposição entre zonas"


def contorno_externo_intocado():
    # A suavização mexe nas divisas INTERNAS; a borda do talhão é a cadastrada.
    r = interp.suavizar_zonas(FC, TALHAO, nivel="intenso")
    gs = [shape(f["geometry"]) for f in r["fc"]["features"]]
    minx, miny, maxx, maxy = shapely.union_all(gs).bounds
    lo, la = (minx + maxx) / 2, (miny + maxy) / 2
    uni = shapely.union_all([interp._tf_local(g, lo, la) for g in gs])
    poly_loc = shapely.make_valid(interp._tf_local(shape(TALHAO), lo, la))
    dif = sum(p.area for p in interp._so_poligonos(uni.symmetric_difference(poly_loc)))
    assert dif < 5.0, f"o contorno do talhão mudou em {dif:.1f} m²"


print(f"\nGeometria das zonas — {len(FC['features'])} zonas geradas "
      f"(malha {COLS}×{ROWS}, célula {CELULA_M:.0f} m)\n")
t("Gerar: a divisa não sai mais no passo do pixel", escadinha_saiu)
t("Gerar: nenhuma zona é caco de vetorização", sem_caco_de_vetorizacao)
t("Gerar: toda zona é válida em GRAUS", gerar_devolve_valido_em_graus)
t("Suavizar: todo nível devolve zona válida em GRAUS", suavizar_devolve_valido_em_graus)
t("Suavizar: tolerância pequena também", suavizar_tolerancia_pequena_tambem)
t("_para_graus conserta a geometria que recebe", para_graus_conserta_o_que_recebe)
t("união das zonas = talhão (sem vão, sem sobra)", cobertura_exata)
t("zonas não se sobrepõem", sem_sobreposicao)
t("o contorno do talhão continua o cadastrado", contorno_externo_intocado)

print(f"\n{ok} passaram, {fail} falharam")
sys.exit(1 if fail else 0)
