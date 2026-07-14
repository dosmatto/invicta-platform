# MTAN — biblioteca da bancada de treinamento (faixa rica / dose de N)
# Offline: roda contra os casos históricos do disco WETRAVEL. Não é usada pela plataforma.
import os, re, glob
import numpy as np
import pandas as pd
import shapefile
from scipy.spatial import cKDTree

RAIZ = '/Volumes/WETRAVEL/FAIXA RICA'


# ---------- inventário ----------

def inventario():
    """Varre o disco e lista todos os casos (pasta com flexum.csv)."""
    casos = []
    for fl in sorted(glob.glob(os.path.join(RAIZ, '**', 'flexum.csv'), recursive=True)):
        pasta = os.path.dirname(fl)
        rel = os.path.relpath(pasta, RAIZ)
        partes = rel.split(os.sep)
        ano = partes[0]
        cultura = partes[1] if len(partes) > 1 else '?'
        talhao = partes[-1]
        produtor = partes[2] if len(partes) > 3 else (partes[2] if len(partes) == 3 else '')
        ureia = acha_ureia(pasta)
        pdfs = glob.glob(os.path.join(pasta, '*.pdf'))
        casos.append(dict(ano=ano, cultura=cultura.replace('FEIJÃO', 'FEIJAO'),
                          produtor=produtor, talhao=talhao, pasta=pasta,
                          ureia_shp=ureia or '', pdf=pdfs[0] if pdfs else ''))
    return pd.DataFrame(casos)


def acha_ureia(pasta):
    """Acha o shapefile de aplicação real (UREIA) do caso, incluindo subpastas e zips extraídos."""
    cands = [p for p in glob.glob(os.path.join(pasta, '**', '*.shp'), recursive=True)
             if re.search(r'ureia', os.path.basename(p), re.I)]
    if cands:
        return sorted(cands, key=len)[0]
    # fallback: raster.zip tem o mesmo conteúdo em vários casos 2024
    return None


# ---------- leitura do sensor ----------

def carrega_flexum(fl_csv):
    """Lê o log do Crop Circle e calcula o índice de vegetação médio dos 2 sensores ativos."""
    df = pd.read_csv(fl_csv)
    with np.errstate(all='ignore'):
        i0 = (df['Nir'] - df['Red']) / (df['Nir'] + df['Red'])
        i1 = (df['Nir.1'] - df['Red.1']) / (df['Nir.1'] + df['Red.1'])
    # usa a média dos sensores válidos por linha
    df['idx'] = np.nanmean(np.column_stack([np.where(df['Nir'] > 0, i0, np.nan),
                                            np.where(df['Nir.1'] > 0, i1, np.nan)]), axis=1)
    df = df[np.isfinite(df['idx']) & (df['idx'] > 0) & (df['idx'] < 1)].reset_index(drop=True)
    df['t'] = pd.to_datetime(df['Dia'] + ' ' + df['Horario'], dayfirst=True, errors='coerce')
    return df


# ---------- faixa rica ----------

def detecta_faixa(df, raio=0.00040, dt_min=120, anom_min=0.030, run_min=150):
    """Detecta a(s) faixa(s) rica(s) por anomalia espacial: para cada ponto, o
    baseline é a média do índice dos vizinhos (~40 m) lidos em OUTRO momento
    (outra passada, |Δt| > dt_min s). A faixa rica é a sequência contígua de
    pontos cuja passada fica bem acima das passadas vizinhas.
    Retorna (mask_faixa, tabela de trechos candidatos)."""
    pts = df[['Longitude', 'Latitude']].values
    idxv = df['idx'].values
    ts = df['t'].values.astype('datetime64[s]').astype(float)
    tree = cKDTree(pts)
    viz = tree.query_ball_point(pts, r=raio)
    anom = np.full(len(df), np.nan)
    for i, vs in enumerate(viz):
        outros = [j for j in vs if abs(ts[j] - ts[i]) > dt_min]
        if len(outros) >= 5:
            anom[i] = idxv[i] - np.mean(idxv[outros])
    # suaviza a anomalia ao longo da trajetória e acha trechos contíguos altos
    s = pd.Series(anom).rolling(31, center=True, min_periods=10).median()
    alto = (s > anom_min).values
    runs, ini = [], None
    for i, a in enumerate(alto):
        if a and ini is None:
            ini = i
        if not a and ini is not None:
            runs.append((ini, i - 1)); ini = None
    if ini is not None:
        runs.append((ini, len(alto) - 1))
    # une trechos separados por buracos curtos (<60 pts)
    unidos = []
    for r in runs:
        if unidos and r[0] - unidos[-1][1] < 60:
            unidos[-1] = (unidos[-1][0], r[1])
        else:
            unidos.append(list(r))
    faixa_mask = np.zeros(len(df), bool)
    linhas = []
    for a, b in unidos:
        n = b - a + 1
        tr = dict(ini=a, fim=b, n=n, idx_trecho=idxv[a:b + 1].mean(),
                  anom_media=np.nanmean(anom[a:b + 1]))
        linhas.append(tr)
        if n >= run_min:
            faixa_mask[a:b + 1] = True
    tab = pd.DataFrame(linhas).sort_values('n', ascending=False) if linhas else pd.DataFrame()
    return faixa_mask, tab


# ---------- mapa real + join ----------

def carrega_ureia(shp):
    sf = shapefile.Reader(shp)
    campos = [f[0] for f in sf.fields[1:]]
    # campo da dose: 'x' (2024/25) ou 'DOSE_PROD' (2026)
    ic = next((i for i, c in enumerate(campos) if c.lower() in ('x', 'dose_prod', 'dose', 'rate', 'taxa')), 0)
    doses = np.array([r[ic] for r in sf.records()], float)
    cent = np.array([np.mean(np.array(s.points), axis=0) for s in sf.shapes()])
    ok = np.isfinite(doses) & (doses > 0)
    return cent[ok], doses[ok]


def junta(df, cent, raio=0.00035, min_pts=3):
    """Média do índice dos pontos do sensor dentro de cada célula do mapa real."""
    tree = cKDTree(df[['Longitude', 'Latitude']].values)
    grupos = tree.query_ball_point(cent, r=raio)
    iv = df['idx'].values
    im = np.array([iv[g].mean() if len(g) >= min_pts else np.nan for g in grupos])
    return im


# ---------- modelo e métricas ----------

def ajusta_linear(rs, dose):
    """dose = a + b*rs (rs = idx_celula / idx_faixa_rica)."""
    b, a = np.polyfit(rs, dose, 1)
    return a, b


def metricas(prev, real):
    prev = np.asarray(prev, float); real = np.asarray(real, float)
    err = prev - real
    mae = np.abs(err).mean()
    vies = err.mean()
    tol = np.maximum(0.10 * real, 5.0)  # ±10% (mínimo 5 kg/ha)
    acerto = (np.abs(err) <= tol).mean() * 100
    r = np.corrcoef(prev, real)[0, 1] if len(prev) > 2 else np.nan
    return dict(mae=round(mae, 1), vies=round(vies, 1), acerto_pct=round(acerto, 1),
                r=round(r, 3), dose_real_media=round(real.mean(), 1),
                dose_prev_media=round(prev.mean(), 1))
