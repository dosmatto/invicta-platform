"""IA — Diagnostico Inteligente por Talhao (Fase 1 da spec de IA).

Fluxo RAG (secao 7): o FRONT monta o pacote de CONTEXTO resumido (dados que a
plataforma ja tem) e manda para ca; ESTE modulo chama a OpenAI API com um
prompt FIXO (secao 10) e devolve o JSON estruturado validado. A chave fica
SO no servidor (env OPENAI_API_KEY — secao 21); nada de SDK novo: a API REST
e chamada com urllib (sem dependencia adicional no requirements).

Regras honradas:
  - a IA nao acessa banco nenhum (recebe apenas o contexto resumido);
  - resposta forcada a JSON (response_format json_object) e VALIDADA aqui;
  - tokens de entrada/saida devolvidos p/ auditoria/custo (secoes 13-14).
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any

VERSION = "ia-3-chat-explicador"

URL_OPENAI = "https://api.openai.com/v1/chat/completions"
MODELO_PADRAO = "gpt-4o"          # diagnostico completo = modelo avancado (secao 6)
_TIMEOUT = 120

# Preco aproximado por 1M de tokens (USD in, USD out) — SO p/ estimar custo na
# auditoria (secao 14); a cobranca real e a da OpenAI. Atualizavel. Match por
# prefixo mais LONGO primeiro (gpt-4o-mini antes de gpt-4o).
_PRECO_USD_1M = {
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4o": (2.50, 10.00),
    "gpt-4.1-mini": (0.40, 1.60),
    "gpt-4.1-nano": (0.10, 0.40),
    "gpt-4.1": (2.00, 8.00),
    "o4-mini": (1.10, 4.40),
}
_PRECO_PADRAO = (2.50, 10.00)


def _custo_usd(modelo: str, ti: int, to: int) -> float:
    p_in, p_out = _PRECO_PADRAO
    for pref in sorted(_PRECO_USD_1M, key=len, reverse=True):
        if modelo.startswith(pref):
            p_in, p_out = _PRECO_USD_1M[pref]
            break
    return round((ti / 1_000_000) * p_in + (to / 1_000_000) * p_out, 5)

# Prompt fixo do Diagnostico Inteligente por Talhao (secao 10 da spec).
PROMPT_SISTEMA = """Você é uma IA agronômica da plataforma Invicta, especializada em Agricultura de Precisão, fertilidade de solos, produtividade, sensoriamento remoto e zonas de manejo.

Sua função é analisar os dados fornecidos pela plataforma e gerar um diagnóstico técnico do talhão.

Regras obrigatórias:
- Use somente os dados fornecidos.
- Não invente valores, mapas, histórico ou conclusões sem base.
- Quando faltar dado importante, informe a limitação.
- Seja técnico, mas escreva de forma clara.
- Separe o que é evidência forte, hipótese e recomendação de investigação.
- Nunca gere recomendação definitiva de dose sem regra agronômica validada pela plataforma.
- Sempre informe o nível de confiança da análise.
- Responda em português do Brasil.

Gere a resposta ESTRITAMENTE em JSON com os seguintes campos:

{
  "diagnostico_geral": "",
  "potencial_do_talhao": "alto | medio | baixo | indefinido",
  "principais_limitantes": [],
  "evidencias_tecnicas": [],
  "hipoteses_agronomicas": [],
  "oportunidades_de_manejo": [],
  "riscos": [],
  "dados_ausentes_relevantes": [],
  "nivel_de_confianca": "alto | medio | baixo",
  "justificativa_confianca": "",
  "resumo_para_produtor": "",
  "resumo_tecnico_interno": ""
}"""

CAMPOS_OBRIGATORIOS = [
    "diagnostico_geral", "potencial_do_talhao", "principais_limitantes",
    "evidencias_tecnicas", "hipoteses_agronomicas", "oportunidades_de_manejo",
    "riscos", "dados_ausentes_relevantes", "nivel_de_confianca",
    "justificativa_confianca", "resumo_para_produtor", "resumo_tecnico_interno",
]
_LISTAS = {"principais_limitantes", "evidencias_tecnicas", "hipoteses_agronomicas",
           "oportunidades_de_manejo", "riscos", "dados_ausentes_relevantes"}


def configurada() -> bool:
    return bool(os.environ.get("OPENAI_API_KEY"))


def _validar(resp: dict[str, Any]) -> dict[str, Any]:
    """Garante o shape do JSON (secao 10): campos presentes e tipos certos."""
    out: dict[str, Any] = {}
    for c in CAMPOS_OBRIGATORIOS:
        v = resp.get(c)
        if c in _LISTAS:
            out[c] = [str(x) for x in v] if isinstance(v, list) else ([] if v is None else [str(v)])
        else:
            out[c] = str(v) if v is not None else ""
    if out["potencial_do_talhao"] not in ("alto", "medio", "baixo", "indefinido"):
        out["potencial_do_talhao"] = "indefinido"
    if out["nivel_de_confianca"] not in ("alto", "medio", "baixo"):
        out["nivel_de_confianca"] = "baixo"
    return out


def _chamar(messages: list[dict[str, str]], json_mode: bool = True, temperature: float = 0.3) -> dict[str, Any]:
    """Chamada única à OpenAI (REST puro) com tratamento de erro compartilhado.
    Devolve {texto, modelo, tokens_entrada, tokens_saida, custo_estimado}."""
    chave = os.environ.get("OPENAI_API_KEY")
    if not chave:
        raise ValueError("IA não configurada no servidor: defina OPENAI_API_KEY no painel do Render (Environment).")
    modelo = os.environ.get("OPENAI_MODEL", MODELO_PADRAO)
    payload: dict[str, Any] = {"model": modelo, "temperature": temperature, "messages": messages}
    if json_mode:
        payload["response_format"] = {"type": "json_object"}
    req = urllib.request.Request(URL_OPENAI, data=json.dumps(payload).encode(), method="POST", headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {chave}",
    })
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as r:
            j = json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        detalhe = ""
        try:
            detalhe = json.loads(e.read().decode()).get("error", {}).get("message", "")
        except Exception:
            pass
        if e.code == 401:
            raise ValueError("chave da OpenAI inválida/expirada — confira OPENAI_API_KEY no Render") from e
        if e.code == 429:
            raise ValueError("limite/crédito da OpenAI esgotado — verifique o billing da conta. " + detalhe) from e
        raise ValueError(f"OpenAI respondeu {e.code}: {detalhe or e.reason}") from e

    try:
        texto = j["choices"][0]["message"]["content"]
    except Exception as e:  # noqa: BLE001
        raise ValueError(f"resposta da IA fora do formato esperado: {e}") from e
    uso = j.get("usage", {})
    ti, to = int(uso.get("prompt_tokens", 0)), int(uso.get("completion_tokens", 0))
    modelo_usado = j.get("model", modelo)
    return {"texto": texto, "modelo": modelo_usado, "tokens_entrada": ti, "tokens_saida": to,
            "custo_estimado": _custo_usd(modelo_usado, ti, to)}


def diagnostico_talhao(contexto: dict[str, Any], tipo_analise: str = "diagnostico_integrado") -> dict[str, Any]:
    """Chama a OpenAI com o contexto resumido e devolve o diagnostico validado
    + metadados de auditoria (modelo, tokens)."""
    if not isinstance(contexto, dict) or not contexto:
        raise ValueError("contexto vazio — a plataforma não montou os dados do talhão")
    r = _chamar([
        {"role": "system", "content": PROMPT_SISTEMA},
        {"role": "user", "content": "Dados do talhão (tipo de análise: " + str(tipo_analise) + "):\n" + json.dumps(contexto, ensure_ascii=False)},
    ], json_mode=True)
    try:
        bruto = json.loads(r["texto"])
    except Exception as e:  # noqa: BLE001
        raise ValueError(f"resposta da IA fora do formato esperado: {e}") from e
    return {
        "resposta": _validar(bruto),
        "modelo": r["modelo"], "tokens_entrada": r["tokens_entrada"],
        "tokens_saida": r["tokens_saida"], "custo_estimado": r["custo_estimado"],
    }


# ── F3: Chat do talhao (secao 19) — resposta em TEXTO usando so o contexto ──
PROMPT_CHAT = """Você é a IA agronômica da plataforma Invicta. Responda à pergunta do usuário usando SOMENTE os dados do talhão fornecidos em JSON.

Regras:
- Use apenas os dados fornecidos; não invente valores, mapas ou histórico.
- Se a resposta não estiver nos dados, diga claramente que o dado não está disponível na plataforma.
- Seja técnico, direto e em português do Brasil. Respostas curtas (1 a 4 parágrafos).
- Não dê recomendação definitiva de dose sem regra agronômica; sugira investigação quando fizer sentido."""


def chat_talhao(contexto: dict[str, Any], pergunta: str, historico: list[dict[str, str]] | None = None) -> dict[str, Any]:
    """Q&A livre sobre o talhao. `historico` = mensagens anteriores
    [{role:'user'|'assistant', content:str}] p/ manter o fio da conversa."""
    if not isinstance(contexto, dict) or not contexto:
        raise ValueError("contexto vazio — a plataforma não montou os dados do talhão")
    if not str(pergunta or "").strip():
        raise ValueError("pergunta vazia")
    msgs = [
        {"role": "system", "content": PROMPT_CHAT},
        {"role": "system", "content": "Dados do talhão (JSON):\n" + json.dumps(contexto, ensure_ascii=False)},
    ]
    for m in (historico or [])[-8:]:   # limita o histórico enviado (custo)
        if m.get("role") in ("user", "assistant") and m.get("content"):
            msgs.append({"role": m["role"], "content": str(m["content"])[:2000]})
    msgs.append({"role": "user", "content": str(pergunta)[:2000]})
    r = _chamar(msgs, json_mode=False, temperature=0.4)
    return {"resposta": r["texto"].strip(), "modelo": r["modelo"],
            "tokens_entrada": r["tokens_entrada"], "tokens_saida": r["tokens_saida"],
            "custo_estimado": r["custo_estimado"]}


# ── F3: Explicador de Recomendacao (secao 18) — JSON estruturado ──
PROMPT_EXPLICAR = """Você é a IA agronômica da plataforma Invicta. Explique a RECOMENDAÇÃO fornecida (doses por zona/talhão), usando SOMENTE os dados fornecidos.

Regras:
- Não invente números; use as doses, metas e dados de fertilidade fornecidos.
- Explique POR QUE as maiores e as menores doses; aponte inconsistências se houver.
- Não altere as doses; você EXPLICA a recomendação, não a refaz.
- Português do Brasil, técnico e claro.

Responda ESTRITAMENTE em JSON:
{
  "explicacao_tecnica": "",
  "explicacao_produtor": "",
  "justificativa_maiores_doses": "",
  "justificativa_menores_doses": "",
  "inconsistencias": [],
  "nivel_de_confianca": "alto | medio | baixo"
}"""

_CAMPOS_EXPLICAR = ["explicacao_tecnica", "explicacao_produtor",
                    "justificativa_maiores_doses", "justificativa_menores_doses",
                    "inconsistencias", "nivel_de_confianca"]


def explicar_recomendacao(dados: dict[str, Any]) -> dict[str, Any]:
    """Explica um mapa/tabela de recomendacao (doses por zona + fertilidade +
    metas + cultura + produto + custo). Devolve JSON validado."""
    if not isinstance(dados, dict) or not dados:
        raise ValueError("dados da recomendação vazios")
    r = _chamar([
        {"role": "system", "content": PROMPT_EXPLICAR},
        {"role": "user", "content": "Recomendação a explicar (JSON):\n" + json.dumps(dados, ensure_ascii=False)},
    ], json_mode=True)
    try:
        b = json.loads(r["texto"])
    except Exception as e:  # noqa: BLE001
        raise ValueError(f"resposta da IA fora do formato esperado: {e}") from e
    out: dict[str, Any] = {}
    for c in _CAMPOS_EXPLICAR:
        v = b.get(c)
        if c == "inconsistencias":
            out[c] = [str(x) for x in v] if isinstance(v, list) else ([] if v is None else [str(v)])
        else:
            out[c] = str(v) if v is not None else ""
    if out["nivel_de_confianca"] not in ("alto", "medio", "baixo"):
        out["nivel_de_confianca"] = "medio"
    return {"resposta": out, "modelo": r["modelo"], "tokens_entrada": r["tokens_entrada"],
            "tokens_saida": r["tokens_saida"], "custo_estimado": r["custo_estimado"]}
