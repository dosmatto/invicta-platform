"""INCORPORAR DIVISAS INTERNAS AO POLÍGONO ATUAL.

Pedido do agrônomo: ele tem um zoneamento ANTIGO cujo contorno não bate mais
com o polígono ATUAL do talhão — partes das zonas ultrapassam o limite novo,
outras não alcançam. O trabalho agronômico que vale está nas DIVISAS INTERNAS
(as fronteiras entre zonas); o contorno externo antigo é lixo.

A ferramenta descarta o contorno velho, aproveita as divisas internas, ESTICA
as que morrem antes do limite novo, CORTA as que passam, e reparticiona o
talhão atual nessas divisas — cada face herdando a classe da zona antiga.

O PONTO CENTRAL, e é exigência textual do usuário: "não é para esticar a linha
interna pela distância mais curta, mas q acompanhe a trajetória lógica da
linha." Não é preciosismo. Medido num arco real de R=600 m: pela trajetória a
divisa encosta na borda a 284 m; pela perpendicular, a 210 m — 190 m de
diferença no ponto em que a nova divisa toca o limite. É a diferença entre uma
zona que faz sentido e uma que corta o talhão no lugar errado.

Por isso o prolongamento NÃO usa só o último segmento (é refém de UM vértice:
divisa vinda de raster tem passo de ~1 pixel, e um segmento de 30 cm pode
apontar 90° fora). Usa uma janela adaptativa com ajuste quadrático, e continua
a CURVATURA quando ela se justifica — uma divisa que vinha curvando chega ao
limite curvando. Medido: desvio de 12,6 m em 200 m de prolongamento, contra
34,8 m da reta.

ORDEM QUE NÃO PODE MUDAR:
  curar → extrair → RECORTAR → detectar pontas → costurar → prolongar →
  ancorar → polygonizar → absorver estilhas → herdar
Prolongar antes de recortar produziria prolongamento a partir de ponta que já
está fora do talhão.

Validado por 11 casos sintéticos (talhão em L, divisa curva, carreador, leque,
reserva, arquivo sujo…) — todos com |Σfaces − talhão| = 0 m² e zero
sobreposição. Ver scripts/teste-reajuste-divisas.py.
"""

from typing import Any

import math

import numpy as np
import shapely
from shapely.geometry import LineString, MultiPoint, Point, Polygon
from shapely.ops import linemerge, polygonize, substring, unary_union

from interp import _tf_local, _tf_geo, _para_graus, _so_poligonos, _multi, COBERTURA_TOL_M2

P = {
    "GRADE_M": 0.01,          # set_precision: mata ruído de dígito do arquivo de terceiro
    "GAP_MAX_M": 8.0,         # vão até esta largura entre zonas é fechado na cura
    "GAP_AREA_MAX_M2": 20000.0,
    "JANELA_M": 30.0,         # N base da janela de trajetória
    "JANELA_VERT": 6,         # ...mas ao menos 6 vértices ORIGINAIS dentro dela
    "JANELA_MAX_M": 150.0,
    "JANELA_MIN_M": 8.0,
    "JANELA_FRAC": 0.35,      # ...e no máximo 35% do comprimento da divisa
    "PASSO_AMOSTRA_M": 1.0,   # reamostragem uniforme dentro da janela
    "MIN_VERT_CURVA": 6,      # menos vértices ORIGINAIS que isto: sem curvatura
    "GANHO_R2": 0.05,         # curvatura só entra se melhorar o ajuste nisto
    "R_MIN_M": 40.0,          # raio mínimo aceito (κ clampado em 1/40 m⁻¹)
    "GIRO_MAX_GRAUS": 60.0,   # giro acumulado máximo do prolongamento inteiro
    "DECAI_MULT": 1.0,        # κ(s) = κ0·exp(−s/(mult·N)) — curvatura DECAI
    "DECAI_FORTE": 4.0,       # ...mult maior quando N e 2N concordam (tendência real)
    "INFLEX_100M": 0.5,       # >0,5 inflexão por 100 m (na escala N) = linha OSCILANTE
    "SINUOSA_FRAC": 0.15,     # resíduo RMS > isto×N ⇒ linha sinuosa: sem curvatura
    "PASSO_EXT_M": 1.0,       # passo de integração do prolongamento
    "LMAX_MULT": 3.0,         # alcance ≤ 3× o comprimento da própria divisa
    "LMAX_DIAM": 0.5,         # ...e ≤ 50% da diagonal do talhão
    "LMAX_ABS_M": 1000.0,
    "TOL_ENCOSTE_M": 0.5,     # ponta a menos disto do alvo já conta como encostada
    "COSTURA_M": 25.0,        # duas pontas livres a menos disto podem ser costuradas
    "COSTURA_ANG": 35.0,      # ...se ambas apontarem uma para a outra dentro disto
    "DIVISA_MIN_M": 2.0,      # pedaço de linha menor que isto é cavaco
    "COMP_MIN_FRAC": 0.02,    # componente com <2% da área da própria classe = caco
    "ADJ_TOL_M": 0.2,         # tolerância de adjacência (borda compartilhada frouxa)
    "RECONECTA_M": 3.0,       # pontas de divisa a menos disto são o MESMO traço partido por ruído
    "SIMPLIFICA_M": 0.05,     # Douglas-Peucker: SÓ tira vértice duplicado/colinear.
                              # Cuidado: 0,5 m já apaga a curvatura de um arco de R=600 m
                              # (flecha de 4 cm por vértice) — o caso 3 saiu reto com 0,5.
    "SLIVER_M2": 250.0,       # face menor que isto é ruído (= RUIDO_M2 do interp.py)
    "LARGURA_MIN_M": 3.0,     # face com largura média menor que isto é estilha
    "AREA_MIN_HA": 0.5,       # zona operacionalmente pequena demais
    "COBERTURA_TOL_M2": 5.0,  # |Σ faces − talhão| acima disto = falha de reconstrução
    "HERANCA_MIN_FRAC": 0.50, # sobreposição abaixo disto ⇒ classe marcada incerta
}


# ── utilidades ───────────────────────────────────────────────────────────────
def _polys(g):
    if g is None or g.is_empty:
        return []
    if g.geom_type == "Polygon":
        return [g]
    if g.geom_type in ("MultiPolygon", "GeometryCollection"):
        out = []
        for x in g.geoms:
            out.extend(_polys(x))
        return out
    return []


def _linhas(g):
    if g is None or g.is_empty:
        return []
    if g.geom_type == "LineString":
        return [g] if g.length > 0 else []
    if g.geom_type in ("MultiLineString", "GeometryCollection"):
        out = []
        for x in g.geoms:
            out.extend(_linhas(x))
        return out
    return []


def _merge(g):
    """linemerge que aguenta 1 linha só, vazio e GeometryCollection."""
    ls = _linhas(g)
    if len(ls) <= 1:
        return ls
    return _linhas(linemerge(ls))


def _quebrar(linha, pontos, tol=0.05):
    """Parte a linha nos vértices que coincidem com `pontos`. Necessário porque
    o linemerge cola duas divisas que se encontravam num nó do CONTORNO ANTIGO
    (podendo até fechar um anel) — e esse nó, com o contorno antigo descartado,
    virou uma PONTA SOLTA que precisa ser prolongada."""
    cs = list(linha.coords)
    fechada = linha.is_closed
    def idx_de(p):
        d, k = min(((p.distance(Point(c)), k) for k, c in enumerate(cs)))
        return k if d <= tol else None
    cortes = sorted({k for k in (idx_de(p) for p in pontos) if k is not None})
    if fechada and cortes:
        k0 = cortes[0]
        cs = cs[k0:-1] + cs[:k0 + 1]
        cortes = sorted({(k - k0) % (len(cs) - 1) for k in cortes})
    cortes = [k for k in cortes if 0 < k < len(cs) - 1]
    if not cortes:
        return [linha]
    out, ini = [], 0
    for k in cortes + [len(cs) - 1]:
        if k - ini >= 1:
            out.append(LineString(cs[ini:k + 1]))
        ini = k
    return [l for l in out if l.length > 0]


# ─────────────────────────────────────────────────────────────────────────────
# ETAPA 1 — CURA DA COBERTURA ANTIGA + EXTRAÇÃO DAS DIVISAS INTERNAS
#
# Não dá para confiar num FeatureCollection de terceiro: ele tem gaps e
# sobreposições. Tentar `boundary.difference(uniao.boundary)` num arranjo sujo
# não funciona — um gap de 20 cm vira DUAS divisas paralelas e a diferença
# apaga as duas. Então reconstruímos primeiro a PARTIÇÃO (é o mesmo caminho do
# `suavizar_zonas` em interp.py): polygonize de todas as bordas → cada face
# recebe UMA dona → dissolve. Depois disso as zonas curadas compartilham
# arestas IDÊNTICAS e a diferença com o anel externo é exata.
# ─────────────────────────────────────────────────────────────────────────────
def curar_cobertura(zonas, classes, avisos):
    zs, cls = [], []
    for z, c in zip(zonas, classes):
        for p in _polys(shapely.set_precision(shapely.make_valid(z), P["GRADE_M"])):
            if p.area > 0:
                zs.append(p)
                cls.append(c)

    U0 = unary_union(zs)
    faces = [f for f in polygonize(_linhas(unary_union([z.boundary for z in zs]))) if f.area > 0]

    # vãos FINOS que tocam a borda (carreador apagado, digitalização frouxa) não
    # viram face pelo polygonize — a união fica partida. Recupera por fecho
    # morfológico e devolve como face órfã.
    # ATENÇÃO: só o que o polygonize NÃO cobriu. Um vão ENCERRADO entre duas
    # zonas já vira face aqui; se o fecho morfológico for somado por cima, as
    # faces passam a se sobrepor, o dissolve deixa de ser partição e a extração
    # de divisas desanda (foi assim que o caso 11 saiu com 130 cacos).
    g = P["GAP_MAX_M"] / 2.0
    cob = unary_union(faces) if faces else U0
    fecho = U0.buffer(g, join_style=2).buffer(-g, join_style=2).difference(cob)
    for v in _polys(fecho):
        if v.area > P["GRADE_M"] and v.area < P["GAP_AREA_MAX_M2"] and (v.area / max(v.length, 1e-9)) <= g:
            faces.append(v)

    donos, n_sobrep = [], 0
    for f in faces:
        rp = f.representative_point()
        dentro = [i for i, z in enumerate(zs) if z.contains(rp)]
        if len(dentro) > 1:
            n_sobrep += 1
            dentro.sort(key=lambda i: -zs[i].area)
        donos.append(dentro[0] if dentro else -1)

    def e_vao(f):
        """Vão de digitalização (fecha) x FURO REAL — reserva, açude, benfeitoria
        (preserva). Critério: pequeno OU fino."""
        return f.area < P["GAP_AREA_MAX_M2"] or (f.area / max(f.length, 1e-9)) <= P["GAP_MAX_M"] / 2.0

    n_gap, area_gap = 0, 0.0
    for k, f in enumerate(faces):
        if donos[k] == -1 and not e_vao(f):
            donos[k] = -2   # furo real: fica de fora do zoneamento antigo
            avisos.append(f"furo de {f.area / 1e4:.2f} ha no zoneamento antigo PRESERVADO "
                          f"(reserva/açude?) — não foi tratado como vão")
    for _ in range(4):
        mudou = False
        for k, f in enumerate(faces):
            if donos[k] != -1:
                continue
            melhor, dono = 0.0, -1
            fb = f.buffer(P["ADJ_TOL_M"])
            for j, gg in enumerate(faces):
                if j == k or donos[j] < 0:
                    continue
                L = f.boundary.intersection(gg.boundary).length or fb.intersection(gg).area
                if L > melhor:
                    melhor, dono = L, donos[j]
            if dono >= 0:
                donos[k], mudou = dono, True
                n_gap += 1
                area_gap += f.area
        if not mudou:
            break
    if n_sobrep:
        avisos.append(f"{n_sobrep} sobreposição(ões) no arquivo antigo — resolvidas em favor da zona maior")
    if n_gap:
        avisos.append(f"{n_gap} vão(s) no arquivo antigo ({area_gap:.0f} m²) — costurados na zona vizinha")

    # Dissolve pela IDENTIDADE DA ZONA — NUNCA pelo rótulo da classe.
    #
    # A primeira versão dissolvia por classe, com o raciocínio "divisa entre duas
    # zonas de mesma classe não é divisa agronômica". Está errado, e quebrou feio
    # no MCACA 22: 13 zonas com ~5 rótulos (Alta, Média, Baixa, Média-alta,
    # Média-baixa) viraram 2. As divisas entre zonas vizinhas de mesmo rótulo
    # foram APAGADAS, sobraram cacos de 5 a 17 m que não alcançavam nada, e o
    # talhão inteiro virou uma mancha só.
    #
    # O rótulo é uma leitura do potencial; a ZONA é a unidade de manejo que o
    # agrônomo desenhou. Duas zonas "Alta" lado a lado continuam sendo duas
    # zonas — a linha entre elas é justamente o trabalho que esta ferramenta
    # existe para preservar.
    por_zona = {}
    for k, f in enumerate(faces):
        if donos[k] >= 0:
            por_zona.setdefault(cls[donos[k]], []).append(f)
    curadas = [unary_union(v) for v in por_zona.values()]
    nomes = list(por_zona.keys())
    curadas, nomes = _absorver_componentes(curadas, nomes, avisos)
    return _tapar_furos(curadas, nomes, avisos)


def _tapar_furos(curadas, nomes, avisos):
    """Rede de segurança: qualquer FURO de vão que ainda reste na união curada
    é fatal para a extração de divisas — o anel do furo entra em U.boundary, a
    diferença arranca a divisa naquele trecho e a fronteira sai picotada. Furo
    pequeno/fino é entregue à classe de maior borda; furo grande é preservado
    (reserva) e apenas anunciado."""
    U = unary_union(curadas)
    furos, n = [], 0
    for pol in _polys(U):
        for anel in pol.interiors:
            furos.append(Polygon(anel))
    for h in furos:
        if not (h.area < P["GAP_AREA_MAX_M2"] or (h.area / max(h.length, 1e-9)) <= P["GAP_MAX_M"] / 2.0):
            avisos.append(f"furo de {h.area / 1e4:.2f} ha PRESERVADO na união antiga (reserva/açude?)")
            continue
        melhor, j = 0.0, -1
        hb = h.buffer(P["ADJ_TOL_M"])
        for w, z in enumerate(curadas):
            L = h.boundary.intersection(z.boundary).length or hb.intersection(z).area
            if L > melhor:
                melhor, j = L, w
        if j >= 0:
            curadas[j] = unary_union([curadas[j], h])
            n += 1
    if n:
        avisos.append(f"{n} furo(s) de vão tapado(s) na união do zoneamento antigo")
    return curadas, nomes


def _absorver_componentes(curadas, nomes, avisos):
    """Depois do dissolve ainda sobram COMPONENTES SOLTOS: numa fronteira com
    jitter, gap e sobreposição se alternam e algumas lentes de ruído acabam
    numa classe que não é a do entorno. Cada componente-estilha vira boca do
    vizinho de maior borda. Sem isto, a fronteira A|B sai picotada em dezenas
    de 'divisas' e o prolongamento tenta esticar cada caco."""
    comps = [[i, p] for i, z in enumerate(curadas) for p in _polys(z) if p.area > 0]

    total = {}
    for i, p in comps:
        total[i] = total.get(i, 0.0) + p.area

    def estilha(i, p):
        return (p.area < P["SLIVER_M2"]
                or (p.area / max(p.length, 1e-9)) < P["LARGURA_MIN_M"] / 2.0
                or p.area < P["COMP_MIN_FRAC"] * total.get(i, p.area))

    n = 0
    for _ in range(len(comps) + 1):
        alvo = None
        for k, (i, p) in enumerate(comps):
            if estilha(i, p):
                alvo = k if alvo is None or p.area < comps[alvo][1].area else alvo
        if alvo is None:
            break
        i, p = comps.pop(alvo)
        melhor, j = 0.0, -1
        for w, (i2, q) in enumerate(comps):
            L = p.boundary.intersection(q.boundary).length
            if L > melhor:
                melhor, j = L, w
        if j < 0:
            comps.append([i, p])
            break
        comps[j][1] = unary_union([comps[j][1], p])
        n += 1
    if n:
        avisos.append(f"{n} componente(s)-estilha do arquivo antigo absorvido(s) na classe vizinha")
    saida = {}
    for i, p in comps:
        saida.setdefault(i, []).append(p)
    return [unary_union(v) for v in saida.values()], [nomes[i] for i in saida]


def _reconectar(partes):
    """Costura de RUÍDO (≠ da costura de carreador, que é de metros e olha
    ângulo): numa fronteira com jitter, o mesmo traço sai partido em dezenas de
    cacos separados por centímetros. Emenda ponta a ponta abaixo de RECONECTA_M
    e re-funde. Sem isto o prolongamento tenta esticar cada caco."""
    for _ in range(4):
        pontas = []
        for k, l in enumerate(partes):
            if not l.is_closed:
                pontas.append((k, 0, Point(l.coords[0])))
                pontas.append((k, 1, Point(l.coords[-1])))
        emendas, usadas = [], set()
        for u in range(len(pontas)):
            if u in usadas:
                continue
            for v in range(u + 1, len(pontas)):
                if v in usadas or pontas[u][0] == pontas[v][0]:
                    continue
                d = pontas[u][2].distance(pontas[v][2])
                if 1e-9 < d <= P["RECONECTA_M"]:
                    emendas.append(LineString([pontas[u][2], pontas[v][2]]))
                    usadas.update({u, v})
                    break
        if not emendas:
            break
        partes = _merge(unary_union(partes + emendas))
    return partes


def divisas_internas(zonas_curadas, avisos):
    """Só as fronteiras INTERNAS. O anel externo da união É o contorno antigo,
    que não vale mais — e os nós onde as divisas o encontravam viram pontas."""
    U = unary_union(zonas_curadas)
    todas = unary_union([z.boundary for z in zonas_curadas])
    internas = todas.difference(U.boundary)
    if internas.is_empty:
        internas = todas.difference(U.boundary.buffer(P["GRADE_M"] * 10))

    contatos = []
    toca = internas.intersection(U.boundary)
    for g in getattr(toca, "geoms", [toca]):
        if g.geom_type == "Point":
            contatos.append(g)

    # PODA + FUSÃO alternadas. Um toco de 40 cm pendurado na fronteira cria um
    # nó de grau 3 e o linemerge se recusa a atravessá-lo: a divisa sai partida
    # em dezenas de pedaços de 10–30 m, cada um virando "divisa" com ponta
    # solta. Podar antes de fundir é o que devolve UMA divisa por fronteira.
    partes = _merge(internas)
    for _ in range(6):
        n0 = len(partes)
        partes = [l for l in partes if l.length >= P["DIVISA_MIN_M"]]
        partes = _reconectar(partes)
        partes = _merge(unary_union(partes)) if partes else []
        if len(partes) == n0:
            break

    quebradas = []
    for l in partes:
        quebradas.extend(_quebrar(l, contatos))
    partes = [l.simplify(P["SIMPLIFICA_M"], preserve_topology=False) for l in quebradas]
    curtos = [l for l in partes if l.length < P["DIVISA_MIN_M"]]
    partes = [l for l in partes if l.length >= P["DIVISA_MIN_M"]]
    if curtos:
        avisos.append(f"{len(curtos)} cavaco(s) de divisa < {P['DIVISA_MIN_M']:.0f} m descartado(s)")
    return partes, U


# ─────────────────────────────────────────────────────────────────────────────
# ETAPA 2 — TRAJETÓRIA DA PONTA (o coração)
#
# (a) direção do ÚLTIMO SEGMENTO: refém de um vértice ruim. Divisa vinda de
#     raster tem passo de ~1 pixel; um segmento de 30 cm pode apontar 90° fora.
# (b) REGRESSÃO na janela dos últimos N m, com reamostragem UNIFORME (senão a
#     densidade irregular de vértices pesa o ajuste): estável, mas sai reta.
# (c) CURVATURA: ajuste quadrático no referencial local (t,n) da regressão —
#     equivale a um círculo osculador, mas é mais estável de resolver e já
#     entrega κ. Só entra se explicar a linha melhor que a reta, com κ clampado
#     e DECAINDO ao longo do prolongamento.
# ─────────────────────────────────────────────────────────────────────────────
def _janela(linha, no_fim, jan):
    L = linha.length
    jan = min(jan, L)
    sub = substring(linha, L - jan, L) if no_fim else substring(linha, jan, 0.0)
    if sub.geom_type != "LineString" or sub.length <= 0:
        sub = LineString(list(linha.coords) if no_fim else list(linha.coords)[::-1])
    return sub


def _ajuste(sub):
    """PCA na janela reamostrada + ajuste quadrático no referencial local.
    Devolve (tip, t, nv, slope_reta, slope_quad, kappa_bruto, rms, dR2)."""
    n = max(3, int(round(sub.length / P["PASSO_AMOSTRA_M"])) + 1)
    ds = sub.length / (n - 1)
    Q = np.array([[p.x, p.y] for p in (sub.interpolate(i * ds) for i in range(n))])
    m = Q.mean(axis=0)
    X = Q - m
    _, _, V = np.linalg.svd(X, full_matrices=False)
    t = V[0] / np.linalg.norm(V[0])
    if np.dot(t, Q[-1] - Q[0]) < 0:
        t = -t
    nv = np.array([-t[1], t[0]])
    a, b = X @ t, X @ nv
    sst = float(((b - b.mean()) ** 2).sum())
    c1 = np.polyfit(a, b, 1)
    r2l = 1.0 - float(((b - np.polyval(c1, a)) ** 2).sum()) / sst if sst > 1e-12 else 1.0
    c2 = np.polyfit(a, b, 2)
    res = b - np.polyval(c2, a)
    rms = float(np.sqrt((res ** 2).mean()))
    r2q = 1.0 - float((res ** 2).sum()) / sst if sst > 1e-12 else 1.0
    a_tip = float(np.dot(Q[-1] - m, t))
    sq = float(2 * c2[0] * a_tip + c2[1])
    k = float(2 * c2[0] / (1 + sq ** 2) ** 1.5)
    return np.array(Q[-1]), t, nv, float(c1[0]), sq, k, rms, r2q - r2l


def _inflexoes_100m(linha, h):
    """Densidade de INFLEXÕES medida na escala h (= a janela do ajuste). É o que
    separa 'divisa curva' (arco, curva de nível: 0 inflexão) de 'divisa
    oscilante' (serrilhado de vetorização: várias por 100 m). Reamostrar em h
    antes de contar é essencial — no passo do vértice o ruído domina e TUDO
    parece oscilante."""
    L = linha.length
    n = int(L // max(h, 1.0))
    if n < 3:
        return 0.0
    Q = np.array([[p.x, p.y] for p in (linha.interpolate(i * L / n) for i in range(n + 1))])
    v = Q[1:] - Q[:-1]
    cr = v[:-1, 0] * v[1:, 1] - v[:-1, 1] * v[1:, 0]
    esc = np.median(np.abs(cr)) if len(cr) else 0.0
    sg = np.sign(np.where(np.abs(cr) < 0.15 * esc, 0.0, cr))
    sg = sg[sg != 0]
    trocas = int((sg[1:] != sg[:-1]).sum()) if len(sg) > 1 else 0
    return trocas / (L / 100.0)


def trajetoria(linha, no_fim):
    """(a) último segmento — refém de UM vértice: uma divisa vetorizada de
    raster tem passo de ~1 pixel e um segmento de 30 cm pode apontar 90° fora.
    (b) REGRESSÃO na janela dos últimos N m com reamostragem UNIFORME (senão a
    densidade irregular de vértices pesa o ajuste): estável, mas sai reta.
    (c) CURVATURA — ajuste quadrático no referencial (t,n) da regressão. Só
    entra se: houver vértices originais suficientes, explicar a linha melhor
    que a reta (ΔR²), NÃO for ruído sinuoso, e a curvatura medida em N
    CONCORDAR com a medida em 2N (senão é ondulação local, não tendência).
    A curvatura aceita é clampada em 1/R_MIN e DECAI ao longo do prolongamento."""
    L = linha.length
    cs = np.array(linha.coords)
    passos = np.hypot(*(cs[1:] - cs[:-1]).T)
    passo_med = float(np.median(passos)) if len(passos) else 1.0
    jan = max(P["JANELA_M"], P["JANELA_VERT"] * passo_med)
    jan = min(jan, P["JANELA_MAX_M"], max(P["JANELA_MIN_M"], L * P["JANELA_FRAC"]), L)

    sub = _janela(linha, no_fim, jan)
    n_vert = sum(1 for c in linha.coords if sub.distance(Point(c)) < 1e-6)
    inflex = _inflexoes_100m(linha, jan)
    tip, t, nv, s_lin, s_quad, kappa, rms, dR2 = _ajuste(sub)

    diag = {"n_vert": n_vert, "janela_m": sub.length, "modo": "reta", "inflex": inflex,
            "raio_m": float("inf"), "rms_m": rms, "dR2": dR2}
    slope, k = s_lin, 0.0
    if inflex > P["INFLEX_100M"]:
        diag["modo"] = f"reta (divisa OSCILANTE: {inflex:.2f} inflexões/100 m)"
    elif n_vert < P["MIN_VERT_CURVA"]:
        diag["modo"] = f"reta ({n_vert} vértice(s) original(is) na janela)"
    elif rms > P["SINUOSA_FRAC"] * sub.length:
        diag["modo"] = "reta (janela sinuosa: rms alto)"
    elif dR2 < P["GANHO_R2"]:
        diag["modo"] = "reta (curvatura não se justifica)"
    else:
        # coerência em 2N: se o sinal vira ou a magnitude explode, é ONDULAÇÃO
        k2 = None
        if L > 1.8 * sub.length:
            sub2 = _janela(linha, no_fim, min(2 * sub.length, L))
            k2 = _ajuste(sub2)[5]
        if k2 is not None and (k2 == 0 or kappa * k2 <= 0 or abs(kappa) > 3 * abs(k2)):
            diag["modo"] = "reta (curvatura oscila entre N e 2N)"
        else:
            k, slope = kappa, s_quad
            # concordância apertada entre N e 2N ⇒ tendência real, propaga longe;
            # concordância frouxa ⇒ decai rápido e vira reta em poucos metros.
            acordo = abs(kappa - k2) / abs(k2) if k2 else 9.9
            diag["decai"] = P["DECAI_FORTE"] if acordo < 0.5 else P["DECAI_MULT"]
            kmax = 1.0 / P["R_MIN_M"]
            if abs(k) > kmax:
                k, diag["clampado"] = math.copysign(kmax, k), True
            diag["modo"] = "curvatura"
            diag["raio_m"] = 1.0 / abs(k) if abs(k) > 1e-9 else float("inf")

    d = t + slope * nv
    return tip, d / np.linalg.norm(d), k, sub.length * diag.get("decai", P["DECAI_MULT"]), diag


def raio_prolongado(tip, d, kappa, jan, Lmax):
    """Integra a trajetória: κ(s) = κ0·exp(−s/(mult·N)); giro total limitado."""
    passo, Ld = P["PASSO_EXT_M"], max(jan, 1.0)   # jan já vem multiplicado pelo decaimento
    th, giro, s = math.atan2(d[1], d[0]), 0.0, 0.0
    x, y = float(tip[0]), float(tip[1])
    pts, lim = [(x, y)], math.radians(P["GIRO_MAX_GRAUS"])
    while s < Lmax:
        dth = kappa * math.exp(-s / Ld) * passo
        if abs(giro + dth) > lim:
            dth = math.copysign(max(0.0, lim - abs(giro)), dth)
        th += dth
        giro += dth
        x, y, s = x + passo * math.cos(th), y + passo * math.sin(th), s + passo
        pts.append((x, y))
    return pts


def primeiro_encontro(pts, alvos):
    """Para no PRIMEIRO encontro em ordem de COMPRIMENTO DE ARCO — seja com o
    contorno, com outra divisa ou com outro prolongamento. Como o contorno está
    entre os alvos, sair do talhão (L, reserva, furo) já é o primeiro encontro:
    nunca existe 'pula o vazio e volta a entrar'."""
    if alvos is None or alvos.is_empty:
        return None, None
    arco = 0.0
    for i in range(len(pts) - 1):
        seg = LineString([pts[i], pts[i + 1]])
        inter = seg.intersection(alvos)
        if not inter.is_empty:
            cand = []
            for g in getattr(inter, "geoms", [inter]):
                if g.geom_type == "Point":
                    cand.append(g)
                elif g.geom_type == "LineString":
                    cand += [Point(g.coords[0]), Point(g.coords[-1])]
            pa = Point(pts[i])
            cand = [c for c in cand if arco + pa.distance(c) > 0.05]
            if cand:
                c = min(cand, key=pa.distance)
                return LineString(pts[: i + 1] + [(c.x, c.y)]), arco + pa.distance(c)
        arco += seg.length
    return None, None


# ─────────────────────────────────────────────────────────────────────────────
# ETAPA 3 — PONTAS LIVRES, COSTURA E PROLONGAMENTO
# ─────────────────────────────────────────────────────────────────────────────
def pontas_livres(divisas, contorno):
    """Livre = não encosta no contorno NOVO e não cai no MIOLO de outra divisa.
    Encostar na ponta de outra divisa NÃO ancora: um nó onde só se encontram
    pontas (típico de duas divisas que morriam juntas no contorno ANTIGO)
    continua sendo beco sem saída para o polygonize — as duas têm de sair dali."""
    tol, borda, livres = P["TOL_ENCOSTE_M"], contorno.boundary, []
    for i, l in enumerate(divisas):
        if l.is_closed:
            continue
        for fim in (False, True):
            p = Point(l.coords[-1] if fim else l.coords[0])
            if borda.distance(p) <= tol:
                continue
            em_T = False
            for j, o in enumerate(divisas):
                if j == i or o.distance(p) > tol:
                    continue
                if min(Point(o.coords[0]).distance(p), Point(o.coords[-1]).distance(p)) > tol:
                    em_T = True
                    break
            if not em_T:
                livres.append((i, fim, p))
    return livres


def costurar(livres, dados, contorno, avisos):
    """Duas pontas livres que apontam uma para a outra a curta distância são o
    MESMO trabalho agronômico partido por um vão do arquivo (carreador
    apagado). Costura em ponte suave em vez de mandar as duas para a borda."""
    usadas, pontes, lim = set(), [], math.cos(math.radians(P["COSTURA_ANG"]))
    for u in range(len(livres)):
        if u in usadas:
            continue
        for v in range(u + 1, len(livres)):
            if v in usadas or livres[u][0] == livres[v][0]:
                continue
            p1, p2 = livres[u][2], livres[v][2]
            d = p1.distance(p2)
            if not (1e-6 < d <= P["COSTURA_M"]):
                continue
            w = np.array([p2.x - p1.x, p2.y - p1.y]) / d
            if np.dot(dados[u][1], w) < lim or np.dot(dados[v][1], -w) < lim:
                continue
            A, B = np.array([p1.x, p1.y]), np.array([p2.x, p2.y])
            c1, c2 = A + dados[u][1] * d / 3.0, B + dados[v][1] * d / 3.0
            pts = []
            for k in range(13):
                s = k / 12.0
                q = ((1 - s) ** 3 * A + 3 * (1 - s) ** 2 * s * c1
                     + 3 * (1 - s) * s ** 2 * c2 + s ** 3 * B)
                pts.append((float(q[0]), float(q[1])))
            ponte = LineString(pts)
            if contorno.covers(ponte):
                pontes.append(ponte)
                usadas.update({u, v})
                avisos.append(f"2 pontas soltas a {d:.1f} m foram COSTURADAS (vão do arquivo antigo)")
                break
    return pontes, usadas


def prolongar(divisas, contorno, avisos, stats):
    livres = pontas_livres(divisas, contorno)
    stats["pontas_livres"] = len(livres)
    if not livres:
        return [], [], []
    dados = [trajetoria(divisas[i], fim) for (i, fim, _) in livres]
    pontes, costuradas = costurar(livres, dados, contorno, avisos)

    diag = math.hypot(*(contorno.bounds[2] - contorno.bounds[0], contorno.bounds[3] - contorno.bounds[1]))
    fixo = unary_union([contorno.boundary] + divisas + pontes)
    exts = [None] * len(livres)
    for _ in range(3):
        novos = list(exts)
        for u, (i, fim, p) in enumerate(livres):
            if u in costuradas:
                novos[u] = None
                continue
            tip, d, kappa, jan, dg = dados[u]
            Lmax = min(P["LMAX_MULT"] * divisas[i].length, P["LMAX_DIAM"] * diag, P["LMAX_ABS_M"])
            outros = [e for w, e in enumerate(exts) if e is not None and w != u]
            alvos = unary_union([fixo] + outros) if outros else fixo
            novos[u] = primeiro_encontro(raio_prolongado(tip, d, kappa, jan, Lmax), alvos)[0]
        if all((a is None) == (b is None) for a, b in zip(novos, exts)) and any(e is not None for e in exts):
            exts = novos
            break
        exts = novos

    saida, perdidas, relato = [], [], []
    for u, (i, fim, p) in enumerate(livres):
        if u in costuradas:
            continue
        _, d, kappa, jan, dg = dados[u]
        if exts[u] is None:
            # NÃO gera um aviso por divisa: num arquivo sujo isso vira uma parede
            # de dezenas de linhas quase idênticas, que afoga o que de fato pede
            # decisão (classe que sumiu, empate na herança). O relato sai
            # AGREGADO no fim do laço.
            perdidas.append(i)
        else:
            saida.append(exts[u])
            if "OSCILANTE" in dg["modo"]:
                avisos.append(f"divisa #{i}: {dg['inflex']:.2f} inflexões/100 m (serrilhada) — "
                              f"prolongada em RETA, sem replicar a ondulação")
            fim_pt = Point(exts[u].coords[-1])
            onde = "contorno" if contorno.boundary.distance(fim_pt) <= 0.05 else "outra divisa/prolongamento"
            relato.append((i, exts[u].length, dg["modo"], dg["raio_m"], onde))
    # Relato AGREGADO dos descartes. Os comprimentos são o que informa: cacos de
    # vetorização vêm em metros; divisa de verdade sem alcance vem em centenas.
    if perdidas:
        comps = sorted(divisas[i].length for i in set(perdidas))
        cabeca = (f"{len(set(perdidas))} divisa(s) não alcançaram nada e foram DESCARTADAS "
                  f"(de {comps[0]:.0f} a {comps[-1]:.0f} m, somando {sum(comps):.0f} m)")
        if comps[-1] < 30.0:
            cabeca += (" — todas com menos de 30 m: são cacos de vetorização do arquivo "
                       "antigo, não divisas de manejo")
        avisos.append(cabeca)
    stats["prolongamentos"] = relato
    stats["n_esticadas"] = len(relato)
    stats["m_esticado"] = float(sum(r[1] for r in relato))
    stats["n_descartadas"] = len(set(perdidas))
    stats["n_costuradas"] = len(costuradas)
    return saida + pontes, perdidas, relato


# ─────────────────────────────────────────────────────────────────────────────
# ETAPAS 4 / 5 / 6 — RECORTE, REPARTIÇÃO, HERANÇA
# ─────────────────────────────────────────────────────────────────────────────
def recortar(divisas, contorno, avisos, stats):
    fora, out, antes, depois = 0, [], 0.0, 0.0
    for l in divisas:
        antes += l.length
        ps = [x for x in _linhas(l.intersection(contorno)) if x.length >= P["DIVISA_MIN_M"]]
        if not ps:
            fora += 1
            continue
        depois += sum(x.length for x in ps)
        out.extend(ps)
    stats["m_recortados"] = antes - depois
    # Métricas que o painel mostra. Antes NINGUÉM as preenchia e a tela exibia
    # "cortadas: 0 (0 m)" mesmo tendo recortado centenas de metros — mentira
    # silenciosa, e das piores: o usuário conferia o número e confiava.
    stats["m_cortado"] = max(0.0, antes - depois)
    stats["n_cortadas"] = sum(
        1 for l in divisas
        if abs(sum(x.length for x in _linhas(l.intersection(contorno))) - l.length) > 1.0
    )
    stats["n_fora"] = fora
    if antes - depois > 1.0:
        avisos.append(f"{antes - depois:.0f} m de divisa ULTRAPASSAVAM o contorno novo — recortados")
    if fora:
        avisos.append(f"{fora} divisa(s) inteiramente FORA do contorno novo — descartadas")
    return out


def ancorar(linhas, contorno):
    """Ponta a menos de TOL do contorno é grudada NELE. Sem isso, uma folga de
    1 cm deixa o anel aberto e o polygonize funde duas zonas em silêncio."""
    borda, out = contorno.boundary, []
    for l in linhas:
        cs = list(l.coords)
        for k in (0, -1):
            p = Point(cs[k])
            d = borda.distance(p)
            if 1e-12 < d <= P["TOL_ENCOSTE_M"]:
                q = shapely.ops.nearest_points(borda, p)[0]
                cs[k] = (q.x, q.y)
        out.append(LineString(cs))
    return out


def repartir(contorno, divisas, avisos, stats):
    rede = unary_union([contorno.boundary] + divisas)
    faces = [f for f in polygonize(_linhas(rede)) if f.area > 0]
    faces = [f for f in faces if contorno.covers(f.representative_point())]
    soma = sum(f.area for f in faces)
    stats["cobertura_pct"] = soma / contorno.area * 100.0
    if abs(soma - contorno.area) > P["COBERTURA_TOL_M2"]:
        avisos.append(f"FALHA DE COBERTURA: faces somam {soma:.1f} m² vs talhão {contorno.area:.1f} m²")
    return faces


def absorver_slivers(faces, avisos):
    def estilha(f):
        return f.area < P["SLIVER_M2"] or (f.area / max(f.length, 1e-9)) < (P["LARGURA_MIN_M"] / 2.0)

    faces, n = list(faces), 0
    for _ in range(len(faces) + 1):
        k = next((k for k, f in enumerate(faces) if estilha(f)), None)
        if k is None or len(faces) <= 1:
            break
        f = faces.pop(k)
        melhor, j = 0.0, -1
        for w, g in enumerate(faces):
            L = f.boundary.intersection(g.boundary).length
            if L > melhor:
                melhor, j = L, w
        if j < 0:
            faces.append(f)
            break
        faces[j] = unary_union([faces[j], f])
        n += 1
    if n:
        avisos.append(f"{n} face(s)-estilha absorvida(s) na vizinha de maior borda compartilhada")
    return faces


def herdar(faces, zonas_antigas, classes, avisos):
    out = []
    for f in faces:
        melhor, dono = 0.0, -1
        for i, z in enumerate(zonas_antigas):
            a = f.intersection(z).area
            if a > melhor:
                melhor, dono = a, i
        frac = melhor / f.area if f.area else 0.0
        if dono < 0 or melhor <= 0:
            out.append({"face": f, "classe": None, "origem": "sem_zona", "frac": 0.0})
        else:
            out.append({"face": f, "classe": classes[dono], "frac": frac,
                        "origem": "sobreposicao" if frac >= P["HERANCA_MIN_FRAC"] else "sobreposicao_fraca"})
    for k, r in enumerate(out):
        if r["classe"] is not None:
            continue
        cands = []
        for w, o in enumerate(out):
            if w != k and o["classe"] is not None:
                cands.append((r["face"].boundary.intersection(o["face"].boundary).length, w))
        cands.sort(reverse=True)
        melhor, j = (cands[0] if cands else (0.0, -1))
        if len(cands) > 1 and cands[1][0] > 0.9 * melhor and out[cands[1][1]]["classe"] != out[j]["classe"]:
            avisos.append(f"face #{k}: EMPATE na herança por vizinhança entre "
                          f"'{out[j]['classe']}' e '{out[cands[1][1]]['classe']}' — decida na mão")
        if j >= 0 and melhor > 0:
            r["classe"], r["origem"] = out[j]["classe"], "vizinho"
            avisos.append(f"face #{k} ({r['face'].area / 1e4:.2f} ha) caiu em ÁREA GANHA sem zona antiga — "
                          f"classe '{out[j]['classe']}' herdada do vizinho ({melhor:.0f} m de borda)")
        else:
            avisos.append(f"face #{k} ({r['face'].area / 1e4:.2f} ha) ficou SEM CLASSE")
    for k, r in enumerate(out):
        if r["origem"] == "sobreposicao_fraca":
            avisos.append(f"face #{k}: classe '{r['classe']}' com só {r['frac'] * 100:.0f}% de sobreposição — conferir")
        if r["face"].area / 1e4 < P["AREA_MIN_HA"]:
            avisos.append(f"face #{k}: {r['face'].area / 1e4:.2f} ha, abaixo do mínimo operacional "
                          f"({P['AREA_MIN_HA']} ha)")
    vivas = {r["classe"] for r in out}
    for c in classes:
        if c not in vivas:
            avisos.append(f"classe '{c}' do zoneamento antigo DESAPARECEU no talhão novo")
    return out


def reajustar(zonas, classes, contorno):
    avisos, stats = [], {}
    curadas, cls_c = curar_cobertura(zonas, classes, avisos)
    internas, U = divisas_internas(curadas, avisos)
    stats["n_divisas"] = len(internas)
    stats["m_divisas"] = sum(l.length for l in internas)
    internas = recortar(internas, contorno, avisos, stats)
    ext, perdidas, _ = prolongar(internas, contorno, avisos, stats)
    if perdidas:
        internas = [l for i, l in enumerate(internas) if i not in set(perdidas)]
    faces = repartir(contorno, ancorar(internas + ext, contorno), avisos, stats)
    faces = absorver_slivers(faces, avisos)
    res = herdar(faces, curadas, cls_c, avisos)
    stats["cobertura_final_pct"] = sum(r["face"].area for r in res) / contorno.area * 100.0
    stats["area_ganha_ha"] = max(0.0, contorno.difference(U).area) / 1e4
    stats["area_perdida_ha"] = max(0.0, U.difference(contorno).area) / 1e4
    return {"faces": res, "avisos": avisos, "stats": stats}


# ─────────────────────────────────────────────────────────────────────────────
# CAMADA PÚBLICA — graus ⇄ plano métrico local, e a resposta que o app consome
# ─────────────────────────────────────────────────────────────────────────────

def _chave_de(props: dict, i: int) -> str:
    """IDENTIDADE da zona — a unidade que a ferramenta preserva.

    `zona` primeiro (o número OFICIAL: duas manchas da mesma zona, "01" e
    "01_2", têm o mesmo `zona` e entram como UMA), depois `id`. O rótulo da
    classe NÃO entra: zonas vizinhas de mesmo rótulo são zonas diferentes, e
    dissolvê-las apaga a divisa que o agrônomo desenhou.

    Sem nenhuma chave, o índice garante que a zona não se funde com outra."""
    for k in ("zona", "id"):
        v = props.get(k)
        if v not in (None, ""):
            return str(v)
    return f"#{i}"


def _classe_de(props: dict) -> str:
    """Rótulo de POTENCIAL da zona — só para exibição/herança de properties."""
    for k in ("classe", "classeLabel", "potencial"):
        v = props.get(k)
        if v not in (None, ""):
            return str(v)
    return ""


def incorporar_divisas(fc: dict, poligono: dict) -> dict[str, Any]:
    """Reajusta o zoneamento `fc` ao contorno `poligono` (ambos em WGS84).

    Devolve `{fc, diff, resumo, avisos}` no mesmo formato de `suavizar_zonas`,
    para a tela reusar o painel de prévia que já existe.
    """
    feats = [f for f in (fc.get("features") or []) if f.get("geometry")]
    if not feats:
        raise ValueError("O zoneamento não tem nenhum polígono.")

    alvo_geo = shapely.geometry.shape(poligono)
    alvo_geo = shapely.make_valid(alvo_geo)
    if alvo_geo.is_empty:
        raise ValueError("O contorno do talhão está vazio ou inválido.")

    # Plano métrico local centrado no TALHÃO (não no zoneamento antigo: é o
    # contorno atual que manda, e é nele que a precisão importa).
    minx, miny, maxx, maxy = alvo_geo.bounds
    lon0, lat0 = (minx + maxx) / 2.0, (miny + maxy) / 2.0

    contorno = _multi(_so_poligonos(_tf_local(alvo_geo, lon0, lat0)))
    contorno = shapely.make_valid(contorno)

    zonas, chaves, props_por_zona = [], [], {}
    for i, f in enumerate(feats):
        try:
            g = shapely.geometry.shape(f["geometry"])
        except Exception:
            continue
        g = shapely.make_valid(_tf_local(g, lon0, lat0))
        polys = _so_poligonos(g)
        if not polys:
            continue
        ch = _chave_de(f.get("properties") or {}, i)
        zonas.append(_multi(polys))
        chaves.append(ch)
        # Properties da PRIMEIRA feição de cada zona: a face nova sai com a cor,
        # o número e a classe do original — senão o mapa perde a identidade.
        props_por_zona.setdefault(ch, dict(f.get("properties") or {}))

    if not zonas:
        raise ValueError("Nenhum polígono válido no zoneamento.")

    r = reajustar(zonas, chaves, contorno)
    faces_loc = [x["face"] for x in r["faces"]]
    if not faces_loc:
        raise ValueError("A reconstrução não produziu nenhuma zona — confira se o zoneamento cobre o talhão.")

    # Validação de cobertura OBRIGATÓRIA, a mesma régua do suavizar_zonas: se a
    # soma das faces não fecha com o talhão, o resultado NÃO sai. Numa ferramenta
    # cujo problema é exatamente "as divisas não fecham", esta checagem é o produto.
    uniao = unary_union(faces_loc)
    falta = abs(uniao.area - contorno.area)
    sobrep = sum(a.intersection(b).area
                 for i, a in enumerate(faces_loc) for b in faces_loc[i + 1:])
    if falta > COBERTURA_TOL_M2 or sobrep > COBERTURA_TOL_M2:
        raise ValueError(
            f"A reconstrução não fechou com o talhão (falta {falta:.1f} m², "
            f"sobreposição {sobrep:.1f} m²). O resultado não foi aplicado."
        )

    saida_geo = _para_graus(faces_loc, lon0, lat0)
    features = []
    for x, g in zip(r["faces"], saida_geo):
        base = dict(props_por_zona.get(x["classe"], {}))
        base.update({
            "zona": x["classe"],
            "classe": _classe_de(base) or x["classe"],
            "areaHa": round(x["face"].area / 1e4, 4),
            "heranca": x.get("origem", "sobreposicao"),
            "herancaFrac": round(float(x.get("frac", 1.0)), 4),
            "incerta": bool(x.get("incerta", False)),
        })
        features.append({"type": "Feature", "properties": base,
                         "geometry": shapely.geometry.mapping(g)})

    # DIFF: o que mudou em relação ao zoneamento antigo — é o que a prévia pinta
    # de amarelo. Área que o talhão ganhou + área que perdeu.
    antiga = unary_union(zonas)
    diff_feats = []
    for g, rot in ((contorno.difference(antiga), "ganha"), (antiga.difference(contorno), "perdida")):
        for p in _so_poligonos(g):
            if p.area < 1.0:
                continue
            for gg in _para_graus([p], lon0, lat0):
                diff_feats.append({"type": "Feature",
                                   "properties": {"tipo": rot, "areaHa": round(p.area / 1e4, 4)},
                                   "geometry": shapely.geometry.mapping(gg)})

    st = r["stats"]
    resumo = {
        "areaTalhaoHa": round(contorno.area / 1e4, 4),
        "nZonas": len(features),
        "nDivisas": int(st.get("n_divisas", 0)),
        "mDivisas": round(float(st.get("m_divisas", 0.0)), 1),
        "nEsticadas": int(st.get("n_esticadas", 0)),
        "mEsticado": round(float(st.get("m_esticado", 0.0)), 1),
        "nCortadas": int(st.get("n_cortadas", 0)),
        "mCortado": round(float(st.get("m_cortado", 0.0)), 1),
        "nDescartadas": int(st.get("n_descartadas", 0)),
        "areaGanhaHa": round(float(st.get("area_ganha_ha", 0.0)), 4),
        "areaPerdidaHa": round(float(st.get("area_perdida_ha", 0.0)), 4),
        "coberturaPct": round(float(st.get("cobertura_final_pct", 0.0)), 4),
        "faltaM2": round(falta, 3),
        "sobreposicaoM2": round(sobrep, 3),
    }
    return {
        "fc": {"type": "FeatureCollection", "features": features},
        "diff": {"type": "FeatureCollection", "features": diff_feats},
        "resumo": resumo,
        "avisos": list(r.get("avisos", [])),
    }
