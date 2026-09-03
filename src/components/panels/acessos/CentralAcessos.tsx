'use client';

// CENTRAL DE ACESSOS — substitui o antigo UsuariosPanel.
// Abas: Pendentes · Internos · Produtores · Consultores · Gerentes · Operadores
//       · Todos · Convites · Papéis · Permissões · Empresas · Auditoria
// Cada usuário abre um painel lateral (DetalheUsuario) com dados, vínculos,
// permissões e histórico.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getClientes, getFazendas } from '@/lib/store';
import {
  ehOwner, emailUsuario, getPlanos, podeEm, salvarPlano, excluirPlano, toggleSecaoPlano,
  atualizarPlano, SECOES_PORTAL, empresaAtiva, updateEmpresa,
} from '@/lib/empresa';
import { getAuditoria } from '@/lib/iam/auditoria';
import {
  aprovarUsuario, categoriaDe, getUsuarios, migrarIamV1, rejeitarUsuario,
  statusDe, PAPEIS_ATRIBUIVEIS, type UsuarioIam,
} from '@/lib/iam/usuarios';
import {
  acessoDoConvite, cancelarConvite, conviteDoToken, criarConvite, criarConviteTipo, getConvites,
  linkDoConvite, reenviarConvite, VALIDADE_TIPO_DIAS,
} from '@/lib/iam/convites';
import { MATRIZ_PADRAO, poderesDeAcesso, poderesSobreUsuario } from '@/lib/iam/permissoes';
import { getPerfil, getPerfis, salvarPerfil, excluirPerfil, renomearPerfil, permissoesDoPapel } from '@/lib/iam/perfis';
import {
  ACOES, CATEGORIAS, MODULOS, PAPEIS, ROTULO_ACAO, chavePerm,
  type CategoriaIam, type PapelIam,
} from '@/lib/iam/tipos';
import {
  COR, Abas, Bloco, Botao, Cartao, Chip, Marcar, Modal, Rotulo, SeloStatus, Vazio,
  campoSt, fmtData, fmtDataHora, fmtRelativo,
} from './ui';
import { DetalheUsuario } from './DetalheUsuario';
import { Check, Copy, Link2, Loader2, Send, ShieldCheck, UserPlus, X } from 'lucide-react';

type AbaId =
  | 'pendentes' | 'internos' | 'produtores' | 'consultores' | 'gerentes' | 'operadores'
  | 'todos' | 'convites' | 'papeis' | 'perfis' | 'permissoes' | 'empresas' | 'auditoria';

export function CentralAcessos() {
  const [aba, setAba] = useState<AbaId>('pendentes');
  const [tick, setTick] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  // Quem pode o quê nesta tela sai da MATRIZ (usuarios.criar/aprovar/editar/…),
  // não de "sou o dono?" — é assim que o Administrador gera convite e aprova
  // cadastro. Ver lib/iam/permissoes.poderesDeAcesso — npm run teste:iam.
  const souOwner = ehOwner();
  const poderes = useMemo(() => poderesDeAcesso(podeEm), [tick]);
  const recarregar = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => { migrarIamV1(); }, []);
  useEffect(() => {
    const h = () => recarregar();
    window.addEventListener('inv:empresa', h);
    return () => window.removeEventListener('inv:empresa', h);
  }, [recarregar]);

  const usuarios = useMemo(() => getUsuarios(), [tick]);
  const convites = useMemo(() => getConvites(), [tick]);

  const porCategoria = useCallback((cats: CategoriaIam[]) =>
    usuarios.filter(u => statusDe(u) !== 'aguardando_aprovacao' && cats.includes(categoriaDe(u))),
  [usuarios]);

  const pendentes = useMemo(
    () => usuarios.filter(u => statusDe(u) === 'aguardando_aprovacao'), [usuarios]);
  const convitesAbertos = useMemo(() => convites.filter(c => c.status === 'pendente'), [convites]);

  const lista = useMemo(() => {
    const base =
      aba === 'pendentes'   ? pendentes
      : aba === 'internos'  ? porCategoria(['interno'])
      : aba === 'produtores' ? porCategoria(['produtor', 'cliente'])
      : aba === 'consultores' ? porCategoria(['consultor', 'parceiro', 'revenda', 'pesquisador'])
      : aba === 'gerentes'  ? porCategoria(['gerente'])
      : aba === 'operadores' ? porCategoria(['prestador'])
      : aba === 'todos'     ? usuarios
      : [];
    const q = busca.trim().toLowerCase();
    return q ? base.filter(u => (u.nome ?? '').toLowerCase().includes(q) || u.email.includes(q)) : base;
  }, [aba, pendentes, porCategoria, usuarios, busca]);

  const abas: Array<{ id: AbaId; label: string; contagem?: number; destaque?: boolean }> = [
    { id: 'pendentes',   label: 'Pendentes',  contagem: pendentes.length, destaque: pendentes.length > 0 },
    { id: 'internos',    label: 'Internos',   contagem: porCategoria(['interno']).length },
    { id: 'produtores',  label: 'Produtores', contagem: porCategoria(['produtor', 'cliente']).length },
    { id: 'consultores', label: 'Consultores', contagem: porCategoria(['consultor', 'parceiro', 'revenda', 'pesquisador']).length },
    { id: 'gerentes',    label: 'Gerentes',   contagem: porCategoria(['gerente']).length },
    { id: 'operadores',  label: 'Prestadores', contagem: porCategoria(['prestador']).length },
    { id: 'todos',       label: 'Todos',      contagem: usuarios.length },
    { id: 'convites',    label: 'Convites',   contagem: convitesAbertos.length },
    { id: 'papeis',      label: 'Papéis' },
    { id: 'perfis',      label: 'Perfis' },
    { id: 'permissoes',  label: 'Permissões' },
    { id: 'empresas',    label: 'Empresas' },
    { id: 'auditoria',   label: 'Auditoria' },
  ];

  const ehListaDeUsuarios = ['pendentes', 'internos', 'produtores', 'consultores', 'gerentes', 'operadores', 'todos'].includes(aba);

  return (
    <div className="flex h-full" style={{ background: COR.fundo }}>
      {/* Coluna principal */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="px-3 pt-3 pb-2 space-y-2 flex-shrink-0">
          <div className="flex items-center gap-2">
            <ShieldCheck size={14} style={{ color: COR.azul }} />
            <p className="text-xs font-bold" style={{ color: COR.txt }}>Central de Acessos</p>
            {!poderes.algum && <Chip cor={COR.alerta}>somente leitura</Chip>}
          </div>
          <Abas abas={abas} ativa={aba} onChange={setAba} />
          {ehListaDeUsuarios && (
            <input className="w-full rounded px-2 py-1.5 text-[11px]" style={campoSt}
              placeholder="buscar por nome ou e-mail…" value={busca} onChange={e => setBusca(e.target.value)} />
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-2">
          {ehListaDeUsuarios && (
            lista.length === 0
              ? <Vazio texto={aba === 'pendentes' ? 'Nenhum cadastro aguardando aprovação.' : 'Ninguém nesta categoria ainda.'} />
              : lista.map(u => (
                  <CartaoUsuario key={u.email} u={u} selecionado={sel === u.email}
                    podeAprovar={poderes.aprovar} pendente={statusDe(u) === 'aguardando_aprovacao'}
                    onAbrir={() => setSel(u.email)} onMudou={recarregar} />
                ))
          )}
          {aba === 'convites'   && <AbaConvites convites={convites} podeConvidar={poderes.convidar} onMudou={recarregar} />}
          {aba === 'papeis'     && <AbaPapeis />}
          {aba === 'perfis'     && <AbaPerfis souOwner={poderes.administrar} onMudou={recarregar} tick={tick} />}
          {aba === 'permissoes' && <AbaPermissoes />}
          {aba === 'empresas'   && <AbaEmpresas souOwner={poderes.administrar} onMudou={recarregar} />}
          {aba === 'auditoria'  && <AbaAuditoria tick={tick} />}
        </div>
      </div>

      {/* Painel lateral do usuário */}
      {sel && (
        <div className="flex-shrink-0" style={{ width: 340, borderLeft: `1px solid ${COR.borda}` }}>
          <DetalheUsuario email={sel}
            {...poderesSobreUsuario(poderes, usuarios.find(u => u.email === sel)?.papel, souOwner)}
            onFechar={() => setSel(null)} onMudou={recarregar} />
        </div>
      )}
    </div>
  );
}

// ── Acesso definido no convite (produtores/fazendas) ────────────────────────
// Mesma regra dos Vínculos do usuário: nada marcado = sem restrição; marcar
// produtor limita as fazendas às dele. O convite só GUARDA a escolha — quem
// aplica é a aprovação, que continua manual.
function SeletorAcesso({ cli, faz, setCli, setFaz, aviso }: {
  cli: string[]; faz: string[];
  setCli: (v: string[]) => void; setFaz: (v: string[]) => void;
  aviso?: string;
}) {
  const clientes = useMemo(() => getClientes(), []);
  const marcCli = new Set(cli);
  const marcFaz = new Set(faz);
  const fazendas = useMemo(() => {
    const todas = getFazendas();
    return cli.length ? todas.filter(f => marcCli.has(f.clienteId)) : todas;
  }, [cli]); // eslint-disable-line react-hooks/exhaustive-deps

  function alternarCli(id: string) {
    const novo = new Set(cli);
    if (novo.has(id)) novo.delete(id); else novo.add(id);
    setCli([...novo]);
    // Fazenda marcada de um produtor que saiu da lista some junto — senão
    // sobraria um vínculo invisível na tela.
    if (novo.size) {
      const validas = new Set(getFazendas().filter(f => novo.has(f.clienteId)).map(f => f.id));
      setFaz(faz.filter(id2 => validas.has(id2)));
    }
  }
  function alternarFaz(id: string) {
    const novo = new Set(faz);
    if (novo.has(id)) novo.delete(id); else novo.add(id);
    setFaz([...novo]);
  }

  return (
    <div className="space-y-1.5">
      <Rotulo>Quem ele vai poder acessar</Rotulo>
      <p className="text-[9px] leading-relaxed" style={{ color: COR.fraco }}>
        Nada marcado = <b>sem restrição</b> (vê tudo que o papel permitir). Marque para limitar.
        {aviso ? ` ${aviso}` : ''}
      </p>
      <Bloco titulo={`Produtores (${cli.length || 'todos'})`}>
        {clientes.length === 0
          ? <p className="text-[10px]" style={{ color: COR.fraco }}>Nenhum produtor cadastrado ainda.</p>
          : clientes.map(c => (
            <Marcar key={c.id} on={marcCli.has(c.id)} label={c.nome} onChange={() => alternarCli(c.id)} />
          ))}
      </Bloco>
      <Bloco titulo={`Fazendas (${faz.length || 'todas'})`}>
        {fazendas.length === 0
          ? <p className="text-[10px]" style={{ color: COR.fraco }}>Nenhuma fazenda nos produtores marcados.</p>
          : fazendas.map(f => (
            <Marcar key={f.id} on={marcFaz.has(f.id)} label={f.nome} onChange={() => alternarFaz(f.id)} />
          ))}
      </Bloco>
      {(cli.length > 0 || faz.length > 0) && (
        <Botao pequeno onClick={() => { setCli([]); setFaz([]); }}>Limpar (sem restrição)</Botao>
      )}
    </div>
  );
}

// Nomes legíveis do acesso guardado no convite. Vazio = sem restrição.
function textoAcesso(cli?: string[], faz?: string[]): string {
  const nCli = cli?.length ?? 0, nFaz = faz?.length ?? 0;
  if (!nCli && !nFaz) return '';
  const nomes = (ids: string[], lista: Array<{ id: string; nome: string }>, plural: string) =>
    lista.filter(x => ids.includes(x.id)).map(x => x.nome).join(', ') || `${ids.length} ${plural}`;
  return [
    nCli ? nomes(cli!, getClientes(), 'produtor(es)') : '',
    nFaz ? nomes(faz!, getFazendas(), 'fazenda(s)') : '',
  ].filter(Boolean).join(' · ');
}

// ── Cartão de usuário ───────────────────────────────────────────────────────
function CartaoUsuario({ u, onAbrir, selecionado, pendente, podeAprovar, onMudou }: {
  u: UsuarioIam; onAbrir: () => void; selecionado: boolean; pendente: boolean;
  podeAprovar: boolean; onMudou: () => void;
}) {
  const [aprovando, setAprovando] = useState(false);
  // Cadastro vindo de um LINK POR TIPO já chega com o papel proposto — abrir a
  // aprovação em 'leitor' obrigaria a redigitar (e a errar) o que o link definiu.
  const [papel, setPapel] = useState<PapelIam>(u.papelSugerido ?? (u.papel as PapelIam) ?? 'leitor');
  const perfilDoLink = u.perfilSugeridoId ? getPerfil(u.perfilSugeridoId) : null;
  const [cat, setCat] = useState<CategoriaIam>(categoriaDe(u));
  const nCli = u.clientesVinculados?.length ?? 0;
  const nFaz = u.fazendasVinculadas?.length ?? 0;
  const nTal = u.talhoesVinculados?.length ?? 0;

  // Acesso que o CONVITE já definia (regra pura em conviteRegras.acessoDoConvite).
  const convOrigem = useMemo(
    () => (u.conviteId ? conviteDoToken(u.conviteId) : null), [u.conviteId]);
  const { clientesVinculados: cliDoConvite, fazendasVinculadas: fazDoConvite } =
    acessoDoConvite(u, convOrigem);

  return (
    <Cartao ativo={selecionado}>
      <div className="flex items-start gap-2 cursor-pointer" onClick={onAbrir}>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold truncate" style={{ color: COR.txt }}>
            {u.nome || u.email}{u.email === emailUsuario() && <span style={{ color: COR.fraco }}> (você)</span>}
          </p>
          <p className="text-[10px] truncate" style={{ color: COR.sub }}>{u.email}</p>
        </div>
        <SeloStatus status={statusDe(u)} />
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        <Chip>{CATEGORIAS.find(c => c.id === categoriaDe(u))?.nome}</Chip>
        <Chip cor="#c4b5fd">{PAPEIS.find(p => p.id === u.papel)?.nome ?? u.papel}</Chip>
        <Chip cor={COR.ok}>{nCli || 'todos'} prod · {nFaz || 'todas'} faz · {nTal || 'todos'} tal</Chip>
        <span className="text-[9px] ml-auto" style={{ color: COR.fraco }}>{fmtRelativo(u.ultimoAcesso)}</span>
      </div>

      {pendente && podeAprovar && (
        <div className="rounded p-2 space-y-1.5" style={{ background: '#0f2240' }}>
          <Rotulo>Aprovar como</Rotulo>
          <div className="flex gap-1.5">
            <select className="flex-1 rounded px-1.5 py-1 text-[10px]" style={campoSt}
              value={cat} onChange={e => setCat(e.target.value as CategoriaIam)}>
              {CATEGORIAS.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <select className="flex-1 rounded px-1.5 py-1 text-[10px]" style={campoSt}
              value={papel} onChange={e => setPapel(e.target.value as PapelIam)}>
              {PAPEIS_ATRIBUIVEIS.map(p => (
                <option key={p} value={p}>{PAPEIS.find(x => x.id === p)?.nome}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-1.5">
            <Botao tom="ok" pequeno disabled={aprovando}
              onClick={() => {
                setAprovando(true);
                // O perfil do link entra como permissões PRÓPRIAS da pessoa — a
                // partir daí ela é ajustável individualmente, como qualquer outra.
                // Idem para os vínculos definidos no convite.
                aprovarUsuario(u.email, papel, cat, {
                  ...(perfilDoLink ? { permissoes: perfilDoLink.permissoes } : {}),
                  ...(cliDoConvite.length ? { clientesVinculados: cliDoConvite } : {}),
                  ...(fazDoConvite.length ? { fazendasVinculadas: fazDoConvite } : {}),
                });
                onMudou();
              }}>
              <Check size={10} className="inline" /> Aprovar
            </Botao>
            <Botao tom="perigo" pequeno
              onClick={() => { const m = prompt('Motivo da rejeição (opcional):') ?? undefined; rejeitarUsuario(u.email, m); onMudou(); }}>
              <X size={10} className="inline" /> Rejeitar
            </Botao>
          </div>
          {perfilDoLink && (
            <p className="text-[9px]" style={{ color: '#93c5fd' }}>
              Veio do link de convite com o perfil <b>{perfilDoLink.nome}</b> — será aplicado na aprovação.
            </p>
          )}
          {(cliDoConvite.length > 0 || fazDoConvite.length > 0) && (
            <p className="text-[9px]" style={{ color: '#93c5fd' }}>
              Acesso definido no convite: <b>{textoAcesso(cliDoConvite, fazDoConvite)}</b> — será aplicado
              na aprovação (dá para mudar depois em Vínculos).
            </p>
          )}
          {convOrigem?.rotulo && (
            <p className="text-[9px]" style={{ color: COR.fraco }}>Veio do convite “{convOrigem.rotulo}”.</p>
          )}
          {u.telefone && <p className="text-[9px]" style={{ color: COR.fraco }}>Telefone informado: {u.telefone}</p>}
        </div>
      )}
    </Cartao>
  );
}

// ── Aba Convites ────────────────────────────────────────────────────────────
function AbaConvites({ convites, podeConvidar, onMudou }: {
  convites: ReturnType<typeof getConvites>; podeConvidar: boolean; onMudou: () => void;
}) {
  const [novo, setNovo] = useState(false);
  const [email, setEmail] = useState('');
  const [nome, setNome] = useState('');
  const [rotuloP, setRotuloP] = useState('');   // nome INTERNO do convite
  const [cliP, setCliP] = useState<string[]>([]);
  const [fazP, setFazP] = useState<string[]>([]);
  const [cat, setCat] = useState<CategoriaIam>('interno');
  const [papel, setPapel] = useState<PapelIam>('leitor');
  const [dias, setDias] = useState(7);
  const [criadoPessoa, setCriadoPessoa] = useState<string | null>(null);
  const [avisoPessoa, setAvisoPessoa] = useState('');
  const [copiado, setCopiado] = useState('');

  // Link por TIPO (reutilizável)
  const [novoTipo, setNovoTipo] = useState(false);
  const [rotulo, setRotulo] = useState('');
  const [catT, setCatT] = useState<CategoriaIam>('produtor');
  const [papelT, setPapelT] = useState<PapelIam>('leitor');
  const [perfilT, setPerfilT] = useState('');
  const [cliT, setCliT] = useState<string[]>([]);
  const [fazT, setFazT] = useState<string[]>([]);
  const [diasT, setDiasT] = useState(VALIDADE_TIPO_DIAS);
  const [criadoTipo, setCriadoTipo] = useState<string | null>(null);
  const [avisoTipo, setAvisoTipo] = useState('');
  const perfis = useMemo(() => getPerfis(), []);

  const emailOk = /\S+@\S+\.\S+/.test(email);
  // Nome do link é OPCIONAL: se em branco, viramos o rótulo a partir do que foi
  // escolhido (categoria/papel). Gerar o link não deve exigir digitar NADA — só
  // escolher o tipo. (O e-mail nunca é pedido aqui; quem informa é a pessoa.)
  const rotuloEfetivo = () => rotulo.trim()
    || `${CATEGORIAS.find(c => c.id === catT)?.nome ?? 'Convite'} · ${PAPEIS.find(p => p.id === papelT)?.nome ?? ''}`.trim();

  const porTipo = convites.filter(c => c.multiuso);
  const porPessoa = convites.filter(c => !c.multiuso);

  // Antes estes dois davam `return` calado quando o campo estava vazio/inválido:
  // clicava em "Gerar link" e NADA acontecia, sem dizer o porquê. Agora o botão
  // fica desabilitado e o motivo aparece escrito.
  function criar() {
    // E-mail é OPCIONAL. Com e-mail: o link fica travado nele. Sem e-mail: link
    // ABERTO — vale para UM cadastro e a própria pessoa informa o e-mail dela.
    // Só barra se o que foi digitado for um e-mail inválido (não se estiver vazio).
    if (email.trim() && !emailOk) {
      setAvisoPessoa('E-mail inválido. Apague o campo para gerar um link que a própria pessoa preenche, ou corrija o e-mail.');
      return;
    }
    let c;
    try {
      c = criarConvite({
        email: email.trim(), nome: nome || undefined, rotulo: rotuloP || undefined,
        categoria: cat, papel, dias,
        clientesVinculados: cliP, fazendasVinculadas: fazP,
      });
    } catch (e) {
      // Qualquer erro na criação vira texto na tela — nunca mais um clique mudo.
      setAvisoPessoa(`Não foi possível gerar o link: ${mensagemErro(e)}`);
      return;
    }
    setCriadoPessoa(linkDoConvite(c.id)); setAvisoPessoa('');
    setEmail(''); setNome(''); setRotuloP(''); setCliP([]); setFazP([]);
    setNovo(false); onMudou();
  }
  function criarTipo() {
    let c;
    try {
      c = criarConviteTipo({
        rotulo: rotuloEfetivo(), categoria: catT, papel: papelT,
        perfilId: perfilT || undefined, dias: diasT,
        clientesVinculados: cliT, fazendasVinculadas: fazT,
      });
    } catch (e) {
      setAvisoTipo(`Não foi possível gerar o link: ${mensagemErro(e)}`);
      return;
    }
    setCriadoTipo(linkDoConvite(c.id)); setAvisoTipo('');
    setRotulo(''); setPerfilT(''); setCliT([]); setFazT([]); setNovoTipo(false); onMudou();
  }
  function mensagemErro(e: unknown): string {
    return e instanceof Error && e.message ? e.message : 'erro inesperado neste navegador (veja o console).';
  }
  function copiar(txt: string, marca = 'x') {
    navigator.clipboard?.writeText(txt).then(() => { setCopiado(marca); setTimeout(() => setCopiado(''), 2000); }).catch(() => {});
  }

  return (
    <div className="space-y-2">
      {/* ── LINKS POR TIPO ─────────────────────────────────────────────── */}
      <div className="rounded p-2 space-y-2" style={{ background: '#0b1d3a', border: `1px solid ${COR.borda}` }}>
        <div className="flex items-center justify-between gap-2">
          <Rotulo>Links por tipo de usuário</Rotulo>
          {podeConvidar && !novoTipo && <Botao pequeno tom="ok" onClick={() => setNovoTipo(true)}><Link2 size={10} className="inline" /> Novo link</Botao>}
        </div>
        <p className="text-[9px] leading-relaxed" style={{ color: COR.fraco }}>
          Um link só, que <b>várias pessoas</b> podem usar — dá para mandar no grupo dos produtores.
          Cada uma informa o próprio e-mail, cria a própria senha e entra como <b>aguardando aprovação</b>,
          já com a categoria, o papel e o perfil de permissões deste link. O link <b>não libera ninguém sozinho</b>:
          a aprovação continua sendo sua.
        </p>

        {novoTipo && (
          <Cartao>
            <input className="w-full rounded px-2 py-1.5 text-xs" style={campoSt}
              placeholder="nome do link (opcional — ex.: Produtores)" value={rotulo} onChange={e => setRotulo(e.target.value)} />
            <div className="flex gap-1.5">
              <select className="flex-1 rounded px-1.5 py-1 text-[10px]" style={campoSt} value={catT}
                onChange={e => setCatT(e.target.value as CategoriaIam)}>
                {CATEGORIAS.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
              <select className="flex-1 rounded px-1.5 py-1 text-[10px]" style={campoSt} value={papelT}
                onChange={e => setPapelT(e.target.value as PapelIam)}>
                {PAPEIS_ATRIBUIVEIS.map(p => <option key={p} value={p}>{PAPEIS.find(x => x.id === p)?.nome}</option>)}
              </select>
              <input type="number" min={1} max={730} value={diasT} onChange={e => setDiasT(Number(e.target.value))}
                className="w-16 rounded px-1.5 py-1 text-[10px]" style={campoSt} title="validade em dias" />
            </div>
            <select className="w-full rounded px-1.5 py-1 text-[10px]" style={campoSt} value={perfilT}
              onChange={e => setPerfilT(e.target.value)}>
              <option value="">Perfil de permissões: usar o padrão do papel</option>
              {perfis.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
            <SeletorAcesso cli={cliT} faz={fazT} setCli={setCliT} setFaz={setFazT}
              aviso="Vale para TODAS as pessoas que usarem este link — para acessos diferentes por pessoa, use o convite individual." />
            <div className="flex gap-1.5">
              <Botao tom="ok" onClick={criarTipo}><Send size={10} className="inline" /> Gerar link</Botao>
              <Botao onClick={() => { setNovoTipo(false); setAvisoTipo(''); }}>Cancelar</Botao>
            </div>
            {avisoTipo && <p className="text-[9px]" style={{ color: COR.alerta }}>{avisoTipo}</p>}
            <p className="text-[9px]" style={{ color: COR.fraco }}>
              Não se pede e-mail aqui: quem preenche os próprios dados é a pessoa, ao abrir o link.
            </p>
          </Cartao>
        )}

        {criadoTipo && (
          <div className="rounded p-2 space-y-1.5" style={{ background: '#0f3d2e', border: '1px solid #166534' }}>
            <p className="text-[10px] font-bold" style={{ color: '#6ee7b7' }}>Link criado — copie e mande para o grupo:</p>
            <div className="flex gap-1.5">
              <input readOnly value={criadoTipo} className="flex-1 rounded px-2 py-1 text-[10px]" style={campoSt} onFocus={e => e.currentTarget.select()} />
              <Botao tom="ok" pequeno onClick={() => copiar(criadoTipo, 'tipo')}>{copiado === 'tipo' ? 'Copiado!' : <><Copy size={10} className="inline" /> Copiar</>}</Botao>
            </div>
          </div>
        )}

        {porTipo.length === 0
          ? <p className="text-[10px]" style={{ color: COR.fraco }}>Nenhum link de tipo criado ainda.</p>
          : porTipo.map(c => (
            <Cartao key={c.id}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold truncate" style={{ color: COR.txt }}>{c.rotulo}</p>
                  <p className="text-[10px] truncate" style={{ color: COR.sub }}>
                    {CATEGORIAS.find(x => x.id === c.categoria)?.nome ?? '—'}
                    {' · '}{PAPEIS.find(x => x.id === c.papel)?.nome ?? '—'}
                    {c.perfilId && ` · perfil ${perfis.find(p => p.id === c.perfilId)?.nome ?? '(removido)'}`}
                  </p>
                </div>
                <Chip cor={c.status === 'pendente' ? COR.ok : c.status === 'expirado' ? COR.alerta : COR.fraco}>{c.status}</Chip>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap text-[9px]" style={{ color: COR.fraco }}>
                <span>{c.usos ?? 0} cadastro(s) por este link</span>
                <span>· expira {fmtData(c.expiraEm)}</span>
                <span>· acesso: {textoAcesso(c.clientesVinculados, c.fazendasVinculadas) || 'sem restrição'}</span>
              </div>
              {podeConvidar && (
                <div className="flex gap-1.5 flex-wrap">
                  {c.status === 'pendente' && (
                    <Botao pequeno tom="ok" onClick={() => copiar(linkDoConvite(c.id), c.id)}>
                      {copiado === c.id ? 'Copiado!' : <><Copy size={10} className="inline" /> Copiar link</>}
                    </Botao>
                  )}
                  {(c.status === 'pendente' || c.status === 'expirado') && (
                    <Botao pequeno onClick={() => { reenviarConvite(c.id, VALIDADE_TIPO_DIAS); onMudou(); }}>Renovar</Botao>
                  )}
                  {c.status === 'pendente' && (
                    <Botao pequeno tom="perigo" onClick={() => { if (confirm(`Cancelar o link "${c.rotulo}"? Quem já recebeu não conseguirá mais se cadastrar por ele.`)) { cancelarConvite(c.id); onMudou(); } }}>Cancelar</Botao>
                  )}
                </div>
              )}
            </Cartao>
          ))}
      </div>

      {/* ── CONVITE INDIVIDUAL ─────────────────────────────────────────── */}
      {podeConvidar && !novo && <Botao tom="ok" onClick={() => setNovo(true)}><UserPlus size={11} className="inline" /> Convite para uma pessoa</Botao>}

      {novo && (
        <Cartao>
          <Rotulo>Novo convite</Rotulo>
          <input className="w-full rounded px-2 py-1.5 text-xs" style={campoSt}
            placeholder="nome interno do convite (só você vê — ex.: Jonas, da Santa Rita)"
            value={rotuloP} onChange={e => setRotuloP(e.target.value)} />
          <p className="text-[9px]" style={{ color: COR.fraco }}>
            Serve só para você identificar na lista para quem mandou cada link. Nunca aparece para a pessoa.
          </p>
          <input className="w-full rounded px-2 py-1.5 text-xs" style={campoSt}
            placeholder="e-mail (opcional — deixe em branco p/ a pessoa preencher)"
            value={email} onChange={e => setEmail(e.target.value)} />
          <input className="w-full rounded px-2 py-1.5 text-xs" style={campoSt}
            placeholder="nome da pessoa (opcional — já entra preenchido no cadastro dela)"
            value={nome} onChange={e => setNome(e.target.value)} />
          <div className="flex gap-1.5">
            <select className="flex-1 rounded px-1.5 py-1 text-[10px]" style={campoSt} value={cat}
              onChange={e => setCat(e.target.value as CategoriaIam)}>
              {CATEGORIAS.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <select className="flex-1 rounded px-1.5 py-1 text-[10px]" style={campoSt} value={papel}
              onChange={e => setPapel(e.target.value as PapelIam)}>
              {PAPEIS_ATRIBUIVEIS.map(p => <option key={p} value={p}>{PAPEIS.find(x => x.id === p)?.nome}</option>)}
            </select>
            <input type="number" min={1} max={90} value={dias} onChange={e => setDias(Number(e.target.value))}
              className="w-14 rounded px-1.5 py-1 text-[10px]" style={campoSt} title="validade em dias" />
          </div>
          <SeletorAcesso cli={cliP} faz={fazP} setCli={setCliP} setFaz={setFazP}
            aviso="O que for marcado aqui já entra no cadastro da pessoa e é aplicado quando você aprovar." />
          <div className="flex gap-1.5">
            <Botao tom="ok" onClick={criar}><Send size={10} className="inline" /> Gerar link</Botao>
            <Botao onClick={() => { setNovo(false); setAvisoPessoa(''); }}>Cancelar</Botao>
          </div>
          {avisoPessoa && <p className="text-[9px]" style={{ color: COR.alerta }}>{avisoPessoa}</p>}
          <p className="text-[9px]" style={{ color: COR.fraco }}>
            {email.trim()
              ? 'O link ficará travado neste e-mail — só quem tiver esse endereço consegue se cadastrar.'
              : 'Sem e-mail: o link vale para UM cadastro e a própria pessoa informa o e-mail dela.'}
            {' '}A pessoa cria a própria senha; nenhuma senha provisória é exibida. Para mandar UM link a
            {' '}VÁRIAS pessoas, use “Links por tipo” acima.
          </p>
        </Cartao>
      )}

      {criadoPessoa && (
        <div className="rounded p-2 space-y-1.5" style={{ background: '#0f3d2e', border: '1px solid #166534' }}>
          <p className="text-[10px] font-bold" style={{ color: '#6ee7b7' }}>Convite criado — copie e mande para a pessoa:</p>
          <div className="flex gap-1.5">
            <input readOnly value={criadoPessoa} className="flex-1 rounded px-2 py-1 text-[10px]" style={campoSt} onFocus={e => e.currentTarget.select()} />
            <Botao tom="ok" pequeno onClick={() => copiar(criadoPessoa, 'novo')}>{copiado === 'novo' ? 'Copiado!' : <><Copy size={10} className="inline" /> Copiar</>}</Botao>
          </div>
        </div>
      )}

      {porPessoa.length === 0 ? <Vazio texto="Nenhum convite individual ainda." /> : porPessoa.map(c => (
        <Cartao key={c.id}>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold truncate" style={{ color: COR.txt }}>
                {c.rotulo || c.nome || c.email || 'Link aberto (sem e-mail)'}
              </p>
              <p className="text-[10px] truncate" style={{ color: COR.sub }}>
                {[
                  c.email || 'a pessoa preenche o e-mail',
                  c.rotulo && c.nome ? `p/ ${c.nome}` : null,
                  CATEGORIAS.find(x => x.id === c.categoria)?.nome,
                  PAPEIS.find(p => p.id === c.papel)?.nome,
                ].filter(Boolean).join(' · ')}
              </p>
            </div>
            <Chip cor={c.status === 'pendente' ? COR.ok : c.status === 'expirado' ? COR.alerta : COR.fraco}>{c.status}</Chip>
          </div>
          <p className="text-[9px]" style={{ color: COR.fraco }}>
            Acesso: {textoAcesso(c.clientesVinculados, c.fazendasVinculadas) || 'sem restrição'}
          </p>
          <div className="flex items-center gap-1.5 flex-wrap text-[9px]" style={{ color: COR.fraco }}>
            <span>criado {fmtData(c.criadoEm)}</span>
            <span>· expira {fmtData(c.expiraEm)}</span>
            {c.usadoPor && <span>· usado por {c.usadoPor}</span>}
          </div>
          {podeConvidar && (
            <div className="flex gap-1.5 flex-wrap">
              {c.status === 'pendente' && (
                <Botao pequeno onClick={() => copiar(linkDoConvite(c.id), c.id)}>{copiado === c.id ? 'Copiado!' : <><Link2 size={10} className="inline" /> Copiar link</>}</Botao>
              )}
              {(c.status === 'pendente' || c.status === 'expirado') && (
                <Botao pequeno onClick={() => { reenviarConvite(c.id); onMudou(); }}>Renovar</Botao>
              )}
              {c.status === 'pendente' && (
                <Botao pequeno tom="perigo" onClick={() => { cancelarConvite(c.id); onMudou(); }}>Cancelar</Botao>
              )}
            </div>
          )}
        </Cartao>
      ))}
    </div>
  );
}

// ── Aba Papéis (referência) ─────────────────────────────────────────────────
function AbaPapeis() {
  return (
    <div className="space-y-2">
      <p className="text-[10px]" style={{ color: COR.fraco }}>
        O papel define o padrão de permissões. Cada usuário pode ter exceções (aba Permissões do painel lateral).
      </p>
      {PAPEIS.map(p => {
        const perms = MATRIZ_PADRAO[p.id] ?? {};
        const n = Object.values(perms).filter(Boolean).length;
        return (
          <Cartao key={p.id}>
            <div className="flex items-center gap-2">
              <p className="text-[11px] font-bold" style={{ color: COR.txt }}>{p.nome}</p>
              <Chip cor={COR.azul}>{n} permissão(ões)</Chip>
            </div>
            <p className="text-[10px]" style={{ color: COR.sub }}>{p.dica}</p>
          </Cartao>
        );
      })}
    </div>
  );
}

// ── Aba Permissões (matriz padrão por papel) ────────────────────────────────
function AbaPermissoes() {
  const [papel, setPapel] = useState<PapelIam>('agronomo');
  const perms = MATRIZ_PADRAO[papel] ?? {};
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Rotulo>Padrão do papel</Rotulo>
        <select className="flex-1 rounded px-2 py-1 text-[11px]" style={campoSt} value={papel}
          onChange={e => setPapel(e.target.value as PapelIam)}>
          {PAPEIS.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
      </div>
      <p className="text-[10px]" style={{ color: COR.fraco }}>
        Esta é a matriz PADRÃO do papel (referência). Para dar ou tirar permissão de alguém específico,
        abra o usuário e use a aba <b>Permissões</b> do painel lateral.
      </p>
      <div className="rounded overflow-x-auto" style={{ border: `1px solid ${COR.borda}` }}>
        <table className="w-full text-[9px]" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#0f2240' }}>
              <th className="text-left px-1.5 py-1" style={{ color: COR.sub }}>Módulo</th>
              {ACOES.map(a => <th key={a.id} className="px-1 py-1" style={{ color: COR.sub }} title={a.nome}>{a.curto}</th>)}
            </tr>
          </thead>
          <tbody>
            {MODULOS.map(m => (
              <tr key={m.id} style={{ borderTop: `1px solid ${COR.borda}` }}>
                <td className="px-1.5 py-1 truncate" style={{ color: COR.txt, maxWidth: 130 }}>{m.nome}</td>
                {ACOES.map(a => (
                  <td key={a.id} className="text-center px-1 py-1"
                    style={{ color: perms[chavePerm(m.id, a.id)] ? COR.ok : '#334155' }}>
                    {perms[chavePerm(m.id, a.id)] ? '●' : '·'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Aba Empresas + planos do produtor ───────────────────────────────────────
function AbaEmpresas({ souOwner, onMudou }: { souOwner: boolean; onMudou: () => void }) {
  const emp = empresaAtiva();
  const [nome, setNome] = useState(emp?.nome ?? '');
  const planos = getPlanos();
  const clientes = getClientes();

  return (
    <div className="space-y-3">
      <Cartao>
        <Rotulo>Empresa</Rotulo>
        <div className="flex gap-1.5">
          <input className="flex-1 rounded px-2 py-1.5 text-xs" style={campoSt} value={nome}
            disabled={!souOwner} onChange={e => setNome(e.target.value)} />
          <Botao disabled={!souOwner || !nome.trim() || nome === emp?.nome}
            onClick={() => { if (emp) { updateEmpresa(emp.id, { nome: nome.trim() }); onMudou(); } }}>Salvar</Botao>
        </div>
        <p className="text-[9px]" style={{ color: COR.fraco }}>
          A plataforma opera hoje com uma empresa só ({clientes.length} produtor(es) cadastrados).
          O vínculo por empresa já está preparado no cadastro de cada usuário.
        </p>
      </Cartao>

      <Cartao>
        <div className="flex items-center gap-2">
          <Rotulo>Planos do portal do produtor</Rotulo>
          {souOwner && <Botao pequeno onClick={() => { salvarPlano({ nome: 'Novo plano' }); onMudou(); }}>+ Plano</Botao>}
        </div>
        <div className="rounded overflow-x-auto" style={{ border: `1px solid ${COR.borda}` }}>
          <table className="w-full text-[9px]" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#0f2240' }}>
                <th className="text-left px-1.5 py-1" style={{ color: COR.sub }}>Seção</th>
                {planos.map(p => (
                  <th key={p.id} className="px-1 py-1">
                    <input value={p.nome} disabled={!souOwner}
                      onChange={e => { atualizarPlano(p.id, { nome: e.target.value }); onMudou(); }}
                      className="w-16 rounded px-1 text-[9px] text-center" style={campoSt} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SECOES_PORTAL.map(s => (
                <tr key={s.id} style={{ borderTop: `1px solid ${COR.borda}` }}>
                  <td className="px-1.5 py-1" style={{ color: COR.txt }}>{s.label}</td>
                  {planos.map(p => (
                    <td key={p.id} className="text-center px-1 py-1">
                      <input type="checkbox" checked={!!p.secoes?.[s.id]} disabled={!souOwner}
                        onChange={e => { toggleSecaoPlano(p.id, s.id, e.target.checked); onMudou(); }} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {souOwner && planos.length > 1 && (
          <div className="flex gap-1.5 flex-wrap">
            {planos.map(p => (
              <Botao key={p.id} pequeno tom="perigo"
                onClick={() => { if (confirm(`Excluir o plano "${p.nome}"?`)) { excluirPlano(p.id); onMudou(); } }}>
                excluir {p.nome}
              </Botao>
            ))}
          </div>
        )}
      </Cartao>
    </div>
  );
}

// ── Aba Auditoria (geral) ───────────────────────────────────────────────────
function AbaAuditoria({ tick }: { tick: number }) {
  const [filtro, setFiltro] = useState('');
  const eventos = useMemo(() => getAuditoria().slice(0, 300), [tick]);
  const vis = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    return q ? eventos.filter(e =>
      (e.alvo ?? '').includes(q) || e.quem.includes(q) ||
      (ROTULO_ACAO[e.acao] ?? '').toLowerCase().includes(q)) : eventos;
  }, [eventos, filtro]);

  return (
    <div className="space-y-2">
      <input className="w-full rounded px-2 py-1.5 text-[11px]" style={campoSt}
        placeholder="filtrar por pessoa ou ação…" value={filtro} onChange={e => setFiltro(e.target.value)} />
      {vis.length === 0 ? <Vazio texto="Nenhum registro ainda. As ações de acesso passam a aparecer aqui." /> : (
        <div className="space-y-1">
          {vis.map(ev => (
            <div key={ev.id} className="rounded p-1.5 text-[10px]" style={{ background: '#0a1929', border: `1px solid ${COR.borda}` }}>
              <div className="flex justify-between gap-2">
                <span className="font-semibold" style={{ color: COR.txt }}>{ROTULO_ACAO[ev.acao] ?? ev.acao}</span>
                <span style={{ color: COR.fraco }}>{fmtDataHora(ev.em)}</span>
              </div>
              <p style={{ color: COR.sub }}>
                {ev.quem}{ev.alvo && ev.alvo !== ev.quem ? ` → ${ev.alvo}` : ''}
                {ev.detalhe ? ` · ${ev.detalhe}` : ''}
                {ev.de || ev.para ? ` · ${ev.de ?? '—'} → ${ev.para ?? '—'}` : ''}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Aba Perfis de permissão (conjuntos salvos com nome) ─────────────────────
// Monta um conjunto uma vez e aplica em quantas pessoas quiser (no painel
// lateral da pessoa → Permissões → "escolher um perfil salvo"). Depois de
// aplicado, cada pessoa continua ajustável individualmente.
function AbaPerfis({ souOwner, onMudou, tick }: { souOwner: boolean; onMudou: () => void; tick: number }) {
  const perfis = useMemo(() => getPerfis(), [tick]);
  const [editando, setEditando] = useState<string | null>(null);
  const [novoNome, setNovoNome] = useState('');
  const [basePapel, setBasePapel] = useState<PapelIam>('agronomo');

  const emEdicao = perfis.find(p => p.id === editando) ?? null;

  return (
    <div className="space-y-2">
      <p className="text-[10px]" style={{ color: COR.fraco }}>
        Um perfil é um conjunto de permissões com nome. Crie aqui e aplique em quem quiser —
        depois de aplicado, dá para ajustar item a item na pessoa, sem afetar o perfil.
      </p>

      {souOwner && (
        <Cartao>
          <Rotulo>Novo perfil</Rotulo>
          <div className="flex gap-1.5">
            <input className="flex-1 rounded px-2 py-1 text-[10px]" style={campoSt}
              placeholder="nome (ex.: Consultor externo)" value={novoNome} onChange={e => setNovoNome(e.target.value)} />
            <select className="rounded px-1.5 py-1 text-[10px]" style={campoSt} value={basePapel}
              onChange={e => setBasePapel(e.target.value as PapelIam)} title="começar a partir do padrão de um papel">
              {PAPEIS.map(p => <option key={p.id} value={p.id}>a partir de {p.nome}</option>)}
            </select>
            <Botao pequeno tom="ok" disabled={!novoNome.trim()}
              onClick={() => {
                const p = salvarPerfil({ nome: novoNome, permissoes: permissoesDoPapel(basePapel), papelBase: basePapel });
                setNovoNome(''); setEditando(p.id); onMudou();
              }}>Criar</Botao>
          </div>
        </Cartao>
      )}

      {perfis.length === 0 ? <Vazio texto="Nenhum perfil salvo ainda." /> : perfis.map(p => {
        const n = Object.values(p.permissoes).filter(Boolean).length;
        return (
          <Cartao key={p.id} ativo={editando === p.id}>
            <div className="flex items-center gap-2">
              <p className="text-[11px] font-bold flex-1 truncate" style={{ color: COR.txt }}>{p.nome}</p>
              <Chip cor={COR.azul}>{n} permissão(ões)</Chip>
            </div>
            <p className="text-[9px]" style={{ color: COR.fraco }}>
              criado por {p.criadoPor} · {fmtData(p.criadoEm)}
              {p.papelBase && ` · base: ${PAPEIS.find(x => x.id === p.papelBase)?.nome}`}
            </p>
            {souOwner && (
              <div className="flex gap-1.5 flex-wrap">
                <Botao pequeno onClick={() => setEditando(editando === p.id ? null : p.id)}>
                  {editando === p.id ? 'Fechar' : 'Editar permissões'}
                </Botao>
                <Botao pequeno onClick={() => {
                  const nome = prompt('Novo nome do perfil:', p.nome);
                  if (nome?.trim()) { renomearPerfil(p.id, nome); onMudou(); }
                }}>Renomear</Botao>
                <Botao pequeno tom="perigo" onClick={() => {
                  if (confirm(`Excluir o perfil "${p.nome}"?\n\nQuem já recebeu essas permissões NÃO é afetado.`)) { excluirPerfil(p.id); onMudou(); }
                }}>Excluir</Botao>
              </div>
            )}
          </Cartao>
        );
      })}

      {emEdicao && souOwner && (
        <Cartao>
          <Rotulo>Permissões de “{emEdicao.nome}” — ✔ marcado = pode</Rotulo>
          <div className="rounded overflow-x-auto" style={{ border: `1px solid ${COR.borda}` }}>
            <table className="w-full text-[9px]" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#0f2240' }}>
                  <th className="text-left px-1.5 py-1" style={{ color: COR.sub }}>Módulo</th>
                  {ACOES.map(a => <th key={a.id} className="px-1 py-1" style={{ color: COR.sub }} title={a.nome}>{a.curto}</th>)}
                </tr>
              </thead>
              <tbody>
                {MODULOS.map(m => (
                  <tr key={m.id} style={{ borderTop: `1px solid ${COR.borda}` }}>
                    <td className="px-1.5 py-1 truncate" style={{ color: COR.txt, maxWidth: 130 }}>{m.nome}</td>
                    {ACOES.map(a => {
                      const ch = chavePerm(m.id, a.id);
                      return (
                        <td key={a.id} className="text-center px-1 py-1">
                          <input type="checkbox" checked={emEdicao.permissoes[ch] === true}
                            onChange={e => {
                              salvarPerfil({
                                nome: emEdicao.nome, papelBase: emEdicao.papelBase,
                                permissoes: { ...emEdicao.permissoes, [ch]: e.target.checked },
                              });
                              onMudou();
                            }} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[9px]" style={{ color: COR.fraco }}>
            Alterar o perfil NÃO muda quem já recebeu — aplique de novo na pessoa para atualizar.
          </p>
        </Cartao>
      )}
    </div>
  );
}
