import type { Metadata } from 'next';

// Página PÚBLICA de suporte (/suporte).
//
// Existe porque a App Store EXIGE uma "URL de suporte" para publicar, e recusa
// `mailto:` — tem que ser uma página acessível a qualquer pessoa, sem login. A
// Play Store pede o mesmo em "E-mail de contato", e aponta para cá.
//
// O conteúdo é deliberadamente concreto: o revisor da loja abre esta página para
// confirmar que existe um canal de atendimento de verdade, e o operador em campo
// abre para resolver um problema. Página genérica de "fale conosco" não serve
// para nenhum dos dois.
//
// Espelha a estrutura de /privacidade (mesmo componente S, mesmas cores).

export const metadata: Metadata = {
  title: 'Suporte — INVICTA Coleta',
  description: 'Canais de atendimento e ajuda para o aplicativo INVICTA Coleta e a Plataforma Agronômica INVICTA.',
};

const CONTATO = 'invicta@invicta.agr.br';
const TELEFONE = '+55 (42) 99126-0122';
const TELEFONE_LINK = '+554299126012';
const ENDERECO = 'Avenida dos Pioneiros, 398 — Carambeí/PR — 84145-000';

export default function SuportePage() {
  return (
    <main style={{ background: '#061525', minHeight: '100vh', color: '#e2e8f0' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 20px 64px' }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 4 }}>Suporte</h1>
        <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 28 }}>
          Aplicativo <strong>INVICTA Coleta</strong> e Plataforma Agronômica INVICTA
        </p>

        <S titulo="Fale com a gente">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p>
              <b>E-mail:</b>{' '}
              <a href={`mailto:${CONTATO}`} style={link}>{CONTATO}</a>
            </p>
            <p>
              <b>Telefone / WhatsApp:</b>{' '}
              <a href={`tel:${TELEFONE_LINK}`} style={link}>{TELEFONE}</a>
            </p>
            <p><b>Endereço:</b> {ENDERECO}</p>
            <p style={{ color: '#94a3b8' }}>Atendimento em dias úteis.</p>
          </div>
        </S>

        <S titulo="Não consigo entrar no aplicativo">
          <p>
            O INVICTA Coleta é uma ferramenta de trabalho e <b>não permite criar conta</b>. O acesso é
            liberado pela empresa que contratou a plataforma. Se o login não funciona:
          </p>
          <ul style={ulSt}>
            <li>Confirme com o responsável da sua empresa se o seu usuário já foi aprovado.</li>
            <li>
              Confira se o e-mail digitado é exatamente o que foi cadastrado — sem espaço no início ou no fim.
            </li>
            <li>
              Se você já entrou neste aparelho antes, o mesmo e-mail e senha funcionam <b>sem internet</b>.
            </li>
          </ul>
        </S>

        <S titulo="O botão de coletar não habilita">
          <p>
            A coleta só é liberada quando você está fisicamente <b>dentro do raio do ponto planejado</b> —
            é o que impede uma amostra de ser registrada no lugar errado. A tela mostra a distância que
            falta até o ponto.
          </p>
          <p style={{ marginTop: 8 }}>
            Em lavoura aberta o padrão de 15 metros costuma bastar. Sob mata fechada, dentro de um galpão
            ou de um veículo, o sinal do GPS piora e a distância medida fica imprecisa: nesse caso, ajuste
            o <b>raio permitido</b> em Configurações (engrenagem), de 5 a 50 metros.
          </p>
        </S>

        <S titulo="Trabalhar sem sinal de celular">
          <p>
            O aplicativo funciona offline. Antes de sair, ainda no Wi-Fi, baixe as imagens de satélite da
            área pelo botão de download da tela de coleta. Em campo, tudo é gravado no próprio aparelho.
          </p>
          <p style={{ marginTop: 8 }}>
            Quando a conexão voltar, as coletas, fotos e medições sobem sozinhas. O selo no topo da tela
            mostra o que ainda está pendente de sincronizar — <b>não desinstale o aplicativo com pendências</b>,
            porque os registros ainda não enviados ficam apenas no aparelho.
          </p>
        </S>

        <S titulo="Privacidade e exclusão de dados">
          <p>
            O que o aplicativo coleta e por quê está descrito na{' '}
            <a href="/privacidade" style={link}>Política de Privacidade</a>.
          </p>
          <p style={{ marginTop: 8 }}>
            Para pedir a exclusão da sua conta e dos dados pessoais associados, escreva para{' '}
            <a href={`mailto:${CONTATO}`} style={link}>{CONTATO}</a> a partir do e-mail cadastrado.
          </p>
        </S>

        <p style={{ color: '#64748b', fontSize: 12, marginTop: 32, borderTop: '1px solid #1a3a6b', paddingTop: 16 }}>
          WR Consultoria Agrícola SS · CNPJ 10.508.846/0001-90 · {CONTATO}
        </p>
      </div>
    </main>
  );
}

const link = { color: '#93c5fd' };
const ulSt = { paddingLeft: 18, marginTop: 8, display: 'flex', flexDirection: 'column' as const, gap: 8 };

function S({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 26 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: '#93c5fd', marginBottom: 8 }}>{titulo}</h2>
      <div style={{ fontSize: 14, lineHeight: 1.65, color: '#cbd5e1' }}>{children}</div>
    </section>
  );
}
