'use client';

// IA F3 — "Perguntar sobre este talhão" (§19). Chat livre que usa SÓ o contexto
// do talhão (mesmo pacote RAG do diagnóstico). Não persiste (é conversa de
// sessão); cada resposta mostra o custo estimado.

import { useEffect, useRef, useState } from 'react';
import { chatTalhao, type MsgChat } from '@/lib/ia';
import { MessagesSquare, Loader2, Send, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';

const SUGESTOES = [
  'Qual o principal limitante deste talhão?',
  'O que mudou nas últimas safras?',
  'Onde devo investigar compactação?',
  'Esse talhão tem estabilidade produtiva?',
];

const usd = (v?: number) => (v == null ? '' : `US$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 4 })}`);

export function ChatTalhaoCard({ talhaoId, safraNome }: { talhaoId: string; safraNome?: string }) {
  const [aberto, setAberto] = useState(false);
  const [msgs, setMsgs] = useState<(MsgChat & { custo?: number })[]>([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const fimRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMsgs([]); setErro(''); setTexto(''); }, [talhaoId, safraNome]);
  useEffect(() => { fimRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, enviando]);

  async function perguntar(p: string) {
    const q = p.trim();
    if (!q || enviando) return;
    setErro(''); setTexto('');
    const historico: MsgChat[] = msgs.map(m => ({ role: m.role, content: m.content }));
    setMsgs(m => [...m, { role: 'user', content: q }]);
    setEnviando(true);
    try {
      const { resposta, custoEstimado } = await chatTalhao(talhaoId, safraNome, q, historico);
      setMsgs(m => [...m, { role: 'assistant', content: resposta, custo: custoEstimado }]);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao perguntar.');
    } finally { setEnviando(false); }
  }

  return (
    <div className="p-3 rounded-lg space-y-2" style={{ background: '#0a1929', border: '1px solid #1a3a6b' }}>
      <button onClick={() => setAberto(a => !a)} className="w-full flex items-center gap-2">
        <MessagesSquare size={14} style={{ color: '#38bdf8' }} />
        <span className="text-[11px] font-bold uppercase tracking-wider flex-1 text-left" style={{ color: '#cbd5e1' }}>Perguntar sobre este talhão</span>
        {aberto ? <ChevronUp size={13} style={{ color: '#64748b' }} /> : <ChevronDown size={13} style={{ color: '#64748b' }} />}
      </button>

      {aberto && (
        <>
          {msgs.length === 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px]" style={{ color: '#94a3b8' }}>A IA responde usando só os dados deste talhão. Experimente:</p>
              <div className="flex flex-wrap gap-1">
                {SUGESTOES.map(s => (
                  <button key={s} onClick={() => void perguntar(s)} disabled={enviando}
                    className="text-[9px] px-2 py-1 rounded disabled:opacity-50" style={{ background: '#0f2240', color: '#93c5fd', border: '1px solid #1a3a6b' }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {msgs.length > 0 && (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {msgs.map((m, i) => (
                <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                  <div className="max-w-[85%] rounded-lg px-2.5 py-1.5" style={{
                    background: m.role === 'user' ? '#1e3a8a' : '#061525',
                    border: `1px solid ${m.role === 'user' ? '#2e5fa3' : '#1a3a6b'}`,
                  }}>
                    <p className="text-[11px] leading-relaxed whitespace-pre-wrap" style={{ color: m.role === 'user' ? '#dbeafe' : '#e2e8f0' }}>{m.content}</p>
                    {m.role === 'assistant' && m.custo != null && <p className="text-[8px] mt-0.5" style={{ color: '#475569' }}>{usd(m.custo)}</p>}
                  </div>
                </div>
              ))}
              {enviando && <div className="flex justify-start"><div className="rounded-lg px-2.5 py-1.5 flex items-center gap-1.5 text-[10px]" style={{ background: '#061525', border: '1px solid #1a3a6b', color: '#64748b' }}><Loader2 size={11} className="animate-spin" /> pensando…</div></div>}
              <div ref={fimRef} />
            </div>
          )}

          {erro && <p className="text-[10px] flex items-start gap-1" style={{ color: '#f87171' }}><AlertTriangle size={11} className="flex-shrink-0 mt-[1px]" /> {erro}</p>}

          <form onSubmit={e => { e.preventDefault(); void perguntar(texto); }} className="flex gap-1">
            <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Escreva sua pergunta…" disabled={enviando}
              className="flex-1 rounded px-2 py-1.5 text-[11px] outline-none" style={{ background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' }} />
            <button type="submit" disabled={enviando || !texto.trim()}
              className="px-2.5 rounded flex items-center justify-center disabled:opacity-40" style={{ background: '#0284c7', color: '#fff' }}>
              <Send size={13} />
            </button>
          </form>
        </>
      )}
    </div>
  );
}
