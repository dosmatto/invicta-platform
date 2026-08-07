"""Testes do `cobrir_poligono` do interpolador (backend).

A dose sai em 20 m. Com a mascara estrita (point-in-polygon no NO da malha), a
celula da divisa tem o centro fora e era descartada inteira — sobrava uma faixa de
ate um pixel SEM DOSE em toda a borda do talhao. Com `cobrir_poligono`, a malha
ganha um pixel de folga e entra toda celula que TOCA o poligono, com o valor que a
krigagem ja calculou para aquele no (nada e estimado). O corte exato pelo contorno
acontece depois, no desenho e na exportacao.

Roda: `npm run teste:cobrir`
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import numpy as np                      # noqa: E402
import shapely                          # noqa: E402
from shapely.geometry import shape      # noqa: E402
from shapely.ops import unary_union     # noqa: E402

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


# Talhao IRREGULAR de proposito: e na borda oblíqua que a mascara estrita mais perde.
POLY = {"type": "Polygon", "coordinates": [[
    [-50.300, -24.9000], [-50.291, -24.9005], [-50.2895, -24.8975],
    [-50.2925, -24.8952], [-50.2965, -24.8961], [-50.300, -24.9000],
]]}
PTS = [
    {"lng": -50.300 + 0.0105 * ((i % 6) + 0.5) / 6,
     "lat": -24.9005 + 0.0053 * ((i // 6) + 0.5) / 5,
     "valor": 1.0 + (i % 7)}
    for i in range(30)
]


def rodar(cobrir):
    return interp.gerar_grid(PTS, POLY, pixel_m=20.0, metodo="krige",
                             cobrir_poligono=cobrir)


def area_descoberta(g):
    """Fracao da area do talhao que NAO cai sob nenhuma celula valida."""
    gx, gy, gr = g["gx"], g["gy"], g["grid"]
    dx = float(gx[1] - gx[0])
    dy = float(gy[1] - gy[0])
    XX, YY = np.meshgrid(gx, gy)
    fin = np.isfinite(gr)
    caixas = shapely.box(XX[fin] - dx / 2, YY[fin] - dy / 2,
                         XX[fin] + dx / 2, YY[fin] + dy / 2)
    poly = shape(POLY)
    return poly.difference(unary_union(list(caixas))).area / poly.area


G_ESTRITO = rodar(False)
G_COBRIR = rodar(True)


def _cobre_tudo():
    frac = area_descoberta(G_COBRIR)
    assert frac < 1e-9, f"sobrou {100 * frac:.3f}% do talhao sem pixel"


def _estrito_deixa_faixa():
    # Se um dia isto falhar, a mascara estrita mudou — e `cobrir_poligono`
    # provavelmente virou desnecessario. Vale reavaliar em vez de so ajustar.
    frac = area_descoberta(G_ESTRITO)
    assert frac > 1e-4, "a mascara estrita deveria deixar faixa na borda"


def _folga_de_um_pixel():
    gx_e, gx_c = G_ESTRITO["gx"], G_COBRIR["gx"]
    assert len(gx_c) == len(gx_e) + 2, f"esperava +2 colunas, veio {len(gx_c)} vs {len(gx_e)}"
    assert len(G_COBRIR["gy"]) == len(G_ESTRITO["gy"]) + 2


def _bounds_acompanham_a_malha():
    b = G_COBRIR["bounds"]
    gx, gy = G_COBRIR["gx"], G_COBRIR["gy"]
    # O front estica a imagem sobre os bounds: se eles nao seguirem a malha
    # estendida, o raster inteiro sai deslocado no mapa.
    assert abs(b[0] - float(gx[0])) < 1e-12 and abs(b[2] - float(gx[-1])) < 1e-12
    assert abs(b[1] - float(gy[0])) < 1e-12 and abs(b[3] - float(gy[-1])) < 1e-12
    poly = shape(POLY)
    assert b[0] < poly.bounds[0] and b[2] > poly.bounds[2], "deveria transbordar o bbox"


def _sem_flag_nada_muda():
    # O mapa fino da aba Fertilidade NAO manda a flag e nao pode mudar de jeito
    # nenhum — foi mudanca silenciosa assim que quebrou o relatorio na v2.37.0.
    poly = shape(POLY)
    b = G_ESTRITO["bounds"]
    assert [round(v, 12) for v in b] == [round(v, 12) for v in poly.bounds], \
        "sem a flag, bounds tem de continuar sendo o bbox do poligono"


def _valores_sao_reais_nao_preenchidos():
    # A borda leva o valor que a krigagem calculou para aquele no, nao uma copia
    # do vizinho. Prova: os nos comuns as duas malhas batem, e os novos existem.
    ge, gc = G_ESTRITO, G_COBRIR
    ie = np.isfinite(ge["grid"])
    # os nos internos coincidem (mesma malha deslocada de 1 celula em cada eixo)
    comum_e = ge["grid"][ie]
    comum_c = gc["grid"][1:-1, 1:-1][ie]
    dif = np.abs(comum_e - comum_c)
    assert np.nanmax(dif) < 1e-6, f"nos internos mudaram (max {np.nanmax(dif)})"
    assert int(np.isfinite(gc["grid"]).sum()) > int(ie.sum()), "nenhuma celula nova entrou"


t("cobrir_poligono: 100% do talhao fica sob algum pixel", _cobre_tudo)
t("mascara estrita: ainda deixa faixa na borda (o problema que motivou isto)", _estrito_deixa_faixa)
t("a malha ganha exatamente 1 pixel de folga por lado", _folga_de_um_pixel)
t("bounds acompanham a malha estendida (senao o raster sai deslocado)", _bounds_acompanham_a_malha)
t("SEM a flag, nada muda: bounds seguem sendo o bbox do poligono", _sem_flag_nada_muda)
t("os nos internos nao mudam de valor; a borda e valor real, nao preenchimento", _valores_sao_reais_nao_preenchidos)

print(f"\n{ok} passaram, {fail} falharam")
sys.exit(1 if fail else 0)
