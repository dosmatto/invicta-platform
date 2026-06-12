# Mapa da Plataforma + Reorganização (Biblioteca de Padrões)

> Documento vivo. Versão inicial: 2026-06-12. Atualizar a cada mudança estrutural.
> Fluxo obrigatório (diretriz oficial): levantar → mapear → identificar → propor → aprovar → implementar.
> **Status atual:** propostas (Partes 2 a 4) aguardando aprovação antes de qualquer código.

---

## Parte 1 — Mapa da Plataforma (estado atual)

### 1.1 Resumo executivo

- **Stack**: Next.js (App Router) + React + Tailwind + MapLibre GL. Backend Python local em `backend/` (FastAPI + PyKrige).
- **Estado**: AppContext (navegação) + `localStorage` (cache local) + Firestore (espelho opcional).
- **Sincronização nuvem**: opt-in por variáveis `NEXT_PUBLIC_FIREBASE_*`. Sem elas, o app roda 100% local.
- **Padrão de navegação**: estado (`activePanel`) — as rotas `/painel/**` existem mas a maioria está vazia (renderizadas em `<div className="hidden">` no `layout.tsx`).
- **Mapa**: MapView dinâmico (SSR off) com camadas `geojson` + `image` (raster da fertilidade).

### 1.2 Painéis e UI

#### 1.2.1 Painéis estáticos (`src/components/panels/`)

Registrados em `src/components/layout/SlidePanel.tsx`. Os do menu lateral usam `id` do `IconSidebar`.

| id | Painel | Status | Observação |
|---|---|---|---|
| `dashboard` | `DashboardPanel` | mock | Indicadores simulados |
| `produtores` | `ProdutoresPanel` | real | CRUD de clientes |
| `safras` | `SafrasPanel` | real | CRUD de safras |
| `cadastros` | `CadastrosPanel` | real | Padrões de elementos / amostragem |
| `base-agronomica` | `BaseAgronomicaPanel` | parcial | Leitura de `LEGENDAS_PADRAO` (legacy) |
| `legendas` | `LegendasPanel` | real | Editor completo do **motor novo** |
| `usuarios` | `UsuariosPanel` | mock | Sem CRUD real |
| `configuracoes` | `ConfiguracoesPanel` | real | Interpolador, etiquetas, dados de teste, changelog |

Painéis hierárquicos (por prefixo em `activePanel`):
- `produtor-{id}` → `ProdutorDetailPanel`
- `fazenda-{id}` → `FazendaDetailPanel`
- `talhao-{id}` → `TalhaoDetailPanel`

#### 1.2.2 Subseções do talhão (`src/components/talhao/`)

| Componente | Função |
|---|---|
| `AmostragemModulo.tsx` | Simulador de grade (densidade, borda, rotação, aleatoriedade) |
| `SimuladorZonas.tsx` | Zonas de manejo (composta/individual, distribuição) |
| `SimuladorAmostragem.tsx` | Antiga subseção de amostragem (usada indiretamente) |
| `ImportarGradeSection.tsx` | Upload de grade externa (SHP/GeoJSON) |
| `LabImportSection.tsx` | Upload de resultados de laboratório |
| `FertilidadeSection.tsx` | Interpolação de fertilidade + cache local/nuvem |
| `EtiquetaLayoutPicker.tsx` | Seletor de layout de etiquetas |

#### 1.2.3 Config (`src/components/config/`)

- `InterpoladorSection.tsx` — status do interpolador local, instruções, download.

#### 1.2.4 Agronomia legacy (`src/components/agronomica/`)

- `NutrienteCard.tsx` e `LegendaBar.tsx` — usam o sistema **antigo** (`LEGENDAS_PADRAO`, `CORES_CLASSES`). Aparecem somente no `BaseAgronomicaPanel` e na página `/painel/base-agronomica`.

### 1.3 Libs e lógica (`src/lib/`)

| Arquivo | Função |
|---|---|
| `store.ts` | CRUD local (todas as chaves `inv_*`); chama `cloudPushLista/Obj` quando há nuvem |
| `cloud.ts` | Espelho Firestore: `bootCloud`, push (lista/objeto), `cloudSalvarMapa`, `cloudCarregarMapasPorPrefixo` |
| `firebase.ts` | Inicialização (`getFb`) + `entrarAnonimo`; opt-in por env |
| `legendas.ts` | Motor **novo** de Legendas: `Legenda`, `ClasseLegenda`, `EstiloLegenda`, `PARES_OFICIAIS_5`, `gradienteCssDaLegenda`, `stopsParaBackend` |
| `fertilidade.ts` | Cliente do backend de interpolação; tipos `RespInterp`, `decodeGrid` |
| `raster.ts` | Colorização local em canvas a partir do grid Float32 |
| `lab.ts` | Importação de laboratório (CSV/XLSX); `PerfilLabConfig`, `ResultadoAmostra` |
| `grid.ts` | Gerador de grade de amostragem (com PRNG determinístico) |
| `zonas.ts` | Classificação de zonas de manejo (normalização de classes) |
| `geo.ts` | Parsers KML/GeoJSON/Shapefile; área e bbox |
| `importarGrade.ts` | Importação de grade externa por arquivo |
| `etiquetas.ts` | Geração de etiquetas (PDF) |
| `exportGrade.ts` | Exportação SHP/GeoJSON/XLSX |
| `seed.ts` / `teste.ts` | Dados iniciais e talhão-teste |
| `utils.ts` | Helpers |

### 1.4 Constantes (`src/constants/`)

| Arquivo | Conteúdo |
|---|---|
| `agronomica.ts` | **Legacy.** `LEGENDAS_PADRAO`, `LegendaNutriente`, `ClasseNutriente`, `CORES_CLASSES`, `GRADIENTE_*` |
| `legendasSeedABC.ts` | Seed Fundação ABC (motor novo) |
| `version.ts` | `APP_VERSION` + `CHANGELOG` |
| `mocks.ts` | Mocks variados (talhão KML URL etc.) |
| `seedTalhaoGeo.json` | Geometria do talhão-teste |
| `seedZonasJraba.json` | Zonas do talhão-teste |

### 1.5 Persistência

#### 1.5.1 localStorage / Firestore "lista" — chaves `inv_*`

Todas espelhadas no Firestore (mesmo nome de coleção, doc `{ id, json }`).

| Chave | Tipo | CRUD | Observação |
|---|---|---|---|
| `inv_clientes` | `Cliente[]` | OK | |
| `inv_fazendas` | `Fazenda[]` | OK | |
| `inv_talhoes` | `Talhao[]` | OK | guarda `geojson` e `zonasGeojson` como string |
| `inv_safras` | `Safra[]` | OK | |
| `inv_padroes_elem` | `PadraoElementos[]` | OK | |
| `inv_padroes_amos` | `PadraoAmostragem[]` | OK | |
| `inv_grades` | `GradeAmostragem[]` | OK | tem `metodo`, `modelo`, `modoDist`, `densidadePorZona` |
| `inv_lab_perfis` | `PerfilLab[]` | OK | |
| `inv_lab` | `ImportacaoLab[]` | OK | resultados ligados pelo `numero` |
| `inv_legendas` | `Legenda[]` | OK | motor novo; seed ABC idempotente |

#### 1.5.2 Firestore "objeto único" — coleção `inv_config`

| Chave | Tipo |
|---|---|
| `inv_etiqueta_cfg` | `ConfigEtiqueta` |

#### 1.5.3 Mapas de fertilidade — coleção `inv_mapas_fert`

- Doc id = `talhaoId__importacaoId__metodo__pixel__modeloFixo__nut__prof` (v0.23.x).
- v0.21.0–0.22.x usavam `__legendaId__nut__prof` no sufixo — leitura tolera ambos.
- Payload: `{ resp: { bounds, grid, stats }, labels }` (sem PNG colorido).

### 1.6 Rotas (`src/app/painel/**`)

Quase todas são **vestigiais** — o `layout.tsx` esconde o `children` em `<div className="hidden">`. Real:
- `/painel/base-agronomica` (editor legacy de legendas)
- `/painel/configuracoes` (apenas como entry; o painel mesmo vem via SlidePanel)
- `/portal` (separado)

Vestigiais: `/painel/{amostragem, condutividade, custos, fazendas, fertilidade, laboratorios, legendas, mapas-aplicacao, ndvi, operacoes, produtividade, produtores, qrcode, relatorios, safras, talhoes, usuarios, zonas-manejo}` — todas só ocupam slot na sidebar antiga (`Sidebar.tsx`, não usada na navegação real).

### 1.7 Duplicidades identificadas

| Onde | O que duplica | Recomendação |
|---|---|---|
| `constants/agronomica.ts` ↔ `lib/legendas.ts` | Dois sistemas de Legendas (antigo só leitura, novo editável) | Consolidar no novo; o antigo vira **snapshot/seed** ou é removido |
| `components/agronomica/{NutrienteCard,LegendaBar}` | Componentes só do legacy | Aposentar quando consolidar |
| `BaseAgronomicaPanel` ↔ `LegendasPanel` | Dois pontos de edição | Manter `LegendasPanel`; `BaseAgronomicaPanel` vira visão somente-leitura/seed |
| `Sidebar.tsx` ↔ `IconSidebar.tsx` | Duas sidebars, só a segunda é usada | Remover `Sidebar.tsx` |
| Rotas vestigiais (~18) | Páginas vazias em `/painel/*` | Limpar — manter apenas as reais |
| `SimuladorAmostragem` ↔ `AmostragemModulo` | Duas implementações no `talhao/` | Confirmar qual está ativa e remover a outra |

### 1.8 Pendências (lista herdada da memória + descobertas)

1. **BUG (Grid)** — salvar grade salva a versão original, não a editada (`SimuladorAmostragem.salvarGrade` / `pontosEfetivos`).
2. **Editar/Excluir Cliente e Talhão** — store tem `updateCliente/deleteCliente/updateTalhao`, falta UI.
3. **Município automático na Fazenda** — derivar do polígono dos talhões.
4. **Clicar na grade salva → exibir no mapa** — hoje só tem exportar/etiquetas.
5. **Bug atual (v0.23.x)** — cor não corresponde ao valor amostral (em diagnóstico via Debug `🔬`).
6. **Mac/Safari** — bloqueio de mixed content (orientado a usar Chrome).
7. **NutrienteCard** — modo edit não persiste no store novo.

---

## Parte 2 — Proposta: Biblioteca de Padrões

### 2.1 Conceito

Um módulo único **"Biblioteca"** se torna a **fonte única** de configurações, padrões, perfis, equações, legendas, laboratórios e regras de interpretação. Nenhum módulo cria configurações isoladas.

**Três escopos** por item (cada um é uma "visibilidade"):
- `meu` — privado do usuário.
- `empresa` — compartilhado pela organização.
- `sistema` — disponibilizado pelo sistema (read-only ou ramificável).

**Operações comuns** a toda categoria: criar, editar, duplicar, excluir, ativar/inativar, compartilhar (escalar escopo), exportar, importar, definir como padrão.

### 2.2 As 15 categorias da Biblioteca

| Slug | Nome | O que migra |
|---|---|---|
| `preferencias-analise` | Preferências de Análise | configurações cross-módulo (unidades, profundidades padrão…) |
| `grades` | Grades | padrões de amostragem, modelos de grade, densidades |
| `fertilidade` | Fertilidade | regras de interpretação, parâmetros padrão de krigagem/IDW |
| `analises-foliares` | Análises Foliares | (novo) |
| `altimetria` | Altimetria | (novo) |
| `imagem-satelite` | Imagem de Satélite | (novo) |
| `compactacao` | Compactação | (novo) |
| `algebra-mapas` | Álgebra de Mapas | (novo) |
| `pragas` | Pragas | (novo) |
| `equacoes` | Equações | fórmulas/cálculos/conversões |
| `recomendacoes` | Recomendações | (novo) |
| `produtividade` | Produtividade | (novo) |
| `perfis` | Perfis | perfis técnicos/recomendação/operacionais |
| `laboratorios` | Laboratórios | métodos, configurações de importação, perfis (atual `inv_lab_perfis`) |
| `legendas` | Legendas | atual `inv_legendas` (motor novo já está aderente) |

A estrutura é **expansível** — adicionar categoria não muda o esqueleto.

### 2.3 Modelo de dados base

Cada item da Biblioteca tem um envelope comum:

```ts
interface ItemBiblioteca<TConteudo> {
  id: string;
  categoria: CategoriaBiblioteca; // slug da 2.2
  nome: string;
  descricao?: string;
  tags?: string[];
  // escopo da visibilidade
  escopo: 'meu' | 'empresa' | 'sistema';
  donoUsuarioId?: string;        // quando escopo = 'meu'
  empresaId?: string;            // quando escopo = 'empresa'
  // estado
  ativo: boolean;                // soft delete + activate/inactivate
  versao: number;                // simples (1, 2, 3…); histórico em coleção separada
  padraoDe?: { contexto: string; chaveAtiva: string }; // "marcado como padrão"
  // auditoria
  criadoEm: string;
  atualizadoEm: string;
  criadoPor?: string;
  // conteúdo específico da categoria
  conteudo: TConteudo;
}
```

Para `legendas`, `TConteudo` é a `Legenda` atual.
Para `laboratorios`, é o `PerfilLab.config` atual.
Para `grades`, é `PadraoAmostragem`.
E assim por diante — **nada é refeito; só é envelopado**.

### 2.4 Estrutura Firestore

Hoje usamos coleções top-level (`inv_clientes`, `inv_legendas`…). Proposta:

```
/bib_sistema/{categoria}/{itemId}          // somente leitura por padrão (escopo=sistema)
/empresas/{empresaId}/bib/{categoria}/{itemId}    // escopo=empresa
/usuarios/{usuarioId}/bib/{categoria}/{itemId}    // escopo=meu
```

Vantagens:
- Regras de acesso ficam triviais por path.
- Cada nível tem **as mesmas 15 subcoleções por categoria**.
- Crescimento futuro = nova categoria = nova subcoleção.

Cadastros (clientes/fazendas/talhões/safras/grades/lab) seguem o que já fazemos hoje, mas migram pra:
```
/empresas/{empresaId}/cadastros/clientes|fazendas|talhoes|safras|grades|laboratorio|mapas_fert
```
(ou em `/usuarios/{usuarioId}/cadastros/...` se a fase 1 mantiver "sem empresa").

### 2.5 Camada comum no front

Um único arquivo `src/lib/biblioteca.ts` expõe a interface para qualquer categoria:

```ts
listar(categoria, filtros?)
obter(categoria, id)
criar(categoria, conteudo, opts)
duplicar(categoria, id)
atualizar(categoria, id, patch)
ativar/inativar(categoria, id)
excluir(categoria, id)
compartilhar(categoria, id, novoEscopo)   // promove escopo (meu → empresa)
exportar(categoria, id[])                 // JSON download
importar(categoria, jsonOuArquivo)        // upsert
definirComoPadrao(categoria, id, contexto)
listarPadrao(categoria, contexto)
```

Cada categoria fica como **adaptador fino** (`src/lib/bib/legendas.ts`, `src/lib/bib/laboratorios.ts`…) que define apenas o tipo de `conteudo` e validações específicas.

### 2.6 UI da Biblioteca

Menu lateral (item dedicado, ícone **livro**):

```
Biblioteca
├── Preferências de Análise
├── Grades
├── Fertilidade
├── Análises Foliares
├── … (15 categorias)
├── Laboratórios
└── Legendas
```

Cada categoria renderiza um painel **genérico**:
- Abas no topo: `Meus Padrões | Padrões da Empresa | Modelos Públicos`.
- Lista com filtro + busca.
- Ações por item: editar / duplicar / excluir / ativar / compartilhar / exportar.
- Botão global: importar (JSON) / novo.
- Render do `conteudo` é delegado a um componente específico (`LegendaEditor`, `LabPerfilEditor`, etc.).

Visual referência: a imagem que você enviou (menu lateral fixo, navegação simples, layout de software agrícola).

---

## Parte 3 — Plano de migração

### 3.1 De → Para (estruturas atuais)

| Hoje | Vai pra | Observação |
|---|---|---|
| `inv_legendas` (motor novo) | `bib/legendas` (escopo=meu por padrão) | aderente; migrar 1:1 |
| `inv_lab_perfis` | `bib/laboratorios` | aderente; vira "Perfil de Laboratório" |
| `inv_padroes_elem` | `bib/preferencias-analise` (subtipo "elementos") | |
| `inv_padroes_amos` | `bib/grades` | |
| `inv_etiqueta_cfg` | `bib/preferencias-analise` (subtipo "etiqueta") | |
| `LEGENDAS_PADRAO` (constants) | `bib/legendas` com escopo=sistema | semeado no boot |
| `BaseAgronomicaPanel`/`NutrienteCard` | aposentar | substituído pelo painel da Biblioteca/Legendas |
| `inv_lab` (importações) | `cadastros/laboratorio` | é dado de operação, não padrão |
| `inv_clientes/fazendas/talhoes/safras/grades` | `cadastros/...` | continua como cadastro, fora da Biblioteca |
| `inv_mapas_fert` | `cadastros/mapas_fert` | dado derivado de operação |

### 3.2 Retrocompatibilidade

- Camada `biblioteca.ts` lê e escreve **nas chaves novas**; mas mantém um *adapter* que, **só pra leitura**, faz fallback nas chaves antigas (`inv_*`).
- Cada categoria tem `migrar()` idempotente: na primeira abertura, copia do antigo pro novo (envelopa em `ItemBiblioteca`) sem apagar o antigo.
- Após X dias com tudo verde, remover as chaves antigas e o adapter.

### 3.3 Plano por fases

**Fase 0 — Limpeza (sem risco)**
- Remover `src/components/layout/Sidebar.tsx` (não é usado).
- Remover rotas vestigiais (`/painel/*` que estão escondidas), preservando `base-agronomica`, `configuracoes`, `legendas`, `produtores`, `safras`.
- Remover `agronomica/` (`NutrienteCard`, `LegendaBar`) — após apurar com você se a página `/painel/base-agronomica` ainda tem uso.
- Confirmar qual entre `SimuladorAmostragem` e `AmostragemModulo` está em uso; remover o ocioso.

**Fase 1 — Esqueleto da Biblioteca**
- `src/lib/biblioteca.ts` com a interface comum (in-memory + localStorage).
- `src/components/panels/BibliotecaPanel.tsx` (UI genérica com abas Meu/Empresa/Sistema).
- Item no `IconSidebar` ("Biblioteca").
- 15 categorias registradas, todas iniciando **vazias** com adaptadores prontos.

**Fase 2 — Migrar Legendas**
- Mover `LegendasPanel` para dentro do painel `Biblioteca → Legendas` (mesmo componente).
- Adicionar wrapper `bib/legendas.ts` que envelopa as `Legenda` atuais.
- Manter `inv_legendas` por compatibilidade durante 1 release.

**Fase 3 — Migrar Laboratórios**
- `LabImportSection` consome os perfis pela `bib/laboratorios`.
- Importações de lab continuam em `inv_lab` (cadastro), não na Biblioteca.

**Fase 4 — Migrar Grades / Preferências / Equações**
- `inv_padroes_amos` → `bib/grades`.
- `inv_padroes_elem` + `inv_etiqueta_cfg` → `bib/preferencias-analise`.
- Estrutura nova vazia para `bib/equacoes` (vai receber fórmulas conforme forem cadastradas).

**Fase 5 — Migração Firestore para a hierarquia nova**
- Introduzir `/usuarios/{uid}/bib/...` e `/usuarios/{uid}/cadastros/...`.
- Pra cada categoria, escrever a migração idempotente (lê coleção antiga, grava nova).
- Manter coleções antigas com TTL/aviso por 30 dias.

**Fase 6 — Pendências antigas**
- Resolver os 7 itens da seção 1.8 deste documento (BUG do salvar grade, editar/excluir cliente, etc.).

**Fase 7 — Categorias "vazias"**
- Conforme demanda (Análises Foliares, Altimetria, Imagem de Satélite, Compactação, Álgebra de Mapas, Pragas, Recomendações, Produtividade, Perfis) — entram com placeholder + estrutura pronta.

### 3.4 O que **não** entra nesta etapa

- Mudanças no motor de Fertilidade/Interpolação (continuar diagnóstico do bug de cores).
- Refatorar o `MapView` ou estrutura de renderização.
- Onboarding de Empresa multi-tenant — vai entrar na Fase 5 quando o Firestore for re-hierarquizado.

---

## Decisões registradas (2026-06-12)

1. **Menu**: a "Biblioteca" **substitui** Cadastros + Legendas + Base Agronômica (transição direta).
2. **Empresa**: entra **já** na 1ª rodada (multi-tenant desde o início).
3. **`BaseAgronomicaPanel` + `components/agronomica/`**: pode **aposentar** — conteúdo vira seed read-only do motor novo.
4. **Rotas vestigiais** em `/painel/*`: pode **deletar tudo** que estiver vazio.

### 2.7 Como Empresa funciona (revisão do escopo)

Como Empresa entra de cara, completo a Parte 2 com o mecanismo:

- **Auth**: continuamos com login anônimo do Firebase (já temos UID por usuário).
- **Empresa**:
  - Cada usuário tem **pelo menos uma empresa** — a "Empresa Pessoal" (auto-criada no 1º login com nome `<UID curto>`).
  - O usuário pode **criar/renomear empresas** e ter mais de uma.
  - Pode **adicionar outros usuários** (por UID/e-mail-anônimo) com papel `viewer | editor | admin`.
  - O `empresaId` ativa é guardado no `localStorage` (`inv_empresa_ativa`) e no perfil em Firestore.
- **Documento `Empresa`**:
  ```ts
  interface Empresa {
    id: string;
    nome: string;
    criadoPor: string;       // uid
    criadoEm: string;
    membros: Record<string, 'viewer' | 'editor' | 'admin'>; // uid → papel
  }
  ```
- **Migração dos dados atuais**: ao 1º boot pós-deploy, cria a "Empresa Pessoal" do usuário e move TODOS os cadastros existentes (`inv_clientes`, `inv_fazendas`, ...) e os itens da Biblioteca para dentro dela. Idempotente (re-rodar não duplica).

### 3.5 Ajustes no plano por fases (com base nas decisões)

- **Fase 0** vira mais agressiva: além das limpezas, **remover de uma vez** `Sidebar.tsx`, `components/agronomica/`, `BaseAgronomicaPanel`, todas as rotas vestigiais em `/painel/*` e seus imports. O painel "Cadastros" sai da sidebar.
- **Fase 1**: esqueleto da Biblioteca (categoria genérica) + criação automática da Empresa Pessoal no boot.
- **Fase 5** (Firestore hierárquico) é **antecipada** para junto da Fase 1 (já que Empresa entra agora). Passa a chamar-se **"Fase 1.5 — Hierarquia Firestore"**.
- Demais fases (2-4, 6, 7) continuam iguais.

## Próximo passo

Plano consolidado. Aguardando apenas o **ok geral** pra começar pela Fase 0. A cada fase entregue, peço seu ok antes da próxima.
