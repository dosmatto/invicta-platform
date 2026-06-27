"""Limpeza de Mapas de Colheita — porte do script oficial QGIS da Invicta
(1.PAINEL_COLHEITA) para o backend FastAPI.

Pipeline (sobre os pontos de TODAS as máquinas/camadas juntos):
  1. Filtro bruto     (val*mult; exclui <=hard_min ou >hard_max)
  2. Operacional      (velocidade min/máx, largura mínima — quando vierem por ponto)
  3. Correção colhedora (UNIFICAÇÃO): global (escala cada máquina p/ a mediana
     geral) + local (por raio, razão mediana_outras/mediana_mesma)
  4. MapFilter        global (mediana ± v%) + local anisotrópico (raio, ao longo
     do eixo da colheita)
  5. Média real       (escala os valores p/ a média bater com a informada)
Depois interpola por IDW reusando interp.interpolar. Devolve o mesmo envelope
de grid + um relatório por etapa.

Coordenadas métricas locais (equirretangular) p/ os raios em metros — mesma
projeção do interp.
"""
from __future__ import annotations

import math
import statistics
from typing import Any

import numpy as np
from scipy.spatial import cKDTree

import interp

VERSION = "colheita-1"


def _mediana(vals: list[float] | np.ndarray) -> float:
    v = [x for x in vals if x is not None and x > 0]
    return float(statistics.median(v)) if v else 0.0


def _limit(f: float, fmin: float, fmax: float) -> float:
    return max(fmin, min(f, fmax))


def _angulo_principal(mx: np.ndarray, my: np.ndarray) -> float:
    n = len(mx)
    if n < 2:
        return 0.0
    cx, cy = mx.mean(), my.mean()
    sxx = float(np.mean((mx - cx) ** 2)); syy = float(np.mean((my - cy) ** 2))
    sxy = float(np.mean((mx - cx) * (my - cy)))
    return 0.5 * math.atan2(2 * sxy, sxx - syy)


def _correcao_colhedora_global(val: np.ndarray, maq: np.ndarray, limite: float, peso: float, min_pts: int):
    pos = val[val > 0]
    med_geral = float(np.median(pos)) if pos.size else 0.0
    corrigidos = 0
    if med_geral <= 0:
        return val, {"med_geral": med_geral, "maquinas_corrigidas": 0}
    fmin, fmax = 1.0 - limite, 1.0 + limite
    out = val.copy()
    for m in np.unique(maq):
        sel = (maq == m) & (val > 0)
        if int(sel.sum()) < min_pts:
            continue
        med_m = float(np.median(val[sel]))
        if med_m <= 0:
            continue
        fator = (1.0 - peso) * 1.0 + peso * _limit(med_geral / med_m, fmin, fmax)
        out[maq == m] = val[maq == m] * fator
        corrigidos += 1
    return out, {"med_geral": round(med_geral, 1), "maquinas_corrigidas": corrigidos}


def _correcao_colhedora_local(mx, my, val, maq, tree, raio, limite, peso, min_same, min_other):
    fmin, fmax = 1.0 - limite, 1.0 + limite
    out = val.copy()
    viz = tree.query_ball_point(np.column_stack([mx, my]), r=raio, workers=-1)
    corrigidos = 0
    for i in range(len(val)):
        idxs = np.asarray(viz[i], dtype=np.intp); idxs = idxs[idxs != i]
        if idxs.size == 0:
            continue
        same_m = maq[idxs] == maq[i]
        vs = val[idxs[same_m]]; vo = val[idxs[~same_m]]
        vs = vs[vs > 0]; vo = vo[vo > 0]
        if vs.size < min_same or vo.size < min_other:
            continue
        ms, mo = float(np.median(vs)), float(np.median(vo))
        if ms <= 0 or mo <= 0:
            continue
        out[i] = val[i] * ((1.0 - peso) + peso * _limit(mo / ms, fmin, fmax))
        corrigidos += 1
    return out, corrigidos


def _mapfilter_global(val: np.ndarray, v: float) -> np.ndarray:
    pos = val[val > 0]
    if pos.size == 0:
        return np.ones(len(val), dtype=bool)
    med = float(np.median(pos))
    return (val >= med - med * v) & (val <= med + med * v) & (val > 0)


def _mapfilter_local(mx, my, val, tree, raio, v, aniso_tol_deg, min_neighbors, angle):
    keep = np.ones(len(val), dtype=bool)
    cos_tol = math.cos(math.radians(aniso_tol_deg))
    dxp, dyp = math.cos(angle), math.sin(angle)
    viz = tree.query_ball_point(np.column_stack([mx, my]), r=raio, workers=-1)
    for i in range(len(val)):
        idxs = np.asarray(viz[i], dtype=np.intp); idxs = idxs[idxs != i]
        if idxs.size < min_neighbors:
            continue
        dx = mx[idxs] - mx[i]; dy = my[idxs] - my[i]
        d2 = dx * dx + dy * dy
        m = d2 > 0
        if not m.any():
            continue
        d = np.sqrt(d2[m])
        cosa = (dx[m] * dxp + dy[m] * dyp) / d
        vn = val[idxs[m][np.abs(cosa) >= cos_tol]]   # só vizinhos ao longo do eixo da passada
        if vn.size < min_neighbors:
            continue
        med = float(np.median(vn))
        if not (med - med * v <= val[i] <= med + med * v):
            keep[i] = False
    return keep


def processar(machines: list[dict], params: dict, poligono: dict, pixel_m: float,
              media_real: float, dominio, stops) -> dict[str, Any]:
    # --- merge + filtro bruto + operacional ---
    mult = float(params.get("multiplicador", 1.0))
    hard_min = float(params.get("hard_min", 0.0))
    hard_max = float(params.get("hard_max", 25000.0))
    vel_min = params.get("vel_min"); vel_max = params.get("vel_max"); larg_min = params.get("larg_min")

    lng, lat, val, maq = [], [], [], []
    n_bruto = 0
    for mi, mac in enumerate(machines):
        for p in mac.get("pontos", []):
            n_bruto += 1
            v = p.get("valor")
            if v is None:
                continue
            v = float(v) * mult
            if v <= hard_min or v > hard_max:
                continue
            if vel_min is not None and vel_max is not None and p.get("vel") is not None:
                s = float(p["vel"])
                if s < vel_min or s > vel_max:
                    continue
            if larg_min is not None and p.get("larg") is not None:
                if float(p["larg"]) < larg_min:
                    continue
            lng.append(float(p["lng"])); lat.append(float(p["lat"])); val.append(v); maq.append(mi)
    if len(val) < 3:
        raise ValueError("Poucos pontos válidos após o filtro bruto/operacional (mínimo 3).")

    lng = np.array(lng); lat = np.array(lat); val = np.array(val); maq = np.array(maq)
    n_apos_bruto = len(val)

    # projeção métrica local (p/ raios em metros)
    lon0, lat0 = float(lng.mean()), float(lat.mean())
    mx, my = interp._to_local(lng, lat, lon0, lat0)
    tree = cKDTree(np.column_stack([mx, my]))
    rel: dict[str, Any] = {"n_bruto": n_bruto, "n_apos_filtro_bruto": n_apos_bruto}

    # --- correção por colhedora (unificação) ---
    if params.get("corrigir_colhedora") and len(np.unique(maq)) >= 2:
        val, info = _correcao_colhedora_global(val, maq, float(params.get("limite_colhedora", 0.08)),
                                               float(params.get("peso_colhedora", 0.8)), int(params.get("min_points_colhedora", 100)))
        rel["correcao_colhedora_global"] = info
        if params.get("corrigir_colhedora_local"):
            val, c = _correcao_colhedora_local(mx, my, val, maq, tree, float(params.get("raio_colh_local", 120.0)),
                                               float(params.get("limite_colh_local", 0.08)), float(params.get("peso_colh_local", 0.8)),
                                               int(params.get("min_same", 6)), int(params.get("min_other", 6)))
            rel["correcao_colhedora_local_corrigidos"] = int(c)

    # --- MapFilter global ---
    mfg = _mapfilter_global(val, float(params.get("mf_global_v", 0.35)))
    rel["mapfilter_global_removidos"] = int((~mfg).sum())
    mx, my, val, maq = mx[mfg], my[mfg], val[mfg], maq[mfg]
    lng, lat = lng[mfg], lat[mfg]
    if len(val) < 3:
        raise ValueError("Poucos pontos após o MapFilter global.")

    # --- MapFilter local (anisotrópico) ---
    tree = cKDTree(np.column_stack([mx, my]))
    angle = _angulo_principal(mx, my)
    mfl = _mapfilter_local(mx, my, val, tree, float(params.get("mf_local_r", 30.0)), float(params.get("mf_local_v", 0.10)),
                           float(params.get("mf_aniso_tol", 20.0)), int(params.get("mf_min_neighbors", 4)), angle)
    rel["mapfilter_local_removidos"] = int((~mfl).sum())
    lng, lat, val = lng[mfl], lat[mfl], val[mfl]
    if len(val) < 3:
        raise ValueError("Poucos pontos após o MapFilter local.")
    rel["n_usados"] = int(len(val))

    # --- média real (calibração nos pontos, como o script oficial) ---
    media_calc = float(val.mean())
    rel["media_calculada"] = round(media_calc, 1)
    if media_real and media_real > 0 and media_calc > 0:
        fator = media_real / media_calc
        val = val * fator
        rel["fator_media_real"] = round(fator, 4)

    pts = [{"lng": float(a), "lat": float(b), "valor": float(c)} for a, b, c in zip(lng, lat, val)]
    resp = interp.interpolar(pts, poligono, dominio, stops, pixel_m, "idw")
    resp["relatorio"] = rel
    return resp
