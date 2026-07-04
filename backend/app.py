"""API de interpolacao de fertilidade (FastAPI).

Roda local: `python -m uvicorn app:app --host 127.0.0.1 --port 8800`
ou use o start.ps1 / start.bat desta pasta.
"""
from __future__ import annotations

from typing import Any

from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import interp
import msr
import cbers
import colheita
import mde
import ia

app = FastAPI(title="INVICTA - Interpolacao de Fertilidade", version="0.1.0")

# Local: front em localhost:3100 chama este servico em 127.0.0.1:8800.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# Permite que o app publicado (HTTPS) acesse este backend LOCAL em 127.0.0.1
# (Private Network Access). Funciona no Chrome; em https->http localhost outros
# navegadores podem bloquear (use o app local ou um backend na nuvem nesse caso).
@app.middleware("http")
async def _allow_private_network(request, call_next):
    resp = await call_next(request)
    resp.headers["Access-Control-Allow-Private-Network"] = "true"
    return resp


class Ponto(BaseModel):
    lng: float
    lat: float
    valor: float


class ReqInterp(BaseModel):
    pontos: list[Ponto]
    poligono: dict[str, Any]          # GeoJSON Polygon/MultiPolygon
    dominio: list[float]              # [vmin, vmax]
    stops: list[Any]                  # [[t, [r,g,b]], ...]
    pixel_m: float = 20.0
    metodo: str = "krige"             # 'krige' (padrao) | 'idw' (explicito)
    modelo_fixo: str | None = None    # fixa o variograma (spherical/exponential/gaussian) ou None=auto
    variograma_manual: dict[str, Any] | None = None  # C2.b: {modelo, patamar, alcance, pepita, vizinhos, aniso_ratio, aniso_angle}


@app.get("/health")
def health():
    return {
        "ok": True,
        "pykrige": interp._HAS_PYKRIGE,
        "v": getattr(interp, "VERSION", "?"),
        "msr": msr._HAS_MSR,
        "msr_v": getattr(msr, "VERSION", "?"),
        "msr_err": getattr(msr, "_ERR_MSR", ""),
        "cbers": cbers._HAS,
        "cbers_v": getattr(cbers, "VERSION", "?"),
        "cbers_err": getattr(cbers, "_ERR", ""),
        "colheita_v": getattr(colheita, "VERSION", "?"),
        "mde_v": getattr(mde, "VERSION", "?"),
        "ia_v": getattr(ia, "VERSION", "?"),
        "ia_configurada": ia.configurada(),
    }


@app.post("/interpolar")
def interpolar(req: ReqInterp):
    pts = [{"lng": p.lng, "lat": p.lat, "valor": p.valor} for p in req.pontos]
    try:
        return interp.interpolar(pts, req.poligono, req.dominio, req.stops, req.pixel_m, req.metodo, req.modelo_fixo, req.variograma_manual)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"falha na interpolacao: {e}")


class ReqMde(BaseModel):
    poligono: dict[str, Any]          # GeoJSON Polygon/MultiPolygon (talhão ou fazenda)
    fonte: str = "auto"               # 'auto' | 'cop30' | 'srtm'
    buffer_m: float = 300.0           # buffer antes dos derivados (spec 5.2)


@app.post("/mde")
def mde_gerar(req: ReqMde):
    """MDE F1: busca a base (Copernicus→SRTM), deriva altitude/declividade/hillshade
    com buffer e devolve a prévia (grids + stats + histograma + avisos)."""
    try:
        return mde.gerar_mde(req.poligono, req.fonte, req.buffer_m)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"falha no MDE: {e}")


class ReqMdeAnalise(BaseModel):
    poligono: dict[str, Any]
    fonte: str = "auto"               # base aprovada: passar a fonte dela (sem 'auto' cai na ordem)
    buffer_m: float = 300.0
    sensibilidade: str = "media"      # rede de drenagem: 'baixa' | 'media' | 'alta' (spec 7.7)


@app.post("/mde-analise")
def mde_analise(req: ReqMdeAnalise):
    """MDE F2+F3: derivados topográficos (aspecto/curvaturas/TPI/TRI/fluxo) +
    análise agronômica (TWI/LS/drenagem/classes topográficas) numa chamada."""
    try:
        return mde.gerar_analise(req.poligono, req.fonte, req.buffer_m, req.sensibilidade)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"falha na análise topográfica: {e}")


class ReqIaDiagnostico(BaseModel):
    contexto: dict[str, Any]              # pacote resumido montado pela plataforma (secao 9)
    tipo_analise: str = "diagnostico_integrado"


@app.post("/ia-diagnostico")
def ia_diagnostico(req: ReqIaDiagnostico):
    """IA F1: Diagnóstico Inteligente por Talhão (RAG — a IA só vê o contexto
    resumido; chave OPENAI_API_KEY apenas no servidor)."""
    try:
        return ia.diagnostico_talhao(req.contexto, req.tipo_analise)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"falha no diagnóstico de IA: {e}")


class ReqGeoTiff(BaseModel):
    grid_b64: str                     # Float32 (norte no topo), rows*cols — o grid do /interpolar
    shape: list[int]                  # [rows, cols]
    bounds: list[float]               # [w, s, e, n]
    filename: str = "mapa.tif"


@app.post("/grid-geotiff")
def grid_geotiff(req: ReqGeoTiff):
    """Exporta um grid JA interpolado como GeoTIFF (EPSG:4326). Reaproveita o
    raster que o front ja tem — o download bate pixel a pixel com o mapa exibido."""
    try:
        data = interp.grid_para_geotiff(req.grid_b64, req.shape, req.bounds)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"falha ao gerar GeoTIFF: {e}")
    fn = req.filename if req.filename.lower().endswith(".tif") else f"{req.filename}.tif"
    return Response(content=data, media_type="image/tiff",
                    headers={"Content-Disposition": f'attachment; filename="{fn}"'})


class Camada(BaseModel):
    nome: str
    b64: str                          # Float32 (norte no topo), rows*cols


# Revisão 13.00A: Configurar → ANALISAR → Decidir → GERAR → Avaliar.
class ReqAnalisarZonas(BaseModel):
    camadas: list[Camada]             # MAPAS JÁ INTERPOLADOS (co-registrados)
    bounds: list[float]               # [w, s, e, n] comum às camadas
    shape: list[int]                  # [rows, cols] comum às camadas
    poligono: dict[str, Any] | None = None
    algoritmo: str = "fcm"            # 'fcm' (fuzzy c-means) | 'kmeans'
    c_min: int = 2                    # faixa p/ a curva FPI/NCE
    c_max: int = 12                   # mínimo 12 (rev. 13.00A)
    pesos: list[float] | None = None  # peso por camada (None = todos 1)


class ReqGerarZonas(BaseModel):
    camadas: list[Camada]
    bounds: list[float]
    shape: list[int]
    n_classes: int                    # nº de zonas ESCOLHIDO pelo usuário
    poligono: dict[str, Any] | None = None
    algoritmo: str = "fcm"
    area_min_ha: float = 0.0          # 0 = sem fusão de manchas pequenas
    pesos: list[float] | None = None


class ReqCenas(BaseModel):
    poligono: dict[str, Any]          # GeoJSON Polygon/MultiPolygon do talhão
    data_ini: str                     # 'YYYY-MM-DD'
    data_fim: str                     # 'YYYY-MM-DD'
    nuvem_max: float = 60.0           # % máx de nuvem p/ entrar na lista (só Sentinel)
    fonte: str = "sentinel"           # 'sentinel' | 'cbers'


@app.post("/ndvi-cenas")
def ndvi_cenas(req: ReqCenas):
    """Lista as cenas disponíveis no período (sem ler COG) para o usuário
    escolher quais quer ver. Fonte Sentinel-2 (global) ou CBERS-4A (Brasil, 2 m)."""
    try:
        if req.fonte == "cbers":
            return cbers.listar_cenas(req.poligono, req.data_ini, req.data_fim, req.nuvem_max)
        return msr.listar_cenas(req.poligono, req.data_ini, req.data_fim, req.nuvem_max)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"falha ao listar cenas: {e}")


class ReqNdvi(BaseModel):
    poligono: dict[str, Any]          # GeoJSON Polygon/MultiPolygon do talhão
    data_ini: str                     # 'YYYY-MM-DD'
    data_fim: str                     # 'YYYY-MM-DD'
    nuvem_max: float = 40.0           # % máx de cobertura de nuvem da cena (só Sentinel)
    pixel_m: float = 10.0             # resolução alvo (Sentinel 10 m / CBERS 2 m)
    cena_id: str | None = None        # cena específica (da lista); None = mais recente
    fonte: str = "sentinel"           # 'sentinel' | 'cbers'


@app.post("/ndvi-sentinel")
def ndvi_sentinel(req: ReqNdvi):
    """NDVI de uma cena (Sentinel-2 ou CBERS-4A 2 m pan-sharpened), escolhida por
    cena_id ou a mais recente. Devolve grid no mesmo formato da interpolação."""
    try:
        if req.fonte == "cbers":
            return cbers.gerar_ndvi(req.poligono, req.data_ini, req.data_fim, req.nuvem_max, req.pixel_m, req.cena_id)
        return msr.gerar_ndvi(req.poligono, req.data_ini, req.data_fim, req.nuvem_max, req.pixel_m, req.cena_id)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"falha ao gerar NDVI: {e}")


class ReqImagem(BaseModel):
    poligono: dict[str, Any]
    cena_id: str
    pixel_m: float = 10.0
    fonte: str = "sentinel"           # 'sentinel' | 'cbers'


@app.post("/ndvi-imagem")
def ndvi_imagem(req: ReqImagem):
    """Imagem de satélite em cor verdadeira da cena escolhida, recortada no
    talhão e alinhada ao NDVI. Sentinel-2 (TCI) ou CBERS-4A (Brovey 2 m). PNG."""
    try:
        if req.fonte == "cbers":
            return cbers.gerar_imagem(req.poligono, req.cena_id, req.pixel_m)
        return msr.gerar_imagem(req.poligono, req.cena_id, req.pixel_m)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"falha ao gerar imagem: {e}")


class ReqIndices(BaseModel):
    poligono: dict[str, Any]
    cena_id: str
    indices: list[str]                # ex.: ["NDVI","SAVI"] — calcula SÓ estes
    pixel_m: float = 10.0
    fonte: str = "sentinel"           # 'sentinel' | 'cbers'


@app.post("/indices")
def indices_vegetativos(req: ReqIndices):
    """Índices vegetativos SOB DEMANDA (IV2): baixa só as bandas necessárias da
    cena escolhida, aplica máscara SCL (Sentinel) e devolve 1 grid por índice."""
    try:
        if req.fonte == "cbers":
            return cbers.gerar_indices(req.poligono, req.cena_id, req.indices, req.pixel_m)
        return msr.gerar_indices(req.poligono, req.cena_id, req.indices, req.pixel_m)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"falha ao gerar índices: {e}")


class ReqColheita(BaseModel):
    machines: list[dict[str, Any]]    # [{nome, pontos:[{lng,lat,valor,vel?,larg?}]}]
    params: dict[str, Any]
    poligono: dict[str, Any]
    pixel_m: float = 10.0
    media_real: float = 0.0
    dominio: list[float]
    stops: list[Any]


@app.post("/colheita-processar")
def colheita_processar(req: ReqColheita):
    """Limpeza oficial de colheita (filtro bruto + operacional + correção por
    colhedora + MapFilter global/local) + IDW + média real. Devolve grid + relatório."""
    try:
        return colheita.processar(req.machines, req.params, req.poligono, req.pixel_m, req.media_real, req.dominio, req.stops)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"falha na limpeza de colheita: {e}")


class ReqLimpar(BaseModel):
    pontos: list[dict[str, Any]]      # [{lng, lat, valor}]
    params: dict[str, Any] = {}


@app.post("/limpar-pontos")
def limpar_pontos(req: ReqLimpar):
    """Limpeza dos pontos brutos (MapFilter global+local), SEM interpolar. Devolve
    os pontos limpos + relatório por etapa. Usado pela Condutividade (ver bruto →
    limpar → interpolar)."""
    try:
        return colheita.limpar_pontos(req.pontos, req.params)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"falha na limpeza: {e}")


@app.post("/zonear-analisar")
def zonear_analisar(req: ReqAnalisarZonas):
    """ETAPA 1 (Analisar): só FPI/NCE p/ 2..c_max + sugestão do nº de zonas
    (não gera/vetoriza). O gráfico FPI×NCE é mostrado ANTES da geração."""
    cams = [{"nome": c.nome, "b64": c.b64} for c in req.camadas]
    try:
        return interp.analisar_multi(cams, req.bounds, req.shape, req.algoritmo, req.c_min, req.c_max, req.poligono, req.pesos)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"falha ao analisar zonas: {e}")


@app.post("/zonear-gerar")
def zonear_gerar(req: ReqGerarZonas):
    """ETAPA 2 (Gerar): clusteriza com o nº ESCOLHIDO + área mínima + vetoriza
    (identidade única). Avaliação de qualidade (CV etc.) é feita DEPOIS, no front."""
    cams = [{"nome": c.nome, "b64": c.b64} for c in req.camadas]
    try:
        return interp.gerar_multi(cams, req.bounds, req.shape, req.n_classes, req.algoritmo, req.poligono, req.area_min_ha, req.pesos)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"falha ao gerar zonas: {e}")
