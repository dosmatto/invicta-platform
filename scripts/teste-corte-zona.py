# Corte por linha das zonas de manejo (backend) — roda: npm run teste:corte
#
# O que este arquivo protege: o corte manual NÃO PODE inventar nem perder área.
# As partes têm que reconstituir a zona exatamente (mesma divisa para as duas,
# sem vão e sem sobreposição) mesmo nos casos em que cortar o anel no navegador
# falha: zona CÔNCAVA (a linha entra e sai várias vezes), zona com FURO e zona
# MULTIPOLÍGONO (corpo + ilha). E o traço tem que perdoar quem parou dentro.

import math
import os
import sys

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


def poli(*aneis):
    return {"type": "Polygon", "coordinates": [[list(p) for p in a] for a in aneis]}


def linha(*pts):
    return {"type": "LineString", "coordinates": [list(p) for p in pts]}


# Quadrado ~1,1 km de lado perto de Londrina (0,01° ≈ 1,02 km em lat).
Q = poli([(-51.50, -23.50), (-51.49, -23.50), (-51.49, -23.49), (-51.50, -23.49), (-51.50, -23.50)])


def area_total(r):
    return sum(p["areaHa"] for p in r["partes"])


def perto(a, b, tol=0.01):
    assert abs(a - b) <= tol, f"{a} != {b} (tol {tol})"


print("\nCorte por linha (shapely.ops.split)\n")


def caso_reto():
    r = interp.dividir_zona(Q, linha((-51.505, -23.495), (-51.485, -23.495)))
    assert r["n"] == 2, r["n"]
    perto(area_total(r), 113.7, 1.0)
    perto(r["partes"][0]["areaHa"], r["partes"][1]["areaHa"], 0.5)  # cortou no meio


t("linha reta atravessando o quadrado gera 2 partes que somam a zona inteira", caso_reto)


def caso_soma():
    # A garantia central: a soma das partes = a área da zona antes do corte.
    inteiro = interp.dividir_zona(Q, linha((-51.505, -23.4999), (-51.485, -23.4999)))
    diagonal = interp.dividir_zona(Q, linha((-51.505, -23.505), (-51.485, -23.485)))
    perto(area_total(inteiro), area_total(diagonal), 0.01)


t("corte no canto e corte na diagonal preservam a MESMA área total", caso_soma)


def caso_parou_dentro():
    # Traço que começa e termina DENTRO da zona — o editor antigo exigia começar
    # e terminar fora. O prolongamento resolve sem o usuário saber da regra.
    r = interp.dividir_zona(Q, linha((-51.4985, -23.495), (-51.4915, -23.495)))
    assert r["n"] == 2, r["n"]
    assert r["prolongamentoM"] > 0, r["prolongamentoM"]
    perto(area_total(r), 113.7, 1.0)


t("traço que PARA DENTRO da zona ainda corta (prolongamento automático)", caso_parou_dentro)


def caso_traco_exato():
    # Quem desenhou direito não deve ter a linha esticada — o corte é onde ele traçou.
    r = interp.dividir_zona(Q, linha((-51.505, -23.495), (-51.485, -23.495)))
    assert r["prolongamentoM"] == 0.0, r["prolongamentoM"]


t("traço que já atravessa NÃO é prolongado (corta exatamente onde foi desenhado)", caso_traco_exato)


def caso_concavo():
    # "C" deitado: a linha vertical no meio atravessa os DOIS braços — o corte
    # por anel no navegador embaralha justamente aqui.
    c = poli([
        (-51.50, -23.50), (-51.48, -23.50), (-51.48, -23.498), (-51.494, -23.498),
        (-51.494, -23.492), (-51.48, -23.492), (-51.48, -23.49), (-51.50, -23.49),
        (-51.50, -23.50),
    ])
    r = interp.dividir_zona(c, linha((-51.4855, -23.505), (-51.4855, -23.485)))
    assert r["n"] >= 2, r["n"]
    inteiro = interp.dividir_zona(c, linha((-51.505, -23.4999), (-51.475, -23.4999)))
    perto(area_total(r), area_total(inteiro), 0.02)


t("zona CÔNCAVA (linha cruza os dois braços): partes somam a zona inteira", caso_concavo)


def caso_furo():
    # Zona com buraco (benfeitoria/açude): o furo continua furo depois do corte.
    com_furo = poli(
        [(-51.50, -23.50), (-51.49, -23.50), (-51.49, -23.49), (-51.50, -23.49), (-51.50, -23.50)],
        [(-51.4970, -23.4970), (-51.4930, -23.4970), (-51.4930, -23.4930), (-51.4970, -23.4930), (-51.4970, -23.4970)],
    )
    cheio = interp.dividir_zona(Q, linha((-51.505, -23.495), (-51.485, -23.495)))
    r = interp.dividir_zona(com_furo, linha((-51.505, -23.4985), (-51.485, -23.4985)))
    assert r["n"] == 2, r["n"]
    # o furo (~0,4 km × 0,4 km ≈ 18 ha) some da área — não foi "preenchido" pelo corte
    assert area_total(r) < area_total(cheio) - 10, (area_total(r), area_total(cheio))


t("zona com FURO: o buraco continua descontado nas partes", caso_furo)


def caso_ilha():
    # Zona multipolígono (corpo + ilha). A linha corta só o corpo: a ilha não
    # pode sumir nem virar uma terceira zona órfã — cola na parte mais próxima.
    mp = {"type": "MultiPolygon", "coordinates": [
        [[[-51.50, -23.50], [-51.49, -23.50], [-51.49, -23.49], [-51.50, -23.49], [-51.50, -23.50]]],
        [[[-51.4880, -23.4920], [-51.4860, -23.4920], [-51.4860, -23.4900], [-51.4880, -23.4900], [-51.4880, -23.4920]]],
    ]}
    r = interp.dividir_zona(mp, linha((-51.505, -23.495), (-51.4885, -23.495)))
    assert r["n"] == 2, f"a ilha virou parte solta: {r['n']}"
    corpo = interp.dividir_zona(Q, linha((-51.505, -23.495), (-51.485, -23.495)))
    assert area_total(r) > area_total(corpo), "a ilha sumiu do resultado"


t("zona com ILHA: a ilha entra na parte mais próxima, não vira zona órfã", caso_ilha)


def caso_maior_primeiro():
    r = interp.dividir_zona(Q, linha((-51.505, -23.4915), (-51.485, -23.4915)))
    a = [p["areaHa"] for p in r["partes"]]
    assert a == sorted(a, reverse=True), a
    assert a[0] > a[1] * 2, a  # corte perto da borda: a maior é bem maior


t("partes voltam da MAIOR para a menor (a maior guarda a identidade da zona)", caso_maior_primeiro)


def caso_toque_duplo():
    # Toque repetido no mesmo lugar (dedo trêmulo no celular) gerava segmento de
    # comprimento zero e derrubava o split.
    r = interp.dividir_zona(Q, linha(
        (-51.505, -23.495), (-51.505, -23.495), (-51.495, -23.495), (-51.485, -23.495)))
    assert r["n"] == 2, r["n"]


t("pontos repetidos no traço (toque duplo) não derrubam o corte", caso_toque_duplo)


def caso_fora():
    try:
        interp.dividir_zona(Q, linha((-51.60, -23.60), (-51.59, -23.60)))
    except ValueError as e:
        assert "não passa por dentro" in str(e), str(e)
        return
    raise AssertionError("linha longe da zona deveria dar erro")


t("linha longe da zona: erro dizendo para traçar SOBRE a zona", caso_fora)


def caso_nao_atravessa():
    # Linha inteiramente dentro, curta demais para chegar em qualquer borda mesmo
    # com o prolongamento máximo? Não existe — o prolongamento de 100% da diagonal
    # sempre sai. O caso real de erro é a linha que só ENCOSTA na borda.
    try:
        interp.dividir_zona(Q, linha((-51.50, -23.50), (-51.50, -23.49)))  # sobre a borda oeste
    except ValueError as e:
        assert "atravessou" in str(e) or "por dentro" in str(e), str(e)
        return
    raise AssertionError("linha em cima da borda não divide nada — deveria dar erro")


t("linha em cima da borda não divide: erro explicando que falta atravessar", caso_nao_atravessa)


def caso_dois_pontos():
    try:
        interp.dividir_zona(Q, linha((-51.495, -23.495), (-51.495, -23.495)))
    except ValueError as e:
        assert "2 pontos" in str(e), str(e)
        return
    raise AssertionError("traço de 1 ponto útil deveria dar erro")


t("traço com um ponto só: erro pedindo pelo menos 2 pontos diferentes", caso_dois_pontos)


def caso_sem_sobreposicao():
    # A prova de que a divisa é ÚNICA: as partes não podem se sobrepor.
    import shapely
    from shapely.geometry import shape as _shape
    r = interp.dividir_zona(Q, linha((-51.505, -23.4955), (-51.485, -23.4945)))
    gs = [shapely.make_valid(_shape(p["geometry"])) for p in r["partes"]]
    for i in range(len(gs)):
        for j in range(i + 1, len(gs)):
            inter = gs[i].intersection(gs[j])
            assert inter.is_empty or inter.area < 1e-12, f"sobreposição entre {i} e {j}: {inter.area}"


t("partes NÃO se sobrepõem (divisa única, como o suavizar exige)", caso_sem_sobreposicao)


def caso_geometria_feature():
    r = interp.dividir_zona({"type": "Feature", "properties": {"id": "3"}, "geometry": Q},
                            linha((-51.505, -23.495), (-51.485, -23.495)))
    assert r["n"] == 2


t("aceita Feature além de geometria pura (o front manda a feature da zona)", caso_geometria_feature)

print(f"\n{ok} passaram, {fail} falharam\n")
sys.exit(1 if fail else 0)
