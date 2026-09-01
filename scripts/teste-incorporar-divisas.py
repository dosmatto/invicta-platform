# -*- coding: utf-8 -*-
# CAMADA PÚBLICA de backend/divisas.py — entrada e saída em GRAUS (WGS84), que
# é como o app chama. O protótipo (teste-reajuste-divisas.py) cobre o algoritmo
# em metros; aqui o que se testa é a casca: projeção ida-e-volta, validação de
# cobertura, herança de properties e o formato da resposta.
#
# Rodar: ~/.invicta-fert-backend/venv/bin/python scripts/teste-incorporar-divisas.py

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

import shapely
from divisas import incorporar_divisas

ok = fail = 0


def t(nome, fn):
    global ok, fail
    try:
        fn(); ok += 1; print("  ✓", nome)
    except Exception as e:
        fail += 1; print("  ✗", nome, "—", e)


def eq(c, msg=""):
    if not c:
        raise AssertionError(msg)


# Talhão de ~100 ha perto de Carambeí (PR), 1000 m × 1000 m.
LON0, LAT0 = -50.10, -24.90
M_LON = 1.0 / (111320.0 * 0.9077)
M_LAT = 1.0 / 110540.0
gx = lambda m: LON0 + m * M_LON
gy = lambda m: LAT0 + m * M_LAT


def poly(pts):
    anel = [[gx(x), gy(y)] for x, y in pts]
    return {"type": "Polygon", "coordinates": [anel + [anel[0]]]}


TALHAO = poly([(0, 0), (1000, 0), (1000, 1000), (0, 1000)])


def zona(pts, classe, cor="#22c55e"):
    return {"type": "Feature",
            "properties": {"classe": classe, "cor": cor, "id": classe},
            "geometry": poly(pts)}


def fc(*feats):
    return {"type": "FeatureCollection", "features": list(feats)}


# Zoneamento que NÃO alcança o talhão (fica de 100 a 900): as divisas precisam
# esticar até a borda. Duas faixas verticais, divisa interna em x=500.
MENOR = fc(zona([(100, 100), (500, 100), (500, 900), (100, 900)], "Alta", "#ef4444"),
           zona([(500, 100), (900, 100), (900, 900), (500, 900)], "Baixa", "#3b82f6"))

# Zoneamento que ULTRAPASSA o talhão (de -200 a 1200): o excedente é cortado.
MAIOR = fc(zona([(-200, -200), (500, -200), (500, 1200), (-200, 1200)], "Alta"),
           zona([(500, -200), (1200, -200), (1200, 1200), (500, 1200)], "Baixa"))

print("\nIncorporar divisas — camada pública (graus)\n")

t("zoneamento MENOR que o talhão: as divisas esticam e o talhão fecha 100%", lambda: (
    (lambda r: (
        eq(abs(r["resumo"]["coberturaPct"] - 100.0) < 0.01, f"cobertura {r['resumo']['coberturaPct']}"),
        eq(r["resumo"]["faltaM2"] <= 5.0, f"falta {r['resumo']['faltaM2']} m²"),
        eq(r["resumo"]["nZonas"] == 2, f"esperava 2 zonas, veio {r['resumo']['nZonas']}"),
        eq(r["resumo"]["areaGanhaHa"] > 0, "o talhão cresceu — a área ganha tem de aparecer"),
    ))(incorporar_divisas(MENOR, TALHAO))))

t("zoneamento MAIOR que o talhão: o excedente é cortado", lambda: (
    (lambda r: (
        eq(abs(r["resumo"]["coberturaPct"] - 100.0) < 0.01, f"cobertura {r['resumo']['coberturaPct']}"),
        eq(r["resumo"]["areaPerdidaHa"] > 0, "a área perdida tem de aparecer"),
        eq(r["resumo"]["nZonas"] == 2, f"veio {r['resumo']['nZonas']} zonas"),
    ))(incorporar_divisas(MAIOR, TALHAO))))

t("a divisa interna sobrevive: as duas classes continuam existindo", lambda: (
    (lambda r: eq({f["properties"]["classe"] for f in r["fc"]["features"]} == {"Alta", "Baixa"},
                  "uma classe sumiu — a divisa não reparticionou"))(
        incorporar_divisas(MENOR, TALHAO))))

t("a face herda as PROPERTIES da zona antiga (a cor não se perde)", lambda: (
    (lambda r: (
        eq(all(f["properties"].get("cor") for f in r["fc"]["features"]), "faltou cor"),
        eq({f["properties"]["cor"] for f in r["fc"]["features"]} == {"#ef4444", "#3b82f6"}, "cor trocada"),
    ))(incorporar_divisas(MENOR, TALHAO))))

t("a saída volta em GRAUS, na posição certa (projeção ida-e-volta)", lambda: (
    (lambda r: eq(all(-50.2 < c[0] < -50.0 and -24.95 < c[1] < -24.85
                      for f in r["fc"]["features"]
                      for c in shapely.geometry.shape(f["geometry"]).exterior.coords),
                  "coordenada fora da faixa esperada"))(
        incorporar_divisas(MENOR, TALHAO))))

t("toda geometria devolvida é VÁLIDA em graus (a armadilha do IGEFI 04)", lambda: (
    (lambda r: eq(all(shapely.geometry.shape(f["geometry"]).is_valid for f in r["fc"]["features"]),
                  "geometria inválida em graus"))(
        incorporar_divisas(MENOR, TALHAO))))

t("o diff mostra o que o talhão ganhou e o que perdeu", lambda: (
    (lambda r: (
        eq(len(r["diff"]["features"]) > 0, "diff vazio"),
        eq({f["properties"]["tipo"] for f in r["diff"]["features"]} <= {"ganha", "perdida"}, "tipo inesperado"),
    ))(incorporar_divisas(MENOR, TALHAO))))

t("o resumo conta o que foi esticado e o que foi cortado", lambda: (
    (lambda r: (
        eq(r["resumo"]["nDivisas"] >= 1, "nenhuma divisa interna encontrada"),
        eq("mEsticado" in r["resumo"] and "mCortado" in r["resumo"], "faltou métrica no resumo"),
    ))(incorporar_divisas(MENOR, TALHAO))))


def erro_esperado(fn, trecho):
    try:
        fn()
    except ValueError as e:
        if trecho.lower() in str(e).lower():
            return
        raise AssertionError(f"mensagem inesperada: {e}")
    raise AssertionError("deveria ter recusado")


t("zoneamento vazio é recusado com mensagem de usuário", lambda: erro_esperado(
    lambda: incorporar_divisas(fc(), TALHAO), "nenhum polígono"))

print(f"\n{ok} passaram, {fail} falharam")
sys.exit(1 if fail else 0)
