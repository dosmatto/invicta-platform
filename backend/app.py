"""API de interpolacao de fertilidade (FastAPI).

Roda local: `python -m uvicorn app:app --host 127.0.0.1 --port 8800`
ou use o start.ps1 / start.bat desta pasta.
"""
from __future__ import annotations

import inspect
import os
from typing import Any

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

import admin_usuarios
import interp
import msr
import cbers
import colheita
import mde
import ia

app = FastAPI(title="INVICTA - Interpolacao de Fertilidade", version="0.1.0")

# Protecao anti-abuso OPT-IN (sem a env definida, nada muda: continua sem auth).
API_KEY = os.environ.get("INVICTA_API_KEY", "")

# CORS restringivel OPT-IN (sem a env definida, mantem ["*"] como hoje).
_origins_env = os.environ.get("INVICTA_ALLOWED_ORIGINS", "")
ALLOWED_ORIGINS = [o.strip() for o in _origins_env.split(",") if o.strip()] if _origins_env else ["*"]

# Local: front em localhost:3100 chama este servico em 127.0.0.1:8800.
#
# PRIVATE NETWORK ACCESS: quando o app PUBLICADO (https) chama este backend em
# 127.0.0.1, o Chrome manda um preflight com Access-Control-Request-Private-Network.
# A partir do Starlette 1.x o proprio CORSMiddleware valida isso e RESPONDE 400
# ("Disallowed CORS private-network") se nao autorizarmos aqui — era o que fazia
# o interpolador local aparecer como "sem resposta" mesmo com o servidor no ar.
# O parametro nao existe em Starlette antigo, entao so passamos se ele existir.
_cors = {
    "allow_origins": ALLOWED_ORIGINS,
    "allow_methods": ["*"],
    "allow_headers": ["*", "X-Api-Key"],
}
if "allow_private_network" in inspect.signature(CORSMiddleware.__init__).parameters:
    _cors["allow_private_network"] = True
app.add_middleware(CORSMiddleware, **_cors)


# ── Reciclagem do worker (para o WINDOWS) ────────────────────────────────────
# Rasters incham e fragmentam a memoria do processo: um worker de vida longa vai
# para swap e o backend fica tao lento que parece travado. Na nuvem e no macOS o
# gunicorn resolve com --max-requests, mas o gunicorn NAO roda no Windows.
#
# Aqui o proprio app faz o papel: conta as requisicoes e, ao passar do limite, o
# worker se aposenta. Quem o traz de volta e o supervisor do uvicorn, que
# ressuscita worker morto (supervisors/multiprocess.py: keep_subprocess_alive) —
# por isso o Windows sobe com --workers 2: enquanto um renasce, o outro atende.
#
# So liga com RECICLAR_APOS no ambiente (o start.ps1 define). Sem a env e um
# no-op — no macOS/nuvem quem recicla continua sendo o gunicorn.
_RECICLAR_APOS = int(os.getenv("RECICLAR_APOS", "0") or 0)
if _RECICLAR_APOS > 0:
    import random
    import threading

    # Jitter POR PROCESSO (cada worker sorteia o seu na importacao): sem isso os
    # workers nasceriam juntos, contariam junto e se aposentariam ao mesmo tempo,
    # deixando um vao sem ninguem atendendo.
    _LIMITE = _RECICLAR_APOS + random.randint(0, int(os.getenv("RECICLAR_JITTER", "25") or 0))
    _trava = threading.Lock()
    _atendidas = 0
    _em_voo = 0

    @app.middleware("http")
    async def _reciclar_worker(request, call_next):
        global _atendidas, _em_voo
        with _trava:
            _em_voo += 1
        try:
            resposta = await call_next(request)
        finally:
            with _trava:
                _em_voo -= 1
                _atendidas += 1
                # So se aposenta OCIOSO: sair com pedido em voo mataria um
                # processamento no meio (e o usuario perderia o trabalho).
                aposentar = _atendidas >= _LIMITE and _em_voo == 0
        if aposentar:
            # Espera a resposta sair pelo socket antes de encerrar. os._exit
            # porque o objetivo e justamente NAO desmontar nada devagar: o
            # supervisor sobe um processo novo, com a memoria zerada.
            threading.Timer(1.5, lambda: os._exit(0)).start()
        return resposta


# Exige X-Api-Key em todos os endpoints (exceto /health e preflight OPTIONS)
# quando INVICTA_API_KEY estiver definida no ambiente. Sem a env, este
# middleware e um no-op — comportamento identico ao anterior.
@app.middleware("http")
async def _exigir_api_key(request, call_next):
    if API_KEY and request.method != "OPTIONS" and request.url.path != "/health":
        if request.headers.get("x-api-key") != API_KEY:
            return JSONResponse(status_code=401, content={"detail": "Nao autorizado: chave de API ausente ou invalida."})
    return await call_next(request)


# Permite que o app publicado (HTTPS) acesse este backend LOCAL em 127.0.0.1
# (Private Network Access). Funciona no Chrome; em https->http localhost outros
# navegadores podem bloquear (use o app local ou um backend na nuvem nesse caso).
@app.middleware("http")
async def _allow_private_network(request, call_next):
    resp = await call_next(request)
    resp.headers["Access-Control-Allow-Private-Network"] = "true"
    return resp


# ── Admin de usuarios (Supabase Auth via service_role — ver admin_usuarios.py) ──
# Guard duplo: (1) envs configuradas no Render (senao 503 e o front usa o caminho
# antigo); (2) o access_token do CHAMADOR e validado no GoTrue e o e-mail dele
# conferido em INVICTA_ADMIN_EMAILS — a X-Api-Key publica NAO basta para admin.


class ReqAdminUsuario(BaseModel):
    email: str
    senha: str


def _exigir_admin(request: Request) -> None:
    if not admin_usuarios.configurado():
        raise HTTPException(503, "Admin de usuarios nao configurado no servidor — defina SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e INVICTA_ADMIN_EMAILS no Render.")
    auth = request.headers.get("authorization") or ""
    token = auth[7:] if auth.lower().startswith("bearer ") else ""
    if not admin_usuarios.chamador_eh_admin(token):
        raise HTTPException(403, "Apenas administradores autorizados podem executar esta acao.")


@app.post("/admin-usuarios/resetar-senha")
def admin_resetar_senha(req: ReqAdminUsuario, request: Request):
    _exigir_admin(request)
    ok, erro = admin_usuarios.resetar_senha(req.email.strip().lower(), req.senha)
    if not ok:
        raise HTTPException(400, erro)
    return {"ok": True}


@app.post("/admin-usuarios/criar")
def admin_criar_usuario(req: ReqAdminUsuario, request: Request):
    _exigir_admin(request)
    resultado, erro = admin_usuarios.criar_usuario(req.email.strip().lower(), req.senha)
    if resultado == "erro":
        raise HTTPException(400, erro)
    return {"ok": True, "jaExiste": resultado == "ja_existe"}


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
    # Malha cobrindo 100% do poligono: um pixel de folga + celula que TOCA entra
    # (em vez de exigir o no dentro). Usado pelo raster de 20 m da Recomendacao,
    # que sem isso deixava ate um pixel sem dose em toda a divisa. O corte exato
    # pelo contorno acontece depois, no desenho e na exportacao.
    cobrir_poligono: bool = False


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
        # Instrumentacao leve (sem rodar benchmark — /health e chamado a cada tela):
        "cpu_count": os.cpu_count(),
        "libs": interp._versoes(),
        "cache": dict(interp._cache_stats),
        # "server" = gunicorn/x.y quando roda reciclado (fix v2.7.32); vazio se
        # ainda em uvicorn puro (deploy do backend nao propagou).
        "server": os.environ.get("SERVER_SOFTWARE", ""),
        "workers": os.environ.get("WEB_CONCURRENCY", ""),
    }


@app.get("/diag")
def diag():
    """Auto-diagnostico de CPU: roda um trabalho de krigagem FIXO dentro do
    container e reporta quanto ESTE servidor leva (ref. Mac ~480ms). Serve para
    provar/refutar 'a CPU do host e o gargalo' sem acesso ao painel. Rota manual
    (nao roda no /health) — nao ha efeito colateral e nao persiste nada."""
    return interp.autodiagnostico()


@app.post("/interpolar")
def interpolar(req: ReqInterp):
    pts = [{"lng": p.lng, "lat": p.lat, "valor": p.valor} for p in req.pontos]
    try:
        return interp.interpolar(pts, req.poligono, req.dominio, req.stops, req.pixel_m, req.metodo, req.modelo_fixo, req.variograma_manual, req.cobrir_poligono)
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


class ReqMdePontos(BaseModel):
    pontos: list[dict[str, Any]]      # [{lng, lat, valor=elevação}] — export de EC/colheita/RTK
    poligono: dict[str, Any]
    pixel_m: float = 10.0
    buffer_m: float = 200.0
    sensibilidade: str = "media"


@app.post("/mde-pontos")
def mde_pontos(req: ReqMdePontos):
    """MDE F5: MDE PRÓPRIO a partir de pontos de elevação (interpola + base +
    análise numa chamada)."""
    try:
        return mde.gerar_mde_pontos(req.pontos, req.poligono, req.pixel_m, req.buffer_m, req.sensibilidade)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"falha no MDE próprio: {e}")


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


class ReqIaChat(BaseModel):
    contexto: dict[str, Any]
    pergunta: str
    historico: list[dict[str, str]] | None = None   # [{role, content}] anteriores


@app.post("/ia-chat")
def ia_chat(req: ReqIaChat):
    """IA F3: Chat do Talhão — Q&A livre usando só o contexto do talhão."""
    try:
        return ia.chat_talhao(req.contexto, req.pergunta, req.historico)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"falha no chat de IA: {e}")


class ReqIaExplicar(BaseModel):
    dados: dict[str, Any]                            # doses/zona + fertilidade + metas + cultura + produto + custo


@app.post("/ia-explicar-recomendacao")
def ia_explicar(req: ReqIaExplicar):
    """IA F3: Explicador de Recomendação (§18) — explica as doses sem alterá-las."""
    try:
        return ia.explicar_recomendacao(req.dados)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"falha ao explicar recomendação: {e}")


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


class ReqSuavizarZonas(BaseModel):
    fc: dict[str, Any]                # FeatureCollection das zonas (geradas/salvas)
    poligono: dict[str, Any] | None = None   # limite oficial do talhão
    nivel: str = "moderado"           # 'leve' | 'moderado' | 'intenso' | 'personalizado'
    tolerancia_m: float | None = None  # só no personalizado (senão deriva do passo)
    iteracoes: int | None = None       # só no personalizado (Chaikin 0..5)
    frag_min_ha: float = 0.0           # 0 = não absorver fragmentos (ruído sempre sai)
    largura_min_m: float = 0.0         # 0 = não remover trechos estreitos
    manter_limite_externo: bool = True  # padrão: contorno do talhão INTOCADO


@app.post("/zonear-suavizar")
def zonear_suavizar(req: ReqSuavizarZonas):
    """SUAVIZAR limites (pós-geração, opcional): trata as zonas como COBERTURA,
    suaviza cada divisa UMA vez só (mesma linha p/ as duas vizinhas — sem
    sobreposição/vão), preserva o contorno do talhão por padrão e devolve
    prévia + resumo (áreas, vértices, deslocamento). Aplicar é decisão do usuário."""
    try:
        return interp.suavizar_zonas(req.fc, req.poligono, req.nivel, req.tolerancia_m,
                                     req.iteracoes, req.frag_min_ha, req.largura_min_m,
                                     req.manter_limite_externo)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"falha ao suavizar zonas: {e}")


class ReqDividirZona(BaseModel):
    zona: dict[str, Any]               # geometria (ou Feature) da zona a dividir
    linha: dict[str, Any]              # LineString do traço desenhado no mapa


@app.post("/zonear-dividir")
def zonear_dividir(req: ReqDividirZona):
    """CORTE POR LINHA (editor manual): divide UMA zona pelo traço desenhado no
    mapa. shapely.ops.split é exato — as partes reconstituem a zona sem vão nem
    sobreposição, inclusive em zona côncava ou com ilha."""
    try:
        return interp.dividir_zona(req.zona, req.linha)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"falha ao dividir a zona: {e}")


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
