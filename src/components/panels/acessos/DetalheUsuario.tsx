'use client';

// Painel lateral de UM usuário: dados pessoais, vínculos (produtor→fazenda→
// talhão), papel, permissões granulares (com clonar), histórico/auditoria e
// bloquear/desbloquear. É o "painel lateral" pedido na Central de Acessos.

import { useMemo, useState } from 'react';
import { getClientes, getFazendas, getTalhoes } from '@/lib/store';
import { getPlanos, renovarValidade, diasRestantes } from '@/lib/empresa';
import { resetarSenhaAdmin } from '@/lib/authAdmin';
import { auditoriaDe } from '@/lib/iam/auditoria';
import { registrar } from '@/lib/iam/auditoria';
import {
  bloquearUsuario, categoriaDe, clonarPermissoes, definirCategoria, definirPapel,
  definirPermissaoUsuario, definirVinculos, desbloquearUsuario, getUsuarios,
  limparExcecoes, removerUsuario, salvarUsuario, statusDe, PAPEIS_ATRIBUIVEIS,
  type UsuarioIam,
} from '@/lib/iam/usuarios';
import { permissoesEfetivas, MATRIZ_PADRAO } from '@/lib/iam/permissoes';
import { clienteIdDoProdutor, produtorSemVinculo } from '@/lib/iam/vinculoProdutor';
import { getPerfis, getPerfil, salvarPerfil } from '@/lib/iam/perfis';
import {
  ACOES, CATEGORIAS, MODULOS, PAPEIS, ROTULO_ACAO, chavePerm,
  type CategoriaIam, type PapelIam,
} from '@/lib/iam/tipos';
import { COR, Bloco, Botao, Chip, Marcar, Modal, Rotulo, SeloStatus, campoSt, fmtDataHora, fmtRelativo } from './ui';
import { Ban, Copy, KeyRound, Loader2, Save, Trash2, Unlock } from 'lucide-react';

type Secao = 'dados' | 'vinculos' | 'permissoes' | 'auditoria';

export function DetalheUsuario({ email, onFechar, onMudou, podeEditar, podeExcluir }: {
  // Poderes vindos da matriz (usuarios.editar / usuarios.excluir), já com a
  // trava do dono aplicada — ver lib/iam/permissoes.poderesSobreUsuario.
  email: string; onFechar: () => void; onMudou: () => void;
  podeEditar: boolean; podeExcluir: boolean;
}) {
  const [secao, setSecao] = useState<Secao>('dados');
  const [msg, setMsg] = useState('');
  const [resetando, setResetando] = useState(false);
  const [confirmar, setConfirmar] = useState<null | 'remover' | 'bloquear'>(null);
  const [motivo, setMotivo] = useState('');

  const u = getUsuarios().find(x => x.email === email) ?? null;
  const clientes = useMemo(() => getClientes(), []);
  const planos = useMemo(() => getPlanos(), []);

  if (!u) return null;
  const papel = (u.papel ?? 'leitor') as PapelIam;
  const efetivas = permissoesEfetivas(papel, u.permissoes);
  const bloqueado = statusDe(u) === 'bloqueado';

  function atualizar(fn: () => void) { fn(); onMudou(); }

  async function resetarSenha() {
    if (!podeEditar || resetando) return;
    if (!confirm(`Enviar uma nova senha para ${u!.email}?\n\nO usuário receberá um e-mail do Supabase para definir a senha.`)) return;
    setResetando(true); setMsg('');
    try {
      // Senha temporária ALEATÓRIA e forte: não é exibida a ninguém — o usuário
      // usa "esqueci minha senha" para definir a dele (requisito do projeto:
      // nunca exibir senha provisória).
      const bytes = new Uint8Array(18);
      crypto.getRandomValues(bytes);
      const temp = 'Inv-' + btoa(String.fromCharCode(...bytes)).replace(/[^a-zA-Z0-9]/g, '').slice(0, 20);
      const r = await resetarSenhaAdmin(u!.email, temp);
      if (r.ok) {
        salvarUsuario(u!.email, { senhaProvisoria: true });
        registrar('senha_resetada', { alvo: u!.email });
        setMsg('Senha redefinida. Peça ao usuário para usar "Esqueci minha senha" na tela de login, ou informe a nova senha por um canal seguro.');
        onMudou();
      } else setMsg(r.erro || 'Não foi possível redefinir a senha.');
    } finally { setResetando(false); }
  }

  return (
    <div className="flex flex-col h-full" style={{ background: COR.fundo }}>
      {/* Cabeçalho */}
      <div className="px-3 py-2.5 flex-shrink-0" style={{ borderBottom: `1px solid ${COR.borda}` }}>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold truncate" style={{ color: COR.txt }}>{u.nome || u.email}</p>
            <p className="text-[10px] truncate" style={{ color: COR.sub }}>{u.email}</p>
          </div>
          <button onClick={onFechar} className="text-lg leading-none" style={{ color: COR.fraco }}>×</button>
        </div>
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          <SeloStatus status={statusDe(u)} />
          <Chip>{CATEGORIAS.find(c => c.id === categoriaDe(u))?.nome ?? '—'}</Chip>
          <Chip cor="#c4b5fd">{PAPEIS.find(p => p.id === papel)?.nome ?? papel}</Chip>
        </div>
      </div>

      {/* Sub-abas */}
      <div className="flex gap-1 px-3 py-2 flex-shrink-0">
        {([['dados', 'Dados'], ['vinculos', 'Vínculos'], ['permissoes', 'Permissões'], ['auditoria', 'Histórico']] as const)
          .map(([id, lb]) => (
            <button key={id} onClick={() => setSecao(id)}
              className="flex-1 py-1 rounded text-[10px] font-bold"
              style={{ background: secao === id ? 'var(--invicta-blue-mid)' : COR.borda, color: secao === id ? '#fff' : COR.fraco }}>
              {lb}
            </button>
          ))}
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-3">
        {msg && <p className="text-[10px] rounded p-2" style={{ background: '#0f2240', color: COR.azul }}>{msg}</p>}

        {secao === 'dados' && (
          <SecaoDados u={u} podeEditar={podeEditar} planos={planos} clientes={clientes}
            onMudou={onMudou} atualizar={atualizar} />
        )}

        {secao === 'vinculos' && (
          <SecaoVinculos u={u} podeEditar={podeEditar} onMudou={onMudou} />
        )}

        {secao === 'permissoes' && (
          <SecaoPermissoes u={u} papel={papel} efetivas={efetivas} podeEditar={podeEditar} onMudou={onMudou} />
        )}

        {secao === 'auditoria' && <SecaoAuditoria email={u.email} />}
      </div>

      {/* Ações do rodapé */}
      {(podeEditar || podeExcluir) && (
        <div className="flex flex-wrap gap-1.5 px-3 py-2 flex-shrink-0" style={{ borderTop: `1px solid ${COR.borda}` }}>
          {podeEditar && (<>
          <Botao onClick={resetarSenha} disabled={resetando} titulo="Redefinir a senha deste usuário">
            {resetando ? <Loader2 size={11} className="animate-spin inline" /> : <KeyRound size={11} className="inline" />} Senha
          </Botao>
          {bloqueado
            ? <Botao tom="ok" onClick={() => atualizar(() => desbloquearUsuario(u.email))}><Unlock size={11} className="inline" /> Desbloquear</Botao>
            : <Botao tom="perigo" onClick={() => setConfirmar('bloquear')}><Ban size={11} className="inline" /> Bloquear</Botao>}
          </>)}
          {podeExcluir && (
            <Botao tom="perigo" onClick={() => setConfirmar('remover')}><Trash2 size={11} className="inline" /> Remover</Botao>
          )}
        </div>
      )}

      {confirmar && (
        <Modal titulo={confirmar === 'remover' ? 'Remover acesso' : 'Bloquear usuário'} onFechar={() => setConfirmar(null)}>
          <p className="text-[11px] mb-2" style={{ color: COR.sub }}>
            {confirmar === 'remover'
              ? `Remover o acesso de ${u.email}? A conta de login continua existindo, mas a pessoa deixa de entrar no sistema.`
              : `Bloquear ${u.email}? Ela continua cadastrada, mas não consegue usar o sistema até ser desbloqueada.`}
          </p>
          {confirmar === 'bloquear' && (
            <input className="w-full rounded px-2 py-1.5 text-xs mb-2" style={campoSt}
              placeholder="Motivo (opcional)" value={motivo} onChange={e => setMotivo(e.target.value)} />
          )}
          <div className="flex gap-2 justify-end">
            <Botao onClick={() => setConfirmar(null)}>Cancelar</Botao>
            <Botao tom="perigo" onClick={() => {
              if (confirmar === 'remover') { removerUsuario(u.email); onFechar(); }
              else bloquearUsuario(u.email, motivo || undefined);
              setConfirmar(null); setMotivo(''); onMudou();
            }}>{confirmar === 'remover' ? 'Remover' : 'Bloquear'}</Botao>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Dados pessoais + papel/categoria + validade ─────────────────────────────
function SecaoDados({ u, podeEditar, planos, clientes, onMudou, atualizar }: {
  u: UsuarioIam; podeEditar: boolean; onMudou: () => void;
  planos: Array<{ id: string; nome: string }>; clientes: Array<{ id: string; nome: string }>;
  atualizar: (fn: () => void) => void;
}) {
  const [nome, setNome] = useState(u.nome ?? '');
  const [tel, setTel] = useState(u.telefone ?? '');
  const [dias, setDias] = useState(30);
  const rest = diasRestantes(u);

  return (
    <div className="space-y-2.5">
      <div className="space-y-1">
        <Rotulo>Nome</Rotulo>
        <input className="w-full rounded px-2 py-1.5 text-xs" style={campoSt} value={nome}
          disabled={!podeEditar}
          onChange={e => setNome(e.target.value)}
          onBlur={() => nome !== (u.nome ?? '') && atualizar(() => { salvarUsuario(u.email, { nome }); })} />
      </div>
      <div className="space-y-1">
        <Rotulo>Telefone</Rotulo>
        <input className="w-full rounded px-2 py-1.5 text-xs" style={campoSt} value={tel}
          disabled={!podeEditar} placeholder="(00) 00000-0000"
          onChange={e => setTel(e.target.value)}
          onBlur={() => tel !== (u.telefone ?? '') && atualizar(() => { salvarUsuario(u.email, { telefone: tel }); })} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Rotulo>Categoria</Rotulo>
          <select className="w-full rounded px-2 py-1.5 text-[11px]" style={campoSt} disabled={!podeEditar}
            value={categoriaDe(u)}
            onChange={e => atualizar(() => definirCategoria(u.email, e.target.value as CategoriaIam))}>
            {CATEGORIAS.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Rotulo>Papel</Rotulo>
          <select className="w-full rounded px-2 py-1.5 text-[11px]" style={campoSt} disabled={!podeEditar}
            value={u.papel}
            onChange={e => atualizar(() => definirPapel(u.email, e.target.value as PapelIam))}>
            {PAPEIS.filter(p => p.id === 'owner' || PAPEIS_ATRIBUIVEIS.includes(p.id)).map(p =>
              <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </div>
      </div>

      {produtorSemVinculo(u.papel, u) && (
        <p className="text-[10px] rounded p-2" style={{ background: '#3a2300', color: '#fbbf24', border: '1px solid #92400e' }}>
          Este produtor <b>não consegue entrar</b>: falta escolher o produtor (cliente) abaixo.
          Sem vínculo, o Portal do Produtor mostra “Acesso ainda não vinculado”, mesmo com o cadastro ativo.
        </p>
      )}

      {u.papel === 'produtor' && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Rotulo>Produtor (cliente)</Rotulo>
            <select className="w-full rounded px-2 py-1.5 text-[11px]" style={campoSt} disabled={!podeEditar}
              value={clienteIdDoProdutor(u) ?? ''}
              onChange={e => atualizar(() => {
                // Grava nos DOIS campos: o antigo (que o Portal lê) e o do IAM
                // (que a aba Vínculos e o convite preenchem). Enquanto viviam
                // separados, dava para o cartão mostrar "1 prod" e o produtor
                // não conseguir entrar. Ver lib/iam/vinculoProdutor.ts.
                const id = e.target.value;
                salvarUsuario(u.email, {
                  clienteId: id,
                  clientesVinculados: id ? [id] : [],
                });
              })}>
              <option value="">— escolher —</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Rotulo>Plano</Rotulo>
            <select className="w-full rounded px-2 py-1.5 text-[11px]" style={campoSt} disabled={!podeEditar}
              value={u.planoId ?? ''}
              onChange={e => atualizar(() => { salvarUsuario(u.email, { planoId: e.target.value }); registrar('plano_alterado', { alvo: u.email, para: e.target.value }); })}>
              <option value="">— escolher —</option>
              {planos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
        </div>
      )}

      {(u.papel === 'prestador' || u.validadeAte) && (
        <div className="rounded p-2 space-y-1.5" style={{ background: '#0f2240' }}>
          <div className="flex items-center gap-2">
            <Rotulo>Validade do acesso</Rotulo>
            <span className="text-[10px] ml-auto"
              style={{ color: rest == null ? COR.fraco : rest < 0 ? COR.erro : rest <= 7 ? COR.alerta : COR.ok }}>
              {rest == null ? 'sem validade' : rest < 0 ? 'EXPIRADO' : `${rest} dia(s)`}
            </span>
          </div>
          {podeEditar && (
            <div className="flex gap-1.5">
              <input type="number" min={1} max={365} value={dias} onChange={e => setDias(Number(e.target.value))}
                className="w-16 rounded px-2 py-1 text-[11px]" style={campoSt} />
              <Botao onClick={() => { renovarValidade(u.email, dias); registrar('validade_renovada', { alvo: u.email, para: `${dias} dias` }); onMudou(); }}>Renovar</Botao>
            </div>
          )}
        </div>
      )}

      <div className="rounded p-2 space-y-1 text-[10px]" style={{ background: '#0a1929', color: COR.sub }}>
        <Linha k="Cadastrado em" v={fmtDataHora(u.criadoEm)} />
        <Linha k="Cadastrado por" v={u.criadoPor ?? '—'} />
        {u.aprovadoEm && <Linha k="Aprovado em" v={`${fmtDataHora(u.aprovadoEm)} por ${u.aprovadoPor ?? '—'}`} />}
        <Linha k="Último acesso" v={fmtRelativo(u.ultimoAcesso)} />
        {u.aceiteLgpdEm && <Linha k="Aceite LGPD" v={fmtDataHora(u.aceiteLgpdEm)} />}
        {u.motivoBloqueio && <Linha k="Motivo do bloqueio" v={u.motivoBloqueio} />}
      </div>
    </div>
  );
}
const Linha = ({ k, v }: { k: string; v: string }) => (
  <div className="flex justify-between gap-2"><span>{k}</span><span style={{ color: COR.txt }} className="text-right truncate">{v}</span></div>
);

// ── Vínculos: produtor → fazenda → talhão ───────────────────────────────────
function SecaoVinculos({ u, podeEditar, onMudou }: { u: UsuarioIam; podeEditar: boolean; onMudou: () => void }) {
  const clientes = useMemo(() => getClientes(), []);
  const [busca, setBusca] = useState('');
  const cli = new Set(u.clientesVinculados ?? []);
  const faz = new Set(u.fazendasVinculadas ?? []);
  const tal = new Set(u.talhoesVinculados ?? []);

  const fazendas = useMemo(() => getFazendas().filter(f => cli.size === 0 || cli.has(f.clienteId)), [u.clientesVinculados]); // eslint-disable-line react-hooks/exhaustive-deps
  const talhoes = useMemo(() => {
    const base = getTalhoes().filter(t => faz.size === 0 || faz.has(t.fazendaId));
    const q = busca.trim().toUpperCase();
    return q ? base.filter(t => t.nome.toUpperCase().includes(q)) : base.slice(0, 60);
  }, [busca, u.fazendasVinculadas]); // eslint-disable-line react-hooks/exhaustive-deps

  const alternar = (set: Set<string>, id: string) => {
    const novo = new Set(set);
    if (novo.has(id)) novo.delete(id); else novo.add(id);
    return [...novo];
  };

  return (
    <div className="space-y-3">
      <p className="text-[10px]" style={{ color: COR.fraco }}>
        Sem nada marcado = vê tudo. Marque para restringir. A restrição desce em cascata:
        produtor → fazenda → talhão.
      </p>

      <Bloco titulo={`Produtores (${cli.size || 'todos'})`}>
        {clientes.map(c => (
          <Marcar key={c.id} on={cli.has(c.id)} disabled={!podeEditar} label={c.nome}
            onChange={() => { definirVinculos(u.email, { clientesVinculados: alternar(cli, c.id) }); onMudou(); }} />
        ))}
      </Bloco>

      <Bloco titulo={`Fazendas (${faz.size || 'todas'})`}>
        {fazendas.length === 0 ? <p className="text-[10px]" style={{ color: COR.fraco }}>Nenhuma fazenda nos produtores marcados.</p>
          : fazendas.map(f => (
            <Marcar key={f.id} on={faz.has(f.id)} disabled={!podeEditar} label={f.nome}
              onChange={() => { definirVinculos(u.email, { fazendasVinculadas: alternar(faz, f.id) }); onMudou(); }} />
          ))}
      </Bloco>

      <Bloco titulo={`Talhões (${tal.size || 'todos'})`}>
        <input className="w-full rounded px-2 py-1 text-[11px] mb-1" style={campoSt}
          placeholder="buscar talhão…" value={busca} onChange={e => setBusca(e.target.value)} />
        {talhoes.map(t => (
          <Marcar key={t.id} on={tal.has(t.id)} disabled={!podeEditar} label={t.nome}
            onChange={() => { definirVinculos(u.email, { talhoesVinculados: alternar(tal, t.id) }); onMudou(); }} />
        ))}
        {!busca && <p className="text-[9px] pt-1" style={{ color: COR.fraco }}>Mostrando os primeiros 60 — use a busca para achar outros.</p>}
      </Bloco>

      {podeEditar && (
        <Botao onClick={() => { definirVinculos(u.email, { clientesVinculados: [], fazendasVinculadas: [], talhoesVinculados: [] }); onMudou(); }}>
          Limpar restrições (ver tudo)
        </Botao>
      )}
    </div>
  );
}
// ── Permissões granulares (módulo × ação) ───────────────────────────────────
function SecaoPermissoes({ u, papel, efetivas, podeEditar, onMudou }: {
  u: UsuarioIam; papel: PapelIam; efetivas: Record<string, boolean | undefined>;
  podeEditar: boolean; onMudou: () => void;
}) {
  const [clonarDe, setClonarDe] = useState('');
  const [perfilSel, setPerfilSel] = useState('');
  const [salvandoPerfil, setSalvandoPerfil] = useState(false);
  const [nomePerfil, setNomePerfil] = useState('');
  const outros = useMemo(() => getUsuarios().filter(x => x.email !== u.email), [u.email]);
  const perfis = useMemo(() => getPerfis(), [u.email, u.permissoes]); // eslint-disable-line react-hooks/exhaustive-deps
  const padraoPapel = MATRIZ_PADRAO[papel] ?? {};
  const nExcecoes = Object.keys(u.permissoes ?? {}).length;

  // Marca/desmarca uma LINHA inteira (todas as ações do módulo) de uma vez.
  function linhaToda(modulo: string, valor: boolean) {
    for (const a of ACOES) definirPermissaoUsuario(u.email, `${modulo}.${a.id}`, valor);
    onMudou();
  }

  return (
    <div className="space-y-2">
      {/* Explicação sem rodeio: marcado = pode */}
      <div className="rounded p-2 text-[10px] space-y-1" style={{ background: '#0f2240', color: COR.sub }}>
        <p><b style={{ color: COR.ok }}>✔ Marcado = PODE fazer.</b> Em branco = não pode.</p>
        <p>
          Papel atual: <b style={{ color: COR.azul }}>{PAPEIS.find(p => p.id === papel)?.nome}</b> — ele já vem
          com um conjunto pronto. O que você mudar aqui vale <b>só para esta pessoa</b>
          {nExcecoes > 0 && <> (<b style={{ color: COR.alerta }}>{nExcecoes} ajuste(s) próprio(s)</b>)</>}.
        </p>
      </div>

      {podeEditar && (
        <div className="rounded p-2 space-y-1.5" style={{ background: '#0a1929', border: `1px solid ${COR.borda}` }}>
          <Rotulo>Perfil de permissões</Rotulo>
          <div className="flex gap-1.5">
            <select className="flex-1 rounded px-2 py-1 text-[10px]" style={campoSt}
              value={perfilSel} onChange={e => setPerfilSel(e.target.value)}>
              <option value="">escolher um perfil salvo…</option>
              {perfis.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
            <Botao pequeno disabled={!perfilSel} titulo="Aplica o perfil; você ainda pode ajustar item a item depois"
              onClick={() => {
                const p = getPerfil(perfilSel);
                if (!p) return;
                salvarUsuario(u.email, { permissoes: { ...p.permissoes } });
                registrar('permissao_alterada', { alvo: u.email, detalhe: `perfil "${p.nome}" aplicado` });
                setPerfilSel(''); onMudou();
              }}>
              Aplicar
            </Botao>
            <Botao pequeno tom="ok" onClick={() => { setSalvandoPerfil(true); setNomePerfil(''); }}
              titulo="Salvar as permissões atuais desta pessoa como um perfil reutilizável">
              <Save size={10} className="inline" /> Salvar como…
            </Botao>
          </div>

          {salvandoPerfil && (
            <div className="flex gap-1.5">
              <input autoFocus className="flex-1 rounded px-2 py-1 text-[10px]" style={campoSt}
                placeholder="nome do perfil (ex.: Agrônomo de campo)"
                value={nomePerfil} onChange={e => setNomePerfil(e.target.value)} />
              <Botao pequeno tom="ok" disabled={!nomePerfil.trim()}
                onClick={() => {
                  salvarPerfil({ nome: nomePerfil, permissoes: efetivas as Record<string, boolean>, papelBase: papel });
                  setSalvandoPerfil(false); setNomePerfil(''); onMudou();
                }}>Salvar</Botao>
              <Botao pequeno onClick={() => setSalvandoPerfil(false)}>Cancelar</Botao>
            </div>
          )}

          <div className="flex gap-1.5">
            <select className="flex-1 rounded px-2 py-1 text-[10px]" style={campoSt}
              value={clonarDe} onChange={e => setClonarDe(e.target.value)}>
              <option value="">…ou copiar de outra pessoa</option>
              {outros.map(o => <option key={o.email} value={o.email}>{o.nome || o.email}</option>)}
            </select>
            <Botao pequeno disabled={!clonarDe}
              onClick={() => { if (clonarDe && clonarPermissoes(clonarDe, u.email)) { setClonarDe(''); onMudou(); } }}>
              <Copy size={10} className="inline" /> Copiar
            </Botao>
            <Botao pequeno onClick={() => { limparExcecoes(u.email); onMudou(); }}
              titulo="Descarta os ajustes e volta ao conjunto do papel">Voltar ao papel</Botao>
          </div>
        </div>
      )}

      <div className="rounded overflow-x-auto" style={{ border: `1px solid ${COR.borda}` }}>
        <table className="w-full text-[9px]" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#0f2240' }}>
              <th className="text-left px-1.5 py-1" style={{ color: COR.sub }}>Módulo</th>
              {ACOES.map(a => <th key={a.id} className="px-1 py-1" style={{ color: COR.sub }} title={a.nome}>{a.curto}</th>)}
              {podeEditar && <th className="px-1 py-1" style={{ color: COR.sub }} title="marcar/desmarcar a linha toda">tudo</th>}
            </tr>
          </thead>
          <tbody>
            {MODULOS.map(m => {
              const nOn = ACOES.filter(a => efetivas[chavePerm(m.id, a.id)] === true).length;
              return (
                <tr key={m.id} style={{ borderTop: `1px solid ${COR.borda}` }}>
                  <td className="px-1.5 py-1 truncate" style={{ color: nOn ? COR.txt : COR.fraco, maxWidth: 120 }} title={m.nome}>
                    {m.nome}
                  </td>
                  {ACOES.map(a => {
                    const ch = chavePerm(m.id, a.id);
                    const on = efetivas[ch] === true;
                    const excecao = u.permissoes?.[ch] !== undefined && on !== (padraoPapel[ch] === true);
                    return (
                      <td key={a.id} className="text-center px-1 py-1"
                        style={excecao ? { background: 'rgba(251,191,36,0.16)' } : undefined}
                        title={excecao ? `Ajuste próprio desta pessoa (o papel ${on ? 'não daria' : 'daria'} esta permissão)` : 'Igual ao padrão do papel'}>
                        <input type="checkbox" checked={on} disabled={!podeEditar}
                          onChange={e => { definirPermissaoUsuario(u.email, ch, e.target.checked); onMudou(); }} />
                      </td>
                    );
                  })}
                  {podeEditar && (
                    <td className="text-center px-1 py-1">
                      <button onClick={() => linhaToda(m.id, nOn < ACOES.length)}
                        className="px-1 rounded text-[9px]" style={{ background: COR.borda, color: COR.azul }}
                        title={nOn < ACOES.length ? 'marcar tudo desta linha' : 'desmarcar tudo desta linha'}>
                        {nOn < ACOES.length ? '✔' : '✕'}
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[9px]" style={{ color: COR.fraco }}>
        Fundo amarelo = ajuste próprio desta pessoa (diferente do papel).
      </p>
    </div>
  );
}

// ── Histórico / auditoria do usuário ────────────────────────────────────────
function SecaoAuditoria({ email }: { email: string }) {
  const eventos = useMemo(() => auditoriaDe(email).slice(0, 100), [email]);
  if (eventos.length === 0) return <p className="text-[11px] py-4 text-center" style={{ color: COR.fraco }}>Nenhum registro ainda.</p>;
  return (
    <div className="space-y-1">
      {eventos.map(ev => (
        <div key={ev.id} className="rounded p-1.5 text-[10px]" style={{ background: '#0a1929', border: `1px solid ${COR.borda}` }}>
          <div className="flex justify-between gap-2">
            <span className="font-semibold" style={{ color: COR.txt }}>{ROTULO_ACAO[ev.acao] ?? ev.acao}</span>
            <span style={{ color: COR.fraco }}>{fmtDataHora(ev.em)}</span>
          </div>
          <p style={{ color: COR.sub }}>
            por {ev.quem}
            {ev.detalhe ? ` · ${ev.detalhe}` : ''}
            {ev.de || ev.para ? ` · ${ev.de ?? '—'} → ${ev.para ?? '—'}` : ''}
          </p>
        </div>
      ))}
    </div>
  );
}
