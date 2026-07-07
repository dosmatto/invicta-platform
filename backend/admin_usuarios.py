"""Admin de usuarios (Supabase Auth) — resetar senha e criar conta via
service_role, chamado pelo painel (botao "Resetar senha" e convite).

Tudo OPT-IN: exige SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + INVICTA_ADMIN_EMAILS
no ambiente (Render). Sem elas, configurado() e False e os endpoints devolvem 503
— o front cai no caminho antigo (signUp no client). A service_role NUNCA vai ao
front; e cada chamada valida o access_token do CHAMADOR no GoTrue e confere se o
e-mail dele esta na lista de admins (a chave publica X-Api-Key nao basta para
acoes de admin).

Usa urllib (padrao do backend, sem dependencia nova — ver ia.py).
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

SUPABASE_URL = (os.environ.get("SUPABASE_URL") or "").rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
ADMIN_EMAILS = {e.strip().lower() for e in os.environ.get("INVICTA_ADMIN_EMAILS", "").split(",") if e.strip()}
_TIMEOUT = 15


def configurado() -> bool:
    return bool(SUPABASE_URL and SERVICE_KEY and ADMIN_EMAILS)


def _req(rota: str, method: str = "GET", payload: dict | None = None, token: str | None = None) -> tuple[int, dict]:
    """Chamada ao GoTrue. token=None usa a service_role (acoes admin)."""
    headers = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {token or SERVICE_KEY}",
        "Content-Type": "application/json",
    }
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(f"{SUPABASE_URL}/auth/v1{rota}", data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as r:
            corpo = r.read().decode() or "{}"
            return r.status, json.loads(corpo)
    except urllib.error.HTTPError as e:
        try:
            corpo = json.loads(e.read().decode() or "{}")
        except Exception:
            corpo = {}
        return e.code, corpo


def chamador_eh_admin(token: str) -> bool:
    """Valida o access_token do chamador e confere o e-mail na lista de admins."""
    if not token:
        return False
    st, corpo = _req("/user", token=token)
    if st != 200:
        return False
    email = (corpo.get("email") or "").strip().lower()
    return bool(email) and email in ADMIN_EMAILS


def _achar_usuario_id(email: str) -> str | None:
    """Procura o usuario pelo e-mail na listagem admin (paginada)."""
    alvo = email.strip().lower()
    pagina = 1
    while pagina <= 20:  # ate 4.000 usuarios — muito acima do necessario
        st, corpo = _req(f"/admin/users?page={pagina}&per_page=200")
        if st != 200:
            return None
        users = corpo.get("users") or []
        for u in users:
            if (u.get("email") or "").strip().lower() == alvo:
                return u.get("id")
        if len(users) < 200:
            return None
        pagina += 1
    return None


def resetar_senha(email: str, senha: str) -> tuple[bool, str]:
    """Define uma senha nova para o usuario e marca o e-mail como confirmado
    (destrava contas presas em 'confirmacao pendente')."""
    uid = _achar_usuario_id(email)
    if not uid:
        return False, "Usuario nao encontrado no Supabase Auth (a conta de login nao existe)."
    st, corpo = _req(f"/admin/users/{uid}", "PUT", {"password": senha, "email_confirm": True})
    if st == 200:
        return True, ""
    return False, corpo.get("msg") or corpo.get("message") or f"Erro {st} ao redefinir a senha."


def criar_usuario(email: str, senha: str) -> tuple[str, str]:
    """Cria a conta ja CONFIRMADA (nao depende do toggle 'Confirm email').
    Retorna ('ok'|'ja_existe'|'erro', mensagem)."""
    st, corpo = _req("/admin/users", "POST", {"email": email, "password": senha, "email_confirm": True})
    if st in (200, 201):
        return "ok", ""
    m = (corpo.get("msg") or corpo.get("message") or "").lower()
    if st in (409, 422) and ("already" in m or "registered" in m or "exists" in m):
        return "ja_existe", ""
    return "erro", corpo.get("msg") or corpo.get("message") or f"Erro {st} ao criar o usuario."
