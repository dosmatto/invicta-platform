'use client';

// Página PÚBLICA do convite (/convite?t=TOKEN).
//
// Fluxo (sem senha provisória em lugar nenhum):
//   1. A pessoa abre o link que o administrador mandou.
//   2. Preenche nome, e-mail, telefone, A PRÓPRIA SENHA e os aceites.
//   3. `cadastrarComConvite` cria a conta no Supabase Auth (signUp é público) —
//      ao fim ela está autenticada, o que permite gravar o pedido de acesso.
//   4. O convite é validado/consumido e o registro entra como
//      "Aguardando aprovação". Sem papel, ela ainda não acessa o sistema.
//   5. O administrador aprova na Central de Acessos.

import { Suspense, useMemo, useState } from 'react';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { cadastrarComConvite, loginEmailSenha, mensagemErroLogin } from '@/lib/auth';
import { validarConvite, marcarConviteUsado, MOTIVO_TEXTO } from '@/lib/iam/convites';
import { salvarUsuario } from '@/lib/iam/usuarios';
import { getPerfil } from '@/lib/iam/perfis';
import { registrar } from '@/lib/iam/auditoria';
import type { Convite } from '@/lib/iam/tipos';
import { CheckCircle2, Loader2, ShieldCheck, AlertTriangle } from 'lucide-react';

const AZUL = '#061525', CARD = '#0b1d3a', BORDA = '#1a3a6b', TXT = '#e2e8f0', SUB = '#94a3b8';

const inputCls = 'w-full rounded px-3 py-2 text-sm outline-none';
const inputSt = { background: '#0f2240', color: TXT, border: `1px solid #2e5fa3` } as const;

function ConviteConteudo() {
  const params = useSearchParams();
  const token = params.get('t') ?? '';

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [senha, setSenha] = useState('');
  const [senha2, setSenha2] = useState('');
  const [lgpd, setLgpd] = useState(false);
  const [termos, setTermos] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [pronto, setPronto] = useState(false);
  const [precisaConfirmar, setPrecisaConfirmar] = useState(false);
  // Convite INDIVIDUAL já traz papel/perfil/vínculos escolhidos pelo admin — não
  // precisa de aprovação de novo: entra ATIVO. O link de TIPO (multiuso) continua
  // caindo em "aguardando aprovação" (é o desenho dele; ver comentários abaixo).
  const [liberado, setLiberado] = useState(false);

  // Validação do token: só é possível quando a lista de convites está local
  // (o admin abriu o app nesta máquina) OU depois do login. Antes disso
  // seguimos em frente — a validação real acontece ao gravar o pedido.
  // Validação feita na renderização (não em efeito): é derivada do token.
  // 'inexistente' NÃO barra — pode ser só falta de sincronização nesta máquina;
  // a validação real acontece na hora de gravar o pedido.
  const validacao = useMemo(() => {
    if (!token) return { motivo: 'Link inválido: falta o código do convite.', conv: null as Convite | null };
    const r = validarConvite(token);
    if (r.ok) return { motivo: '', conv: r.convite };
    return { motivo: r.motivo === 'inexistente' ? '' : MOTIVO_TEXTO[r.motivo], conv: null };
  }, [token]);
  const conv = validacao.conv;
  const motivo = validacao.motivo;
  // Preenche e-mail/nome do convite uma única vez, quando ele existe.
  const [preencheu, setPreencheu] = useState(false);
  if (conv && !preencheu) {
    setPreencheu(true);
    if (!email) setEmail(conv.email);
    if (!nome && conv.nome) setNome(conv.nome);
  }

  const senhaCurta = senha.length > 0 && senha.length < 8;
  const senhaDiferente = senha2.length > 0 && senha !== senha2;
  const podeEnviar = useMemo(() => (
    nome.trim().length >= 3 && /\S+@\S+\.\S+/.test(email) && senha.length >= 8
    && senha === senha2 && lgpd && termos && !enviando
  ), [nome, email, senha, senha2, lgpd, termos, enviando]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!podeEnviar) return;
    setErro(''); setEnviando(true);
    const em = email.trim().toLowerCase();
    try {
      const r = await cadastrarComConvite(em, senha);
      if (!r.ok && r.jaExiste) {
        // Conta já existe: tenta entrar com a senha informada para registrar o
        // pedido. Se a senha não confere, orienta a usar "entrar".
        try { await loginEmailSenha(em, senha); }
        catch { setErro('Já existe uma conta com este e-mail. Entre com a sua senha na tela de login — se esqueceu, peça ao administrador para redefinir.'); setEnviando(false); return; }
      } else if (!r.ok) {
        setErro(r.erro || 'Não foi possível concluir o cadastro.'); setEnviando(false); return;
      }
      if (r.precisaConfirmar) setPrecisaConfirmar(true);

      // Autenticado (ou aguardando confirmação): grava o acesso.
      const agora = new Date().toISOString();
      // LIBERAÇÃO AUTOMÁTICA: todo convite CONHECIDO (individual OU de grupo) já
      // sai do admin com categoria, papel, perfil e vínculos definidos — então
      // quem se cadastra por ele entra ATIVO, sem passar por aprovação. Decisão
      // do usuário (o link de grupo também libera na hora). Um link de grupo
      // ainda pode ser cancelado/expirado se vazar; a validade curta é a defesa.
      // Só cai em "aguardando aprovação" quando o convite NÃO é conhecido neste
      // aparelho (lista não sincronizada) — aí não dá para saber o que conceder.
      const liberaAuto = !!conv;
      const vinc = {
        clientesVinculados: conv?.clientesVinculados?.length ? conv.clientesVinculados : undefined,
        fazendasVinculadas: conv?.fazendasVinculadas?.length ? conv.fazendasVinculadas : undefined,
      };
      if (liberaAuto) {
        // Permissões: o perfil escolhido no link (se houver) vira as permissões
        // próprias; sem perfil, valem as do papel (padrão da matriz). Mesmo
        // resultado da aprovação manual, só que automático.
        const perfil = conv?.perfilId ? getPerfil(conv.perfilId) : null;
        salvarUsuario(em, {
          nome: nome.trim(), telefone: telefone.trim() || undefined,
          papel: conv?.papel ?? 'leitor',
          categoria: conv?.categoria,
          status: 'ativo',
          criadoEm: agora, criadoPor: em,
          aprovadoEm: agora,
          aprovadoPor: `convite ${conv?.multiuso ? 'de grupo' : 'individual'} (liberação automática)`,
          aceiteLgpdEm: agora, aceiteTermosEm: agora,
          conviteId: token || undefined,
          ...(perfil ? { permissoes: perfil.permissoes } : {}),
          ...vinc,
        });
        registrar('usuario_aprovado', {
          alvo: em,
          detalhe: `liberado automaticamente pelo ${conv?.multiuso ? 'link de grupo' : 'link individual'}`,
          para: 'ativo',
        });
        setLiberado(true);
      } else {
        // Só chega aqui quando o convite NÃO é conhecido neste aparelho (conv é
        // nulo): não há papel/perfil/vínculos para conceder, então entra na fila
        // de aprovação, como antes.
        salvarUsuario(em, {
          nome: nome.trim(), telefone: telefone.trim() || undefined,
          papel: 'leitor',                       // provisório: sem acesso até aprovar
          status: 'aguardando_aprovacao',
          criadoEm: agora, criadoPor: em,
          aceiteLgpdEm: agora, aceiteTermosEm: agora,
          conviteId: token || undefined,
        });
        registrar('cadastro_solicitado', { alvo: em, detalhe: nome.trim() });
      }
      if (token) marcarConviteUsado(token, em);
      setPronto(true);
    } catch (err) {
      setErro(mensagemErroLogin(err));
    } finally { setEnviando(false); }
  }

  // ── Link inválido/expirado ──
  if (motivo) {
    return (
      <Moldura>
        <div className="flex items-start gap-2 rounded p-3" style={{ background: '#3a1a1a', border: '1px solid #7f1d1d' }}>
          <AlertTriangle size={16} className="mt-0.5 shrink-0" style={{ color: '#fca5a5' }} />
          <p className="text-sm" style={{ color: '#fca5a5' }}>{motivo}</p>
        </div>
      </Moldura>
    );
  }

  // ── Concluído ──
  if (pronto) {
    return (
      <Moldura>
        <div className="text-center space-y-3">
          <CheckCircle2 size={40} className="mx-auto" style={{ color: '#4ade80' }} />
          <p className="text-base font-bold" style={{ color: TXT }}>
            {liberado ? 'Acesso liberado!' : 'Cadastro enviado!'}
          </p>
          <p className="text-sm" style={{ color: SUB }}>
            {precisaConfirmar
              ? (liberado
                  ? 'Confirme seu e-mail pelo link que enviamos e depois é só entrar — seu acesso já está liberado.'
                  : 'Confirme seu e-mail pelo link que enviamos e aguarde a liberação do administrador.')
              : (liberado
                  ? 'Seu acesso já está liberado. Abra a plataforma e entre com o seu e-mail e senha.'
                  : 'Seu acesso está aguardando aprovação do administrador. Você será avisado quando for liberado.')}
          </p>
          <p className="text-xs" style={{ color: '#64748b' }}>Pode fechar esta página.</p>
        </div>
      </Moldura>
    );
  }

  // ── Formulário ──
  return (
    <Moldura>
      <form onSubmit={enviar} className="space-y-3">
        {conv?.multiuso && conv.rotulo && (
          <p className="rounded px-2.5 py-1.5 text-[11px]" style={{ background: '#0f2240', color: '#93c5fd', border: `1px solid ${BORDA}` }}>
            Convite para <b>{conv.rotulo}</b>
          </p>
        )}
        <div className="space-y-1">
          <label className="text-[11px] font-semibold" style={{ color: SUB }}>Nome completo *</label>
          <input className={inputCls} style={inputSt} value={nome} onChange={e => setNome(e.target.value)} autoComplete="name" />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-semibold" style={{ color: SUB }}>E-mail *</label>
          <input className={inputCls} style={inputSt} type="email" value={email}
            onChange={e => setEmail(e.target.value)} autoComplete="email"
            readOnly={!!conv?.email} />
          {conv?.email && <p className="text-[10px]" style={{ color: '#64748b' }}>E-mail do convite (não pode ser alterado).</p>}
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-semibold" style={{ color: SUB }}>Telefone</label>
          <input className={inputCls} style={inputSt} value={telefone} onChange={e => setTelefone(e.target.value)}
            placeholder="(00) 00000-0000" autoComplete="tel" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold" style={{ color: SUB }}>Crie sua senha *</label>
            <input className={inputCls} style={inputSt} type="password" value={senha}
              onChange={e => setSenha(e.target.value)} autoComplete="new-password" />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-semibold" style={{ color: SUB }}>Repita a senha *</label>
            <input className={inputCls} style={inputSt} type="password" value={senha2}
              onChange={e => setSenha2(e.target.value)} autoComplete="new-password" />
          </div>
        </div>
        {senhaCurta && <p className="text-[10px]" style={{ color: '#fbbf24' }}>A senha precisa ter ao menos 8 caracteres.</p>}
        {senhaDiferente && <p className="text-[10px]" style={{ color: '#fbbf24' }}>As senhas não são iguais.</p>}

        <label className="flex items-start gap-2 cursor-pointer">
          <input type="checkbox" checked={lgpd} onChange={e => setLgpd(e.target.checked)} className="mt-0.5" />
          <span className="text-[11px]" style={{ color: SUB }}>
            Autorizo o tratamento dos meus dados pessoais para uso da plataforma, conforme a LGPD.
          </span>
        </label>
        <label className="flex items-start gap-2 cursor-pointer">
          <input type="checkbox" checked={termos} onChange={e => setTermos(e.target.checked)} className="mt-0.5" />
          <span className="text-[11px]" style={{ color: SUB }}>Li e aceito os termos de uso da plataforma.</span>
        </label>

        {erro && (
          <div className="flex items-start gap-2 rounded p-2" style={{ background: '#3a1a1a', border: '1px solid #7f1d1d' }}>
            <AlertTriangle size={13} className="mt-0.5 shrink-0" style={{ color: '#fca5a5' }} />
            <p className="text-[11px]" style={{ color: '#fca5a5' }}>{erro}</p>
          </div>
        )}

        <button type="submit" disabled={!podeEnviar}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded text-sm font-bold text-white disabled:opacity-40"
          style={{ background: 'var(--invicta-green-dark)' }}>
          {enviando ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
          {enviando ? 'Enviando…' : 'Criar meu acesso'}
        </button>
        <p className="text-[10px] text-center" style={{ color: '#64748b' }}>
          {conv
            ? 'Seu acesso já vem liberado por este convite — é só criar a senha e entrar.'
            : 'Depois de enviar, seu acesso passa por aprovação do administrador.'}
        </p>
      </form>
    </Moldura>
  );
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 overflow-y-auto flex items-start justify-center px-4 py-8" style={{ background: AZUL }}>
      <div className="w-full max-w-sm rounded-xl p-5 space-y-4" style={{ background: CARD, border: `1px solid ${BORDA}` }}>
        <div className="text-center space-y-2">
          <Image src="/images/logo-colorida.png" alt="INVICTA" width={130} height={38} className="mx-auto" priority />
          <p className="text-xs" style={{ color: SUB }}>Plataforma Agronômica — criar acesso</p>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function ConvitePage() {
  return (
    <Suspense fallback={<Moldura><p className="text-xs text-center" style={{ color: SUB }}>Carregando…</p></Moldura>}>
      <ConviteConteudo />
    </Suspense>
  );
}
