'use client';

// CATÁLOGOS DA IMPORTAÇÃO — Cultivares e Propósitos (pendência 20, fase 2).
//
// Os dois painéis nascem com uma exigência que os outros da Biblioteca não têm:
// precisam funcionar TAMBÉM dentro de um modal, chamados de dentro do painel de
// conferência da planilha ("este cultivar não existe — cadastrar agora"). Daí as
// props `nomeInicial` (pré-preenche com o que veio da planilha) e `onCriado`
// (devolve o item recém-criado para quem chamou vincular na hora, sem o usuário
// perder a posição da tabela).
//
// O campo que justifica o cadastro de cultivar existir: `siglas`. A planilha do
// cliente traz "55I57RSF IPRO", não "Brasmax Zeus IPRO". Nenhuma heurística
// chega de um ao outro — o usuário diz UMA vez, a sigla fica gravada aqui, e a
// planilha do ano que vem casa sozinha. É o mecanismo que faz o trabalho manual
// não se repetir.

import { useMemo, useState } from 'react';
import { listar, criar, atualizar, excluir as excluirItem, type ItemBiblioteca } from '@/lib/biblioteca';
import type { ConteudoCultivar, ConteudoProposito } from '@/lib/biblioteca';
import { CULTURAS } from '@/lib/store';
import { marcaProvavel, nomeComercial } from '@/lib/importacao/catalogo';
import { na } from '@/lib/importacao/texto';
import { inputStyle } from '@/constants/ui';
import { Plus, Save, Trash2, Pencil, X, AlertTriangle, Sprout, Target } from 'lucide-react';

// ── peças compartilhadas ───────────────────────────────────────────────────

function Campo({ rotulo, dica, children }: { rotulo: string; dica?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: '#93c5fd' }}>{rotulo}</span>
      {children}
      {dica && <span className="text-[9px]" style={{ color: '#64748b' }}>{dica}</span>}
    </label>
  );
}

const entrada = 'px-2 py-1 rounded text-[11px] w-full';

/** Lista de siglas ↔ texto separado por vírgula, sem perder o que o usuário digitou. */
const siglasParaTexto = (s: string[] | undefined) => (s ?? []).join(', ');
const textoParaSiglas = (t: string) =>
  [...new Set(t.split(',').map(x => na(x)).filter(Boolean))];

// ── Cultivares ─────────────────────────────────────────────────────────────

interface RascunhoCultivar {
  id: string | null;
  nome: string;
  conteudo: ConteudoCultivar;
  siglasTexto: string;
}

const cultivarVazio = (nome = ''): RascunhoCultivar => ({
  id: null,
  nome,
  // Marca e sigla saem do próprio código que veio na planilha: se o usuário
  // chegou aqui vindo de "AG9021PRO3", não faz sentido pedir que ele redigite.
  conteudo: { siglas: nome ? [na(nome)] : [], marca: marcaProvavel(nome) },
  siglasTexto: nome ? na(nome) : '',
});

export function CultivaresPanel({ nomeInicial, onCriado }: { nomeInicial?: string; onCriado?: (it: ItemBiblioteca<ConteudoCultivar>) => void } = {}) {
  const [tick, setTick] = useState(0);
  // Vindo da conferência, o nome sugerido é o comercial entre parênteses quando
  // ele existe ("DP155100886 (P25300PWU)" → "P25300PWU"), porque é o único
  // pedaço do código que é de fato um nome.
  const [r, setR] = useState<RascunhoCultivar>(() => {
    const sigla = nomeInicial ?? '';
    const rasc = cultivarVazio(sigla);
    const comercial = nomeComercial(sigla);
    return comercial ? { ...rasc, nome: comercial } : rasc;
  });
  const [erro, setErro] = useState('');
  const [filtro, setFiltro] = useState('');

  const itens = useMemo(() => listar<ConteudoCultivar>('cultivares'), [tick]);
  const visiveis = useMemo(() => {
    const f = na(filtro);
    if (!f) return itens;
    return itens.filter(i => na(`${i.nome} ${(i.conteudo?.siglas ?? []).join(' ')} ${i.conteudo?.marca ?? ''}`).includes(f));
  }, [itens, filtro]);

  const setC = (p: Partial<ConteudoCultivar>) => setR(x => ({ ...x, conteudo: { ...x.conteudo, ...p } }));

  function salvar() {
    const nome = r.nome.trim();
    if (!nome) { setErro('Dê um nome ao cultivar — é ele que vai aparecer nos relatórios.'); return; }
    const siglas = textoParaSiglas(r.siglasTexto);

    // Uma sigla só pode apontar para um cultivar. Deixar duas iguais faria a
    // importação devolver "ambíguo" para sempre, sem o usuário entender por quê.
    const conflito = itens.find(i => i.id !== r.id && (i.conteudo?.siglas ?? []).some(s => siglas.some(x => na(x) === na(s))));
    if (conflito) { setErro(`A sigla já está cadastrada em "${conflito.nome}". Uma sigla serve a um cultivar só.`); return; }

    const conteudo: ConteudoCultivar = { ...r.conteudo, siglas };
    if (r.id) {
      atualizar<ConteudoCultivar>('cultivares', r.id, { nome, conteudo });
    } else {
      // escopo 'empresa': os registros de cultivo apontam para este item, e
      // catálogo privado seria FK que só funciona para quem cadastrou.
      const novo = criar<ConteudoCultivar>('cultivares', { nome, conteudo, escopo: 'empresa' });
      onCriado?.(novo);
    }
    setR(cultivarVazio());
    setErro('');
    setTick(t => t + 1);
  }

  function editar(it: ItemBiblioteca<ConteudoCultivar>) {
    setR({ id: it.id, nome: it.nome, conteudo: { ...it.conteudo }, siglasTexto: siglasParaTexto(it.conteudo?.siglas) });
    setErro('');
  }

  function excluir(it: ItemBiblioteca<ConteudoCultivar>) {
    if (!confirm(`Excluir "${it.nome}"? As siglas aprendidas para ele também somem, e a próxima importação vai perguntar de novo.`)) return;
    excluirItem('cultivares', it.id);
    if (r.id === it.id) setR(cultivarVazio());
    setTick(t => t + 1);
  }

  return (
    <div className="p-3 space-y-3">
      <div className="space-y-2 p-2 rounded" style={{ background: '#0b1d3a', border: '1px solid #1a3a6b' }}>
        <div className="grid grid-cols-2 gap-2">
          <Campo rotulo="Nome do cultivar / híbrido" dica="É o que sai nos relatórios">
            <input value={r.nome} onChange={e => setR(x => ({ ...x, nome: e.target.value }))}
              placeholder="Brasmax Zeus IPRO" className={entrada} style={inputStyle} />
          </Campo>
          <Campo rotulo="Marca / obtentor">
            <input value={r.conteudo.marca ?? ''} onChange={e => setC({ marca: e.target.value })}
              placeholder="Brasmax" className={entrada} style={inputStyle} />
          </Campo>
          <Campo rotulo="Cultura">
            <select value={r.conteudo.culturaId ?? ''} onChange={e => setC({ culturaId: e.target.value || undefined })}
              className={entrada} style={inputStyle}>
              <option value="">— qualquer —</option>
              {CULTURAS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Tecnologia / evento">
            <input value={r.conteudo.tecnologia ?? ''} onChange={e => setC({ tecnologia: e.target.value })}
              placeholder="IPRO, I2X, PRO4, VIP3" className={entrada} style={inputStyle} />
          </Campo>
        </div>

        <Campo rotulo="Códigos comerciais (separados por vírgula)"
          dica="Como este material chega nas planilhas dos clientes. Cada código aqui é reconhecido sozinho nas próximas importações.">
          <input value={r.siglasTexto} onChange={e => setR(x => ({ ...x, siglasTexto: e.target.value }))}
            placeholder="55I57RSF IPRO, 55I57RSF" className={entrada} style={inputStyle} />
        </Campo>

        {erro && (
          <p className="text-[10px] flex items-start gap-1" style={{ color: '#f87171' }}>
            <AlertTriangle size={11} className="flex-shrink-0 mt-0.5" /> {erro}
          </p>
        )}

        <div className="flex items-center gap-2">
          <button onClick={salvar} className="px-3 py-2 rounded text-[11px] font-bold text-white flex items-center gap-1.5"
            style={{ background: 'var(--invicta-green-dark)' }}>
            {r.id ? <><Save size={12} /> Salvar alterações</> : <><Plus size={12} /> Cadastrar cultivar</>}
          </button>
          {r.id && (
            <button onClick={() => { setR(cultivarVazio()); setErro(''); }}
              className="px-2 py-2 rounded text-[11px] flex items-center gap-1" style={{ color: '#94a3b8' }}>
              <X size={12} /> Cancelar
            </button>
          )}
        </div>
      </div>

      <input value={filtro} onChange={e => setFiltro(e.target.value)}
        placeholder="Buscar por nome, marca ou código…" className={entrada} style={inputStyle} />

      <div className="space-y-1">
        <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#cbd5e1' }}>
          Cultivares ({visiveis.length})
        </span>
        {!visiveis.length && (
          <p className="text-[10px] py-2" style={{ color: '#64748b' }}>
            Nenhum cultivar ainda. Cada um que você cadastrar com o código comercial
            deixa de ser perguntado nas importações seguintes.
          </p>
        )}
        {visiveis.map(it => (
          <div key={it.id} className="px-2 py-1.5 rounded flex items-center gap-2" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold truncate" style={{ color: '#e2e8f0' }}>{it.nome}</p>
              <p className="text-[9px] truncate" style={{ color: '#64748b' }}>
                {[it.conteudo?.marca, it.conteudo?.culturaId, it.conteudo?.tecnologia].filter(Boolean).join(' · ')}
                {(it.conteudo?.siglas?.length ?? 0) > 0 && (
                  <span style={{ color: '#4ade80' }}> · {it.conteudo.siglas.length} código(s): {it.conteudo.siglas.join(', ')}</span>
                )}
              </p>
            </div>
            <button onClick={() => editar(it)} title="Editar" className="p-1 rounded flex-shrink-0" style={{ background: '#1a3a6b', color: '#93c5fd' }}><Pencil size={11} /></button>
            <button onClick={() => excluir(it)} title="Excluir" className="p-1 rounded flex-shrink-0" style={{ color: '#f87171' }}><Trash2 size={11} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Propósitos ─────────────────────────────────────────────────────────────

interface RascunhoProposito {
  id: string | null;
  nome: string;
  equivaleAGrao: boolean;
  sinonimosTexto: string;
}

const propositoVazio = (nome = ''): RascunhoProposito => ({
  id: null, nome, equivaleAGrao: false, sinonimosTexto: nome ? na(nome) : '',
});

export function PropositosPanel({ nomeInicial, onCriado }: { nomeInicial?: string; onCriado?: (it: ItemBiblioteca<ConteudoProposito>) => void } = {}) {
  const [tick, setTick] = useState(0);
  const [r, setR] = useState<RascunhoProposito>(() => propositoVazio(nomeInicial ?? ''));
  const [erro, setErro] = useState('');

  const itens = useMemo(() => listar<ConteudoProposito>('propositos'), [tick]);

  function salvar() {
    const nome = r.nome.trim();
    if (!nome) { setErro('Dê um nome ao propósito.'); return; }
    const conteudo: ConteudoProposito = {
      equivaleAGrao: r.equivaleAGrao,
      sinonimos: textoParaSiglas(r.sinonimosTexto),
    };
    if (r.id) atualizar<ConteudoProposito>('propositos', r.id, { nome, conteudo });
    else onCriado?.(criar<ConteudoProposito>('propositos', { nome, conteudo, escopo: 'empresa' }));
    setR(propositoVazio());
    setErro('');
    setTick(t => t + 1);
  }

  return (
    <div className="p-3 space-y-3">
      <div className="space-y-2 p-2 rounded" style={{ background: '#0b1d3a', border: '1px solid #1a3a6b' }}>
        <div className="grid grid-cols-2 gap-2">
          <Campo rotulo="Propósito">
            <input value={r.nome} onChange={e => setR(x => ({ ...x, nome: e.target.value }))}
              placeholder="Produção de Grãos" className={entrada} style={inputStyle} />
          </Campo>
          <Campo rotulo="Conta como grão?" dica="Campo de Semente conta como grão nos cálculos, mas continua registrado como Campo de Semente">
            <select value={r.equivaleAGrao ? 'sim' : 'nao'} onChange={e => setR(x => ({ ...x, equivaleAGrao: e.target.value === 'sim' }))}
              className={entrada} style={inputStyle}>
              <option value="nao">Não</option>
              <option value="sim">Sim, equivale a grão</option>
            </select>
          </Campo>
        </div>
        <Campo rotulo="Como o cliente escreve (separado por vírgula)"
          dica="O texto exato que vem na planilha. Ex.: Sil.Planta Inteira, Campo de Semente-UBS">
          <input value={r.sinonimosTexto} onChange={e => setR(x => ({ ...x, sinonimosTexto: e.target.value }))}
            className={entrada} style={inputStyle} />
        </Campo>

        {erro && (
          <p className="text-[10px] flex items-start gap-1" style={{ color: '#f87171' }}>
            <AlertTriangle size={11} className="flex-shrink-0 mt-0.5" /> {erro}
          </p>
        )}
        <div className="flex items-center gap-2">
          <button onClick={salvar} className="px-3 py-2 rounded text-[11px] font-bold text-white flex items-center gap-1.5"
            style={{ background: 'var(--invicta-green-dark)' }}>
            {r.id ? <><Save size={12} /> Salvar alterações</> : <><Plus size={12} /> Cadastrar propósito</>}
          </button>
          {r.id && (
            <button onClick={() => { setR(propositoVazio()); setErro(''); }}
              className="px-2 py-2 rounded text-[11px] flex items-center gap-1" style={{ color: '#94a3b8' }}>
              <X size={12} /> Cancelar
            </button>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#cbd5e1' }}>
          Propósitos ({itens.length})
        </span>
        {itens.map(it => (
          <div key={it.id} className="px-2 py-1.5 rounded flex items-center gap-2" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold truncate" style={{ color: '#e2e8f0' }}>
                {it.nome}
                {it.conteudo?.equivaleAGrao && (
                  <span className="ml-1.5 text-[8px] font-bold px-1 rounded" style={{ background: '#14532d', color: '#4ade80' }}>CONTA COMO GRÃO</span>
                )}
              </p>
              <p className="text-[9px] truncate" style={{ color: '#64748b' }}>
                {(it.conteudo?.sinonimos ?? []).join(' · ') || 'sem sinônimos'}
              </p>
            </div>
            <button onClick={() => { setR({ id: it.id, nome: it.nome, equivaleAGrao: !!it.conteudo?.equivaleAGrao, sinonimosTexto: siglasParaTexto(it.conteudo?.sinonimos) }); setErro(''); }}
              title="Editar" className="p-1 rounded flex-shrink-0" style={{ background: '#1a3a6b', color: '#93c5fd' }}><Pencil size={11} /></button>
            <button onClick={() => { if (confirm(`Excluir "${it.nome}"?`)) { excluirItem('propositos', it.id); setTick(t => t + 1); } }}
              title="Excluir" className="p-1 rounded flex-shrink-0" style={{ color: '#f87171' }}><Trash2 size={11} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

export const ICONE_CULTIVARES = Sprout;
export const ICONE_PROPOSITOS = Target;
