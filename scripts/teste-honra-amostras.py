"""O MAPA TEM DE BATER COM OS PONTOS (backend/interp.py).

Reclamacao real (BOOK CG03, K 0-20 cm): amostras de 0,8 a 8,1 escritas no mapa,
e o mapa ia de 1,1 a 7,8. Nao e erro de conta — e ALISAMENTO: o no da grade nao
cai em cima do ponto e, com pepita > 0, a predicao a 2,5 m do ponto ja e puxada
para a media da vizinhanca.

Medido em 18 campos (6 sementes x 3 niveis de ruido, 36 amostras / 72 ha / 5 m),
comparando a politica anterior com a atual:

                         v28 (teto 10%)      v29 (teto 2%)
    amplitude guardada   59% a 97%           76% a 100%
    erro mediano @ ponto  3,7% a 19,4%        1,0% a 17,7%
    piorou                                    0 de 18 casos

Duas licoes que so apareceram na varredura ampla:
  • o teto de pepita sozinho nao bastava — `_krige_constrangido` tinha uma pepita
    de 10% da variancia fixa no codigo, fora do alcance do cap. Era ele que
    respondia por 6 dos 12 piores casos;
  • o modelo GAUSSIANO continua sendo o pior caso mesmo depois de tudo (ate 17,7%
    de erro mediano). E propriedade da forma do modelo na origem, nao pepita.

Roda: `npm run teste:honra`
"""
import math
import os
import sys
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


LON0, LAT0 = -48.30, -9.20
M_LAT = 111320.0
M_LON = 111320.0 * math.cos(math.radians(LAT0))
# Faixa diagonal de ~72 ha, a cara de um talhao de verdade.
POLY = {"type": "Polygon", "coordinates": [[
    [LON0, LAT0], [LON0 + 1400 / M_LON, LAT0 + 1030 / M_LAT],
    [LON0 + 1400 / M_LON, LAT0], [LON0, LAT0],
]]}


def campo(seed, ruido):
    """Tendencia suave + ruido. `ruido` = fracao da variancia que vira pepita.

    Os pontos ficam PROPOSITALMENTE fora dos nos da grade (deslocamento de 2,4 m
    e 1,3 m): se caissem em cima do no, a krigagem devolveria o valor exato e o
    teste nao mediria nada — foi o que quase escapou na primeira versao.
    """
    rng = np.random.default_rng(seed)
    pts = []
    for i in range(9):
        for j in range(9):
            px, py = 62.4 + i * 155.0, 61.3 + j * 110.0
            if py > (px / 1400.0) * 1030.0 - 40:
                continue
            tend = 2.0 + 3.0 * math.sin(px / 500.0) + 2.0 * math.cos(py / 400.0)
            v = tend * (1 - ruido) + ruido * rng.normal(2.8, 2.2)
            pts.append({"lng": LON0 + px / M_LON, "lat": LAT0 + py / M_LAT,
                        "valor": round(max(0.3, v), 1)})
    return pts


def medir(pts, **kw):
    kw.setdefault("pixel_m", 5.0)
    interp._cache.clear()
    g = interp.gerar_grid(pts, POLY, **kw)
    grid, gx, gy = g["grid"], g["gx"], g["gy"]
    z = np.array([p["valor"] for p in pts])
    fin = grid[np.isfinite(grid)]
    erros = []
    for p in pts:
        i = int(np.argmin(np.abs(gx - p["lng"])))
        j = int(np.argmin(np.abs(gy - p["lat"])))
        v = grid[j, i]
        if np.isfinite(v):
            erros.append(abs(v - p["valor"]) / max(p["valor"], 1e-9))
    amplitude = (fin.max() - fin.min()) / (z.max() - z.min())
    return {"g": g, "z": z, "fin": fin, "amplitude": amplitude,
            "err_mediano": float(np.median(erros)), "err_pior": float(max(erros))}


# Uma semente so nao prova nada: a primeira versao deste arquivo media apenas o
# campo 11 e dava tudo verde enquanto metade das outras sementes reprovava.
CASOS = [(s, r) for s in (3, 7, 11, 23) for r in (0.6, 1.0)]


def _krige_constrangido_v28(xm, ym, z, gxm, gym, modelo, spacing):
    """A versao anterior deste ramo: pepita fixa em 10% da variancia."""
    var = float(np.var(z)) or 1.0
    return interp._krige_fixo(xm, ym, z, gxm, gym, modelo, var, max(3.0 * spacing, 1.0), 0.10 * var)


def _com_regime_v28(fn):
    """Roda `fn` com a politica antiga (teto 10% + constrangido 10% da variancia)."""
    cap, kc = interp.NUGGET_MAX, interp._krige_constrangido
    interp.NUGGET_MAX, interp._krige_constrangido = 0.10, _krige_constrangido_v28
    try:
        return fn()
    finally:
        interp.NUGGET_MAX, interp._krige_constrangido = cap, kc


def _amplitude_preservada():
    ruins = []
    for seed, ruido in CASOS:
        r = medir(campo(seed, ruido))
        if r["amplitude"] < 0.75:
            ruins.append(f"seed {seed}/{ruido:.0%}: {r['amplitude']:.0%}")
    assert not ruins, (
        "mapa guardou menos de 75% da amplitude das amostras em: " + "; ".join(ruins))


def _erro_no_proprio_ponto():
    medianas = []
    for seed, ruido in CASOS:
        r = medir(campo(seed, ruido))
        medianas.append(r["err_mediano"])
        assert r["err_mediano"] <= 0.18, (
            f"seed {seed}/{ruido:.0%}: erro mediano de {r['err_mediano']:.1%} no "
            f"proprio ponto amostrado")
    tipico = float(np.median(medianas))
    assert tipico <= 0.05, f"erro mediano tipico de {tipico:.1%} (esperado <= 5%)"


def _nunca_pior_que_o_regime_antigo():
    """A afirmacao forte, e a unica que nao depende de um limiar escolhido a dedo:
    a politica nova nao piora NENHUM caso em relacao a anterior."""
    piores = []
    for seed, ruido in CASOS:
        pts = campo(seed, ruido)
        antes = _com_regime_v28(lambda: medir(pts))
        depois = medir(pts)
        if depois["amplitude"] < antes["amplitude"] - 0.01 or depois["err_mediano"] > antes["err_mediano"] + 0.005:
            piores.append(
                f"seed {seed}/{ruido:.0%}: amplitude {antes['amplitude']:.2f}->{depois['amplitude']:.2f}, "
                f"erro {antes['err_mediano']:.1%}->{depois['err_mediano']:.1%}")
    assert not piores, "a politica nova PIOROU casos: " + "; ".join(piores)


def _o_ramo_anti_degeneracao_tambem_respeita_o_teto():
    """`_krige_constrangido` tinha pepita de 10% da variancia fixa no codigo e
    esta no ramo `if`, entao o cap do `elif` nunca o alcancava. Era ele que
    sobrava alisando: 6 de 12 casos, todos com a assinatura pepita 9,1%."""
    for seed, ruido in CASOS:
        vg = medir(campo(seed, ruido))["g"]["variograma"]
        if vg is None:
            continue    # caiu para IDW: nao tem variograma para conferir
        rel = vg["pepita"] / vg["patamar"] if vg["patamar"] else 0.0
        assert rel <= interp.NUGGET_MAX + 1e-3, (
            f"seed {seed}/{ruido:.0%}: pepita em {rel:.1%} do patamar, acima do teto "
            f"de {interp.NUGGET_MAX:.0%} — a assinatura do ramo esquecido era 9,1%")


def _pepita_respeita_o_teto():
    for ruido in (0.6, 1.0):
        vg = medir(campo(11, ruido))["g"]["variograma"]
        assert vg is not None, "sem variograma (caiu para IDW?)"
        # +1e-4: o variograma devolvido vem arredondado em 4 casas.
        assert vg["pepita"] <= interp.NUGGET_MAX * vg["patamar"] + 1e-4, (
            f"pepita {vg['pepita']} passou do teto ({interp.NUGGET_MAX:.0%} de {vg['patamar']})")


def _teto_vale_com_modelo_forcado():
    # ANTES: `elif (not modelo_fixo) and ...` — escolher o modelo no seletor
    # desligava a guarda em silencio, e o mapa voltava a alisar.
    for modelo in ("spherical", "exponential", "gaussian"):
        vg = medir(campo(11, 1.0), modelo_fixo=modelo)["g"]["variograma"]
        assert vg is not None, f"{modelo}: sem variograma"
        assert vg["pepita"] <= interp.NUGGET_MAX * vg["patamar"] + 1e-4, (
            f"{modelo}: pepita {vg['pepita']} acima do teto de {interp.NUGGET_MAX:.0%}")


def _variograma_manual_e_do_usuario():
    # Krigagem fixa: os numeros sao digitados pelo usuario. O teto NAO se aplica —
    # seria sobrescrever a decisao dele.
    r = medir(campo(11, 1.0),
              variograma_manual={"alcance": 400.0, "patamar": 300.0, "pepita": 10.0})
    vg = r["g"]["variograma"]
    assert vg["pepita"] == 10.0 and vg["patamar"] == 300.0, f"variograma manual mexido: {vg}"
    assert vg.get("manual") is True


def _faixa_das_amostras_vem_na_resposta():
    pts = campo(11, 1.0)
    r = medir(pts)
    z = r["z"]
    fa = r["g"]["faixa_amostras"]
    assert fa is not None, "faixa_amostras ausente"
    assert abs(fa[0] - z.min()) < 1e-9 and abs(fa[1] - z.max()) < 1e-9, fa
    # e o grid tem de caber dentro dela — a garantia que o app confere de novo
    assert r["fin"].min() >= fa[0] - 1e-6 and r["fin"].max() <= fa[1] + 1e-6


def _nada_disso_tira_o_mapa_da_faixa():
    for ruido in (0.0, 0.3, 0.6, 1.0):
        r = medir(campo(23, ruido))
        z, fin = r["z"], r["fin"]
        assert fin.min() >= z.min() - 1e-6 and fin.max() <= z.max() + 1e-6, (
            f"ruido {ruido:.0%}: mapa [{fin.min():.2f},{fin.max():.2f}] "
            f"fora das amostras [{z.min():.2f},{z.max():.2f}]")


t("mapa guarda >= 75% da amplitude das amostras (8 campos)", _amplitude_preservada)
t("erro no proprio ponto: mediana tipica <= 5%, nenhum caso acima de 18%", _erro_no_proprio_ponto)
t("a politica nova NAO piora nenhum caso em relacao a anterior", _nunca_pior_que_o_regime_antigo)
t("o ramo anti-degeneracao tambem respeita o teto de pepita", _o_ramo_anti_degeneracao_tambem_respeita_o_teto)
t("pepita do auto-ajuste respeita o teto", _pepita_respeita_o_teto)
t("o teto vale TAMBEM com o modelo forcado no seletor", _teto_vale_com_modelo_forcado)
t("variograma manual (Krigagem fixa) fica como o usuario digitou", _variograma_manual_e_do_usuario)
t("a resposta carrega a faixa das amostras e o grid cabe nela", _faixa_das_amostras_vem_na_resposta)
t("nada disso tira o mapa da faixa das amostras", _nada_disso_tira_o_mapa_da_faixa)

print(f"\n{ok} passaram, {fail} falharam")
sys.exit(1 if fail else 0)
