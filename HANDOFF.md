# HANDOFF

## 2026-11-04 — Alerta "rls_disabled_in_public" do Supabase (invicta-prod)

Projeto: `hxmfjdwoltrnbovgbmoz` (nome no painel: "invicta-prod", org Invicta), plataforma AP.

### Diagnóstico (só leitura, Security Advisor + catálogo)

- Antes: **1 erro, 16 avisos, 9 sugestões**.
- A **única** tabela do `public` sem RLS é `public.spatial_ref_sys` (PostGIS, dona
  `supabase_admin`). Todas as tabelas da aplicação já têm RLS ligado.
- `spatial_ref_sys` tem ACL `anon=arwdDxtm/supabase_admin`,
  `authenticated=arwdDxtm/supabase_admin`. O grantor é o `supabase_admin` e o
  `postgres` não tem grant option, então **o postgres não consegue revogar**.
- Tabelas da aplicação: 13 tabelas "tenant" com policy `tenant_all` via
  `auth_empresa_ids()`; `app_kv` (12 policies); `talhoes` (5 policies).
  `pf_*` (8 tabelas) e `integracao_chaves` são só de servidor (service role),
  com RLS ligado sem policy, o que significa negar tudo de propósito.
- Aviso "New tables in public need explicit grants from October 30": **não
  afetou** este projeto. O `pg_default_acl` do `public` ainda concede
  `arwdDxtm` a anon/authenticated em tabela nova criada pelo `postgres`, e o
  último `CREATE TABLE` do repo é de 27/10. Nenhuma tela perdeu grant.
- Backup: diário físico, último em 2026-11-04 10:27 UTC (conferido antes de aplicar).

### O que foi aplicado

Migration `supabase/migrations/20261104120000_seguranca_advisors.sql` (SHA-1
`00aa03869a431eaaaadeccc698fe8eed72345bfa`), colada no SQL Editor com o
SHA-1 conferido e aplicada em 2026-11-04:

1. `revoke all on public.spatial_ref_sys from anon, authenticated`. **Sem
   efeito**, como previsto: o ACL ficou idêntico.
2. `revoke all on public.integracao_chaves from anon, authenticated`. O ACL
   agora é só `postgres` e `service_role`.
3. `search_path = public, pg_temp` em `inv_textos(jsonb)`,
   `inv_talhao_do_registro(text,text,jsonb)` e
   `inv_produtor_pode_gravar(text,text,jsonb)`.

A reversão está no rodapé da própria migration.

### Depois

- Advisors (rerun): **1 erro, 13 avisos, 9 sugestões**.
  - Os 3 avisos "Function Search Path Mutable" sumiram.
  - Continua o erro `spatial_ref_sys`: **falso positivo conhecido** do PostGIS
    no schema `public`. Só o suporte resolve.
  - As sugestões "RLS Enabled No Policy" continuam (9), porque o lint olha
    policy e não grant. Nas `pf_*` e em `integracao_chaves` isso é intencional:
    só o servidor acessa.

- Teste em produção (v2.217.4, usuário admin, depois da migration):
  - O login funcionou e o painel mostrou 1133 talhões.
  - O "Mapa geral dos talhões" abriu e classificou por localização (Paraná 1112 / Todos 1133).
  - Todas as chamadas `rest/v1/talhoes` e `rest/v1/app_kv` voltaram 200/206, sem erro no console.
  - Não testado: um usuário **produtor**. As funções com `search_path` novo atuam nas
    policies RESTRICTIVE do produtor.

### Pendências (não feitas nesta rodada)

- [ ] **Abrir chamado no suporte do Supabase** pedindo, como `supabase_admin`:
      `revoke all on table public.spatial_ref_sys from anon, authenticated;`
      Hoje anon e authenticated conseguem escrever nessa tabela pela API. NÃO
      mover o PostGIS de schema, porque a extensão não é realocável.
- [ ] **`talhoes_autenticado` é `ALL` com `using=true` e `check=true`**: qualquer
      usuário logado lê e grava talhões de qualquer empresa. As outras tabelas
      filtram por `auth_empresa_ids()`. Precisa de uma conversa própria (ver se
      `talhoes` tem `empresa_id`, quem grava, e o impacto nas telas).
- [ ] `lab_chaves` **não existe em produção**, mas `src/lib/laudo/servidor.ts`
      a consulta: `docs/api-laudos.sql` nunca foi aplicado.
- [ ] Avisos restantes, aceitos por ora: extensões `postgis`/`pg_net` no
      `public`; `st_estimatedextent` (SECURITY DEFINER do PostGIS) executável por
      anon; funções `inv_*`/`auth_empresa_ids` SECURITY DEFINER executáveis por
      authenticated (necessário: as policies as chamam).
