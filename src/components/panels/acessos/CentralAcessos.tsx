'use client';

// CENTRAL DE ACESSOS — substitui o antigo UsuariosPanel.
// Abas: Pendentes · Internos · Produtores · Consultores · Gerentes · Operadores
//       · Todos · Convites · Papéis · Permissões · Empresas · Auditoria
// Cada usuário abre um painel lateral (DetalheUsuario) com dados, vínculos,
// permissões e histórico.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getClientes } from '@/lib/store';
import {
  ehOwner, emailUsuario, getPlanos, salvarPlano, excluirPlano, toggleSecaoPlano,
  atualizarPlano, SECOES_PORTAL, empresaAtiva, updateEmpresa,
} from '@/lib/empresa';
import { getAuditoria } from '@/lib/iam/auditoria';
import {
  aprovarUsuario, categoriaDe, getUsuarios, migrarIamV1, rejeitarUsuario,
  statusDe, PAPEIS_ATRIBUIVEIS, type UsuarioIam,
} from '@/lib/iam/usuarios';
import {
  cancelarConvite, criarConvite, criarConviteTipo, getConvites, linkDoConvite, reenviarConvite,
  VALIDADE_TIPO_DIAS,
} from '@/lib/iam/convites';
import { MATRIZ_PADRAO } from '@/lib/iam/permissoes';
import { getPerfil, getPerfis, salvarPerfil, excluirPerfil, renomearPerfil, permissoesDoPapel } from '@/lib/iam/perfis';
import {
  ACOES, CATEGORIAS, MODULOS, PAPEIS, ROTULO_ACAO, chavePerm,
  type CategoriaIam, type PapelIam,
} from '@/lib/iam/tipos';
import {
  COR, Abas, Botao, Cartao, Chip, Modal, Rotulo, SeloStatus, Vazio,
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
  const souOwner = ehOwner();
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
            {!souOwner && <Chip cor={COR.alerta}>somente leitura</Chip>}
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
                    souOwner={souOwner} pendente={statusDe(u) === 'aguardando_aprovacao'}
                    onAbrir={() => setSel(u.email)} onMudou={recarregar} />
                ))
          )}
          {aba === 'convites'   && <AbaConvites convites={convites} souOwner={souOwner} onMudou={recarregar} />}
          {aba === 'papeis'     && <AbaPapeis />}
          {aba === 'perfis'     && <AbaPerfis souOwner={souOwner} onMudou={recarregar} tick={tick} />}
          {aba === 'permissoes' && <AbaPermissoes souOwner={souOwner} onMudou={recarregar} tick={tick} />}
          {aba === 'empresas'   && <AbaEmpresas souOwner={souOwner} onMudou={recarregar} />}
          {aba === 'auditoria'  && <AbaAuditoria tick={tick} />}
        </div>
      </div>

      {/* Painel lateral do usuário */}
      {sel && (
        <div className="flex-shrink-0" style={{ width: 340, borderLeft: `1px solid ${COR.borda}` }}>
          <DetalheUsuario email={sel} souOwner={souOwner}
            onFechar={() => setSel(null)} onMudou={recarregar} />
        </div>
      )}
    </div>
  );
}

// ── Cartão de usuário ───────────────────────────────────────────────────────
function CartaoUsuario({ u, onAbrir, selecionado, pendente, souOwner, onMudou }: {
  u: UsuarioIam; onAbrir: () => void; selecionado: boolean; pendente: boolean;
  souOwner: boolean; onMudou: () => void;
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

      {pendente && souOwner && (
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
                aprovarUsuario(u.email, papel, cat,
                  perfilDoLink ? { permissoes: perfilDoLink.permissoes } : undefined);
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
          {u.telefone && <p className="text-[9px]" style={{ color: COR.fraco }}>Telefone informado: {u.telefone}</p>}
        </div>
      )}
    </Cartao>
  );
}

// ── Aba Convites ────────────────────────────────────────────────────────────
function AbaConvites({ convites, souOwner, onMudou }: {
  convites: ReturnType<typeof getConvites>; souOwner: boolean; onMudou: () => void;
}) {
  const [novo, setNovo] = useState(false);
  const [email, setEmail] = useState('');
  const [nome, setNome] = useState('');
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
  const [diasT, setDiasT] = useState(VALIDADE_TIPO_DIAS);
  const [criadoTipo, setCriadoTipo] = useState<string | null>(null);
  const [avisoTipo, setAvisoTipo] = useState('');
  const perfis = useMemo(() => getPerfis(), []);

  const rotuloOk = rotulo.trim().length > 0;
  const emailOk = /\S+@\S+\.\S+/.test(email);

  const porTipo = convites.filter(c => c.multiuso);
  const porPessoa = convites.filter(c => !c.multiuso);

  // Antes estes dois davam `return` calado quando o campo estava vazio/inválido:
  // clicava em "Gerar link" e NADA acontecia, sem dizer o porquê. Agora o botão
  // fica desabilitado e o motivo aparece escrito.
  function criar() {
    if (!emailOk) { setAvisoPessoa('Informe um e-mail válido para gerar o convite.'); return; }
    const c = criarConvite({ email, nome: nome || undefined, categoria: cat, papel, dias });
    setCriadoPessoa(linkDoConvite(c.id)); setAvisoPessoa('');
    setEmail(''); setNome(''); setNovo(false); onMudou();
  }
  function criarTipo() {
    if (!rotuloOk) { setAvisoTipo('Dê um nome ao link (ex.: Produtores) antes de gerar.'); return; }
    const c = criarConviteTipo({ rotulo, categoria: catT, papel: papelT, perfilId: perfilT || undefined, dias: diasT });
    setCriadoTipo(linkDoConvite(c.id)); setAvisoTipo('');
    setRotulo(''); setPerfilT(''); setNovoTipo(false); onMudou();
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
          {souOwner && !novoTipo && <Botao pequeno tom="ok" onClick={() => setNovoTipo(true)}><Link2 size={10} className="inline" /> Novo link</Botao>}
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
              placeholder="nome do link (ex.: Produtores) *" value={rotulo} onChange={e => setRotulo(e.target.value)} />
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
            <div className="flex gap-1.5">
              <Botao tom="ok" disabled={!rotuloOk} onClick={criarTipo}><Send size={10} className="inline" /> Gerar link</Botao>
              <Botao onClick={() => { setNovoTipo(false); setAvisoTipo(''); }}>Cancelar</Botao>
            </div>
            {!rotuloOk && <p className="text-[9px]" style={{ color: COR.alerta }}>Dê um nome ao link para poder gerar (ex.: Produtores).</p>}
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
              </div>
              {souOwner && (
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
      {souOwner && !novo && <Botao tom="ok" onClick={() => setNovo(true)}><UserPlus size={11} className="inline" /> Convite para uma pessoa</Botao>}

      {novo && (
        <Cartao>
          <Rotulo>Novo convite</Rotulo>
          <input className="w-full rounded px-2 py-1.5 text-xs" style={campoSt} placeholder="e-mail *"
            value={email} onChange={e => setEmail(e.target.value)} />
          <input className="w-full rounded px-2 py-1.5 text-xs" style={campoSt} placeholder="nome (opcional)"
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
          <div className="flex gap-1.5">
            <Botao tom="ok" disabled={!emailOk} onClick={criar}><Send size={10} className="inline" /> Gerar link</Botao>
            <Botao onClick={() => { setNovo(false); setAvisoPessoa(''); }}>Cancelar</Botao>
          </div>
          {!emailOk && <p className="text-[9px]" style={{ color: COR.alerta }}>Informe um e-mail válido para poder gerar.</p>}
          {avisoPessoa && <p className="text-[9px]" style={{ color: COR.alerta }}>{avisoPessoa}</p>}
          <p className="text-[9px]" style={{ color: COR.fraco }}>
            O link é gerado para você copiar e mandar (WhatsApp, e-mail…). A pessoa cria a própria senha —
            nenhuma senha provisória é exibida. Para mandar UM link a várias pessoas, use “Links por tipo” acima.
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
              <p className="text-[11px] font-bold truncate" style={{ color: COR.txt }}>{c.nome || c.email}</p>
              <p className="text-[10px] truncate" style={{ color: COR.sub }}>{c.email}</p>
            </div>
            <Chip cor={c.status === 'pendente' ? COR.ok : c.status === 'expirado' ? COR.alerta : COR.fraco}>{c.status}</Chip>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap text-[9px]" style={{ color: COR.fraco }}>
            <span>criado {fmtData(c.criadoEm)}</span>
            <span>· expira {fmtData(c.expiraEm)}</span>
            {c.usadoPor && <span>· usado por {c.usadoPor}</span>}
          </div>
          {souOwner && (
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
function AbaPermissoes({ souOwner }: { souOwner: boolean; onMudou: () => void; tick: number }) {
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
        abra o usuário e use a aba <b>Permissões</b> do painel lateral{souOwner ? '' : ' (só o Owner edita)'}.
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
