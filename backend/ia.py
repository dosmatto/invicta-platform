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

VERSION = "ia-1-diagnostico"

URL_OPENAI = "https://api.openai.com/v1/chat/completions"
MODELO_PADRAO = "gpt-4o"          # diagnostico completo = modelo avancado (secao 6)
_TIMEOUT = 120

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


def diagnostico_talhao(contexto: dict[str, Any], tipo_analise: str = "diagnostico_integrado") -> dict[str, Any]:
    """Chama a OpenAI com o contexto resumido e devolve o diagnostico validado
    + metadados de auditoria (modelo, tokens)."""
    chave = os.environ.get("OPENAI_API_KEY")
    if not chave:
        raise ValueError("IA não configurada no servidor: defina OPENAI_API_KEY no painel do Render (Environment).")
    if not isinstance(contexto, dict) or not contexto:
        raise ValueError("contexto vazio — a plataforma não montou os dados do talhão")

    modelo = os.environ.get("OPENAI_MODEL", MODELO_PADRAO)
    corpo = json.dumps({
        "model": modelo,
        "response_format": {"type": "json_object"},
        "temperature": 0.3,
        "messages": [
            {"role": "system", "content": PROMPT_SISTEMA},
            {"role": "user", "content": "Dados do talhão (tipo de análise: " + str(tipo_analise) + "):\n" + json.dumps(contexto, ensure_ascii=False)},
        ],
    }).encode()

    req = urllib.request.Request(URL_OPENAI, data=corpo, method="POST", headers={
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
        bruto = json.loads(texto)
    except Exception as e:  # noqa: BLE001
        raise ValueError(f"resposta da IA fora do formato esperado: {e}") from e

    uso = j.get("usage", {})
    return {
        "resposta": _validar(bruto),
        "modelo": j.get("model", modelo),
        "tokens_entrada": int(uso.get("prompt_tokens", 0)),
        "tokens_saida": int(uso.get("completion_tokens", 0)),
    }
