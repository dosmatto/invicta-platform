"""Catálogo CENTRAL de índices vegetativos (spec seção 16).

Fonte única das fórmulas — msr.py (Sentinel-2) e cbers.py (CBERS-4A) montam o
dict de bandas normalizadas (refletância ~0–1) e chamam `calcular`. Bandas com
nomes internos padronizados: blue, green, red, nir, rededge, swir.
"""
from __future__ import annotations

import numpy as np

L_SAVI = 0.5

# indice -> bandas necessárias + fórmula legível (vai nos metadados da camada)
CATALOGO: dict[str, dict] = {
    "NDVI":   {"bandas": ["red", "nir"],           "formula": "(NIR − Red) / (NIR + Red)"},
    "SAVI":   {"bandas": ["red", "nir"],           "formula": "((NIR − Red) / (NIR + Red + 0,5)) × 1,5"},
    "MSAVI2": {"bandas": ["red", "nir"],           "formula": "(2·NIR + 1 − √((2·NIR+1)² − 8·(NIR−Red))) / 2"},
    "EVI2":   {"bandas": ["red", "nir"],           "formula": "2,5 × (NIR − Red) / (NIR + 2,4·Red + 1)"},
    "EVI":    {"bandas": ["blue", "red", "nir"],   "formula": "2,5 × (NIR − Red) / (NIR + 6·Red − 7,5·Blue + 1)"},
    "GNDVI":  {"bandas": ["green", "nir"],         "formula": "(NIR − Green) / (NIR + Green)"},
    "NDWI":   {"bandas": ["green", "nir"],         "formula": "(Green − NIR) / (Green + NIR)"},
    "NDRE":   {"bandas": ["rededge", "nir"],       "formula": "(NIR − RedEdge) / (NIR + RedEdge)"},
    "NDMI":   {"bandas": ["nir", "swir"],          "formula": "(NIR − SWIR) / (NIR + SWIR)"},
    "VARI":   {"bandas": ["blue", "green", "red"], "formula": "(Green − Red) / (Green + Red − Blue)"},
    "ExG":    {"bandas": ["blue", "green", "red"], "formula": "2·Green − Red − Blue"},
    "GLI":    {"bandas": ["blue", "green", "red"], "formula": "(2·Green − Red − Blue) / (2·Green + Red + Blue)"},
}


def bandas_necessarias(indices: list[str]) -> list[str]:
    """União das bandas dos índices pedidos. Levanta erro p/ índice desconhecido."""
    out: list[str] = []
    for ind in indices:
        info = CATALOGO.get(ind)
        if info is None:
            raise ValueError(f"Índice desconhecido: {ind}")
        for b in info["bandas"]:
            if b not in out:
                out.append(b)
    return out


def _razao(num: np.ndarray, den: np.ndarray) -> np.ndarray:
    with np.errstate(invalid="ignore", divide="ignore"):
        r = num / den
    return np.where(np.isfinite(r), r, np.nan)


def calcular(indice: str, b: dict[str, np.ndarray]) -> np.ndarray:
    """Calcula UM índice a partir do dict de bandas (refletância). Float32/NaN."""
    if indice == "NDVI":
        v = np.clip(_razao(b["nir"] - b["red"], b["nir"] + b["red"]), -1.0, 1.0)
    elif indice == "SAVI":
        v = _razao((b["nir"] - b["red"]) * (1.0 + L_SAVI), b["nir"] + b["red"] + L_SAVI)
    elif indice == "MSAVI2":
        t = 2.0 * b["nir"] + 1.0
        with np.errstate(invalid="ignore"):
            v = (t - np.sqrt(np.maximum(t * t - 8.0 * (b["nir"] - b["red"]), 0.0))) / 2.0
    elif indice == "EVI2":
        v = _razao(2.5 * (b["nir"] - b["red"]), b["nir"] + 2.4 * b["red"] + 1.0)
    elif indice == "EVI":
        v = _razao(2.5 * (b["nir"] - b["red"]), b["nir"] + 6.0 * b["red"] - 7.5 * b["blue"] + 1.0)
    elif indice == "GNDVI":
        v = np.clip(_razao(b["nir"] - b["green"], b["nir"] + b["green"]), -1.0, 1.0)
    elif indice == "NDWI":
        v = np.clip(_razao(b["green"] - b["nir"], b["green"] + b["nir"]), -1.0, 1.0)
    elif indice == "NDRE":
        v = np.clip(_razao(b["nir"] - b["rededge"], b["nir"] + b["rededge"]), -1.0, 1.0)
    elif indice == "NDMI":
        v = np.clip(_razao(b["nir"] - b["swir"], b["nir"] + b["swir"]), -1.0, 1.0)
    elif indice == "VARI":
        v = _razao(b["green"] - b["red"], b["green"] + b["red"] - b["blue"])
        v = np.clip(v, -1.0, 1.0)  # denominador pode ~0 -> estoura; VARI útil fica em [-1,1]
    elif indice == "ExG":
        v = 2.0 * b["green"] - b["red"] - b["blue"]
    elif indice == "GLI":
        v = np.clip(_razao(2.0 * b["green"] - b["red"] - b["blue"],
                           2.0 * b["green"] + b["red"] + b["blue"]), -1.0, 1.0)
    else:
        raise ValueError(f"Índice desconhecido: {indice}")
    return v.astype("float32")


def stats_de(grid: np.ndarray, n_dentro: int) -> dict:
    """Stats padrão do envelope + % de pixels válidos dentro do talhão."""
    fin = grid[np.isfinite(grid)]
    return {
        "n": int(fin.size),
        "min": float(np.min(fin)) if fin.size else None,
        "max": float(np.max(fin)) if fin.size else None,
        "media": float(np.mean(fin)) if fin.size else None,
        "pct_validos": round(100.0 * fin.size / n_dentro, 1) if n_dentro else 0.0,
    }
