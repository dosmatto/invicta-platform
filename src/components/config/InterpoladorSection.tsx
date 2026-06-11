'use client';

import { useEffect, useState } from 'react';
import { Download, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';

const ZIP_URL = 'https://codeload.github.com/dosmatto/invicta-platform/zip/refs/heads/master';
// Mesmo endpoint que o front usa em src/lib/fertilidade.ts
const INTERP_URL = process.env.NEXT_PUBLIC_INTERP_URL ?? 'http://127.0.0.1:8800';

type Status = 'verificando' | 'on' | 'off';

function detectarSO(): 'mac' | 'win' | 'outro' {
  if (typeof navigator === 'undefined') return 'outro';
  const p = (navigator.platform || '').toLowerCase();
  if (p.includes('mac')) return 'mac';
  if (p.includes('win')) return 'win';
  return 'outro';
}

export function InterpoladorSection() {
  const [status, setStatus] = useState<Status>('verificando');
  const [aba, setAba] = useState<'mac' | 'win'>(detectarSO() === 'win' ? 'win' : 'mac');

  async function checar() {
    setStatus('verificando');
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 3000);
      const r = await fetch(`${INTERP_URL}/health`, { signal: ctrl.signal });
      clearTimeout(t);
      setStatus(r.ok ? 'on' : 'off');
    } catch { setStatus('off'); }
  }
  useEffect(() => { checar(); /* eslint-disable-next-line */ }, []);

  return (
    <div className="px-4 py-3 space-y-3">
      {/* Status */}
      <div className="flex items-center justify-between p-2.5 rounded-lg" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
        <div className="flex items-center gap-2 text-[11px] font-semibold">
          {status === 'on' && <><CheckCircle2 size={14} style={{ color: '#86efac' }} /><span style={{ color: '#86efac' }}>Interpolador ligado</span></>}
          {status === 'off' && <><XCircle size={14} style={{ color: '#f87171' }} /><span style={{ color: '#f87171' }}>Interpolador desligado</span></>}
          {status === 'verificando' && <><RefreshCw size={14} className="animate-spin" style={{ color: '#93c5fd' }} /><span style={{ color: '#93c5fd' }}>Verificando…</span></>}
        </div>
        <button onClick={checar} className="text-[10px] font-semibold flex items-center gap-1" style={{ color: '#93c5fd' }}>
          <RefreshCw size={11} /> Verificar
        </button>
      </div>

      {/* Download */}
      <a href={ZIP_URL} className="w-full py-2 rounded text-xs font-bold text-white flex items-center justify-center gap-1.5"
        style={{ background: 'var(--invicta-blue)' }}>
        <Download size={13} /> Baixar arquivos do interpolador
      </a>
      <p className="text-[9px] text-center" style={{ color: '#475569' }}>Mesmo arquivo para Mac e Windows · ~10 MB</p>

      {/* Instruções por SO */}
      <div className="flex gap-1">
        {(['mac', 'win'] as const).map(s => (
          <button key={s} onClick={() => setAba(s)} className="flex-1 py-1 rounded text-[10px] font-bold"
            style={{ background: aba === s ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: aba === s ? '#fff' : '#64748b' }}>
            {s === 'mac' ? 'macOS' : 'Windows'}
          </button>
        ))}
      </div>

      {aba === 'win' && (
        <ol className="text-[10px] space-y-1.5 pl-4 list-decimal" style={{ color: '#cbd5e1' }}>
          <li>Clique em <strong>Baixar arquivos do interpolador</strong> (acima) e descompacte o ZIP.</li>
          <li>Instale o Python 3 em <a href="https://www.python.org/downloads/" target="_blank" rel="noreferrer" className="underline" style={{ color: '#93c5fd' }}>python.org</a> (marque <strong>“Add python.exe to PATH”</strong>).</li>
          <li>Abra a pasta descompactada → entre em <code style={mono}>backend</code> → duplo-clique em <code style={mono}>start.bat</code>.</li>
          <li>Espere aparecer <code style={mono}>http://127.0.0.1:8800</code>. <strong>Deixe a janela aberta</strong> e clique em <em>Verificar</em> aqui — deve ficar <strong style={{ color: '#86efac' }}>verde</strong>.</li>
          <li>Próximas vezes, é só duplo-clique no <code style={mono}>start.bat</code>.</li>
        </ol>
      )}

      {aba === 'mac' && (
        <ol className="text-[10px] space-y-1.5 pl-4 list-decimal" style={{ color: '#cbd5e1' }}>
          <li>Clique em <strong>Baixar arquivos do interpolador</strong> (acima) e descompacte o ZIP.</li>
          <li>Verifique o Python 3: abra o <strong>Terminal</strong> e rode <code style={mono}>python3 --version</code>. Se não tiver, instale em <a href="https://www.python.org/downloads/macos/" target="_blank" rel="noreferrer" className="underline" style={{ color: '#93c5fd' }}>python.org</a>.</li>
          <li>No Finder, abra a pasta descompactada → entre em <code style={mono}>backend</code>.</li>
          <li>Como o arquivo veio da internet, o Gatekeeper pode bloquear o duplo-clique. Pelo Terminal (mais seguro): arraste a pasta <code style={mono}>backend</code> pra dentro do Terminal pra colar o caminho, depois rode:
            <pre className="mt-1 p-2 rounded text-[10px]" style={{ background: '#0b1d3a', color: '#cbd5e1' }}>{`cd <caminho-que-apareceu>
chmod +x start.sh start.command
bash start.sh`}</pre>
          </li>
          <li>Espere aparecer <code style={mono}>http://127.0.0.1:8800</code>. <strong>Deixe o Terminal aberto</strong> e clique em <em>Verificar</em> aqui — deve ficar <strong style={{ color: '#86efac' }}>verde</strong>.</li>
          <li>Próximas vezes, duplo-clique no <code style={mono}>start.command</code> direto (já fica autorizado).</li>
        </ol>
      )}

      <p className="text-[9px]" style={{ color: '#475569' }}>
        O interpolador roda <strong>na sua máquina</strong>, em <code style={mono}>127.0.0.1:8800</code>. Os dados não saem do computador.
      </p>
    </div>
  );
}

const mono = { background: '#0b1d3a', color: '#cbd5e1', padding: '0 4px', borderRadius: 3, fontFamily: 'ui-monospace, monospace' } as const;
