# -*- coding: utf-8 -*-
# PROTÓTIPO — Reajuste de um zoneamento ANTIGO a um CONTORNO NOVO de talhão.
#
# Problema real: o zoneamento é antigo, o contorno do talhão foi atualizado
# depois. O anel EXTERNO do zoneamento não vale mais; o que vale é o trabalho
# agronômico embutido nas DIVISAS INTERNAS (fronteiras entre zonas vizinhas).
# Precisamos: descartar o anel externo, RECORTAR o que passou do limite novo,
# PROLONGAR o que não alcançou — seguindo a TRAJETÓRIA da linha, não a
# distância mais curta — e REPARTICIONAR o talhão atual nessas divisas.
#
# Este arquivo NÃO é backend: é banco de provas. Trabalha em METROS num plano
# local (o backend faz o mesmo em _tf_local/_tf_geo, backend/interp.py).
#
# Rodar: ~/.invicta-fert-backend/venv/bin/python scripts/teste-reajuste-divisas.py

import math
import sys

import numpy as np
import shapely
from shapely.geometry import LineString, MultiPoint, Point, Polygon
from shapely.ops import linemerge, polygonize, substring, unary_union

# ─────────────────────────────────────────────────────────────────────────────
# PARÂMETROS — METROS / m². Defaults para talhão de 20–300 ha, divisas 200–2000 m.
# ─────────────────────────────────────────────────────────────────────────────# O ALGORITMO VIVE NO BACKEND — este arquivo só o exercita.
#
# Antes ele tinha uma CÓPIA do algoritmo. As duas divergiram na primeira
# correção (o dissolve por classe, que fundia zonas vizinhas de mesmo rótulo):
# o backend foi corrigido e o banco de provas continuou aprovando o código
# antigo. Um banco de provas que testa outra coisa é pior que nenhum.
import os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'backend'))
from divisas import (  # noqa: E402
    P, reajustar, curar_cobertura, divisas_internas, trajetoria,
    raio_prolongado, primeiro_encontro, prolongar, recortar, repartir,
    herdar, pontas_livres, costurar, ancorar, absorver_slivers,
)


# ─────────────────────────────────────────────────────────────────────────────
# CASOS SINTÉTICOS
# ─────────────────────────────────────────────────────────────────────────────
def rel(nome, r, contorno):
    s = r["stats"]
    print(f"\n=== {nome} ===")
    print(f"  talhão novo {contorno.area / 1e4:.2f} ha | ganhou {s['area_ganha_ha']:.2f} ha, "
          f"perdeu {s['area_perdida_ha']:.2f} ha do antigo")
    print(f"  divisas internas: {s['n_divisas']} ({s["m_divisas"]:.0f} m) | recortados "
          f"{s.get("m_recortados", 0):.0f} m | pontas livres: {s.get('pontas_livres', 0)}")
    for (i, L, modo, R, onde) in s.get("prolongamentos", []):
        raio = "∞" if R == float("inf") else f"{R:.0f} m"
        print(f"    → divisa #{i} prolongada {L:6.1f} m [{modo}, raio {raio}] até {onde}")
    print(f"  faces: {len(r['faces'])} | cobertura {s['cobertura_final_pct']:.4f}%")
    for k, f in enumerate(r["faces"]):
        print(f"    face #{k}: {f['face'].area / 1e4:7.2f} ha  classe={str(f['classe']):>8}  "
              f"({f['origem']}, {f['frac'] * 100:.0f}%)")
    fs = [x["face"] for x in r["faces"]]
    sobre = max((fs[i].intersection(fs[j]).area for i in range(len(fs)) for j in range(i + 1, len(fs))),
                default=0.0)
    falta = abs(sum(f.area for f in fs) - contorno.area)
    print(f"  VALIDAÇÃO: |Σfaces − talhão| = {falta:.6f} m² | maior sobreposição entre faces = "
          f"{sobre:.6f} m² | {'OK' if falta <= P['COBERTURA_TOL_M2'] and sobre <= 1e-6 else 'FALHOU'}")
    print("  AVISOS DA PRÉVIA:" if r["avisos"] else "  (sem avisos)")
    for a in r["avisos"]:
        print(f"    ! {a}")


def caso_faixas():
    zonas, cls = [], []
    for k, y0 in enumerate((0, 150, 300, 450)):
        zonas.append(Polygon([(0, y0), (1000, y0), (1000, y0 + 150), (0, y0 + 150)]))
        cls.append("ABCD"[k])
    novo = Polygon([(50, -40), (1080, -40), (1080, 680), (50, 680)])
    return "1. Faixas — ULTRAPASSA à esquerda, NÃO ALCANÇA à direita", zonas, cls, novo


def caso_L():
    z1 = Polygon([(0, 0), (400, 0), (400, 300), (0, 300)])
    z2 = Polygon([(0, 300), (400, 300), (400, 600), (0, 600)])
    novo = Polygon([(-20, -20), (900, -20), (900, 280), (420, 280), (420, 620), (-20, 620)])
    return "2. Talhão em L — divisa aponta para o RECORTE", [z1, z2], ["A", "B"], novo


def caso_curva():
    R, cx, cy = 600.0, 500.0, -300.0
    arco = [(cx + R * math.cos(math.radians(a)), cy + R * math.sin(math.radians(a)))
            for a in np.linspace(52, 128, 60)]
    sup = Polygon(arco + [(arco[-1][0], 700), (arco[0][0], 700)])
    inf = Polygon(arco + [(arco[-1][0], -50), (arco[0][0], -50)])
    novo = Polygon([(0, -50), (1000, -50), (1000, 700), (0, 700)])
    return "3. Divisa CURVA (R=600 m) — tem de continuar curvando", [sup, inf], ["Alta", "Baixa"], novo


def caso_carreador():
    # Carreador de 15 m apagado do arquivo: a união do zoneamento fica PARTIDA
    # em dois blocos e a divisa vira duas pontas soltas apontando uma p/ a outra.
    zs, cls = [], []
    for x0, x1 in ((0, 490), (505, 1000)):
        zs.append(Polygon([(x0, 0), (x1, 0), (x1, 300), (x0, 300)]))
        cls.append("A")
        zs.append(Polygon([(x0, 300), (x1, 300), (x1, 600), (x0, 600)]))
        cls.append("B")
    novo = Polygon([(-10, -10), (1010, -10), (1010, 610), (-10, 610)])
    return "4. Carreador de 15 m partindo a divisa — COSTURA", zs, cls, novo


def caso_gap_fino():
    # Vão de 3 m entre as duas zonas, atravessando o talhão inteiro.
    z1 = Polygon([(0, 0), (1000, 0), (1000, 298.5), (0, 298.5)])
    z2 = Polygon([(0, 301.5), (1000, 301.5), (1000, 600), (0, 600)])
    novo = Polygon([(0, 0), (1000, 0), (1000, 600), (0, 600)])
    return "5. Vão FINO de 3 m atravessando o talhão", [z1, z2], ["A", "B"], novo


def caso_toco():
    # Zoneamento antigo minúsculo no meio de um talhão novo enorme: a divisa de
    # 80 m tem alcance 3×80 = 240 m e a borda está a 260 m. Não alcança nada.
    z1 = Polygon([(400, 260), (450, 260), (450, 340), (400, 340)])
    z2 = Polygon([(450, 260), (500, 260), (500, 340), (450, 340)])
    novo = Polygon([(0, 0), (1000, 0), (1000, 600), (0, 600)])
    return "6. Divisa de 80 m que não alcança nada", [z1, z2], ["A", "B"], novo


def caso_leque():
    z_cima = Polygon([(0, 600), (0, 300), (300, 400), (500, 300), (500, 600)])
    z_baixo = Polygon([(0, 0), (500, 0), (500, 300), (300, 200), (0, 300)])
    z_meio = Polygon([(0, 300), (300, 400), (500, 300), (300, 200)])
    novo = Polygon([(0, 0), (900, 0), (900, 600), (0, 600)])
    return ("7. LEQUE — duas divisas divergem e criam face sem zona antiga",
            [z_cima, z_baixo, z_meio], ["Alta", "Baixa", "Média"], novo)


def caso_sliver():
    z1 = Polygon([(0, 0), (1000, 0), (1000, 300), (0, 300)])
    z2 = Polygon([(0, 300), (1000, 300), (1000, 301.2), (0, 301.2)])
    z3 = Polygon([(0, 301.2), (1000, 301.2), (1000, 600), (0, 600)])
    novo = Polygon([(0, 0), (1000, 0), (1000, 600), (0, 600)])
    return "8. Faixa-estilha de 1,2 m no arquivo antigo", [z1, z2, z3], ["A", "Fina", "B"], novo


def caso_sinuosa():
    """Divisa muito sinuosa (serra de 8 m de amplitude, período ~138 m) que
    morre a 360 m da borda nova. A trajetória 'lógica' NÃO é a ondulação."""
    rng = np.random.default_rng(3)
    xs = np.arange(0, 648, 8.0)
    ys = 300 + 8 * np.sin(xs / 22.0) + rng.uniform(-1.5, 1.5, len(xs))
    linha = list(zip(xs, ys))
    z1 = Polygon([(0, 0), (640, 0)] + linha[::-1])
    z2 = Polygon([(0, 600), (640, 600)] + linha[::-1])
    novo = Polygon([(0, 0), (1000, 0), (1000, 600), (0, 600)])
    return "9. Divisa MUITO SINUOSA que não alcança — não replicar a ondulação", [z1, z2], ["A", "B"], novo


def caso_reserva():
    """Zoneamento antigo cobria só a faixa de baixo. A ponta da divisa mira a
    RESERVA (furo do talhão novo), 40 m acima: tem de parar no anel do furo."""
    z1 = Polygon([(0, 0), (400, 0), (400, 180), (0, 180)])
    z2 = Polygon([(400, 0), (1000, 0), (1000, 180), (400, 180)])
    furo = Polygon([(340, 220), (460, 220), (460, 380), (340, 380)])
    novo = Polygon([(-30, -30), (1030, -30), (1030, 630), (-30, 630)]).difference(furo)
    return "10. Ponta MIRA A RESERVA — tem de parar no furo", [z1, z2], ["A", "B"], novo


def caso_sujo():
    """Arquivo de terceiro DE VERDADE: as mesmas 4 faixas, mas cada zona
    digitalizada por conta própria — vértices densos com jitter de ±0,6 m nas
    divisas, o que gera gaps E sobreposições ao longo de toda a fronteira."""
    rng = np.random.default_rng(11)
    xs = np.arange(0, 1001, 25.0)
    zonas, cls = [], []
    for k, (y0, y1) in enumerate(((0, 150), (150, 300), (300, 450), (450, 600))):
        base, topo = [], []
        for x in xs:
            base.append((x, y0 + (rng.uniform(-0.6, 0.6) if 0 < y0 < 600 else 0)))
            topo.append((x, y1 + (rng.uniform(-0.6, 0.6) if 0 < y1 < 600 else 0)))
        zonas.append(Polygon(base + topo[::-1]))
        cls.append("ABCD"[k])
    novo = Polygon([(50, -40), (1080, -40), (1080, 680), (50, 680)])
    return "11. ARQUIVO SUJO — jitter de ±0,6 m gerando gaps e sobreposições", zonas, cls, novo


def demo_trajetoria():
    print("\n=== ESTRATÉGIAS DE PROLONGAMENTO — arco R=600 m, vértices a ~10 m, ruído ±0,4 m ===")
    rng = np.random.default_rng(7)
    R, cx, cy = 600.0, 500.0, -300.0
    pts = []
    for a in np.linspace(50, 130, 80):
        r = R + rng.uniform(-0.4, 0.4)
        pts.append((cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a))))
    l = LineString(pts[::-1])
    p1, p0 = np.array(l.coords[-1]), np.array(l.coords[-2])
    da = (p1 - p0) / np.linalg.norm(p1 - p0)
    tip, d, kappa, Ld, dg = trajetoria(l, True)
    # azimute verdadeiro da tangente do arco na ponta
    ang_tip = math.atan2(p1[1] - cy, p1[0] - cx)
    az_true = math.degrees(ang_tip - math.pi / 2) % 360 - 360
    print(f"  verdade      : azimute {az_true:7.2f}°, raio 600 m")
    print(f"  (a) últ. seg.: azimute {math.degrees(math.atan2(da[1], da[0])):7.2f}°  "
          f"(segmento de {np.linalg.norm(p1 - p0):.2f} m — refém de 1 vértice)")
    print(f"  (b) regressão: azimute {math.degrees(math.atan2(d[1], d[0])):7.2f}°  "
          f"(N={dg['janela_m']:.0f} m, {dg['n_vert']} vértices originais, "
          f"{dg['inflex']:.2f} inflexões/100 m)")
    print(f"  (c) curvatura: modo={dg['modo']}, raio estimado={dg['raio_m']:.0f} m, "
          f"ΔR²={dg.get('dR2', 0):.3f}, rms={dg.get('rms_m', 0):.2f} m")

    def erro(ps):
        return max(abs(math.hypot(x - cx, y - cy) - R) for x, y in ps)
    for L in (100, 200, 300):
        er = erro(raio_prolongado(tip, d, 0.0, Ld, L))
        ec = erro(raio_prolongado(tip, d, kappa, Ld, L))
        print(f"  desvio máx. do arco VERDADEIRO em {L:3d} m: reta = {er:5.1f} m | curvatura = {ec:5.1f} m")
    # comparação com "distância mais curta" (o que o usuário NÃO quer)
    borda = LineString([(-300, -50), (1500, -50)])
    li, arco = primeiro_encontro(raio_prolongado(tip, d, kappa, Ld, 800.0), borda)
    perp = Point(tip).distance(borda)
    print(f"  encosta na borda a {arco:.0f} m pela trajetória, em x={li.coords[-1][0]:.0f} — "
          f"a distância MAIS CURTA seria {perp:.0f} m em x={tip[0]:.0f} (perpendicular)")


if __name__ == "__main__":
    demo_trajetoria()
    for f in (caso_faixas, caso_L, caso_curva, caso_carreador, caso_gap_fino,
              caso_toco, caso_leque, caso_sliver, caso_sinuosa, caso_reserva, caso_sujo):
        nome, zonas, cls, novo = f()
        try:
            rel(nome, reajustar(zonas, cls, novo), novo)
        except Exception as e:
            import traceback
            print(f"\n=== {nome} ===\n  ERRO: {e}")
            traceback.print_exc()
