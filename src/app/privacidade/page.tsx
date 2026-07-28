import type { Metadata } from 'next';

// Página PÚBLICA de política de privacidade (/privacidade).
// Exigida pela Google Play (o app pede localização, câmera e faz login) e pela
// LGPD. O conteúdo descreve o que o app REALMENTE coleta — nada genérico.

export const metadata: Metadata = {
  title: 'Política de Privacidade — INVICTA',
  description: 'Como a INVICTA trata os dados pessoais na Plataforma Agronômica e no aplicativo INVICTA Coleta.',
};

const ATUALIZADO_EM = '28 de julho de 2026';
const CONTATO = 'contato@invicta.agr.br';

export default function PrivacidadePage() {
  return (
    <main style={{ background: '#061525', minHeight: '100vh', color: '#e2e8f0' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 20px 64px' }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 4 }}>Política de Privacidade</h1>
        <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 28 }}>
          Plataforma Agronômica INVICTA e aplicativo <strong>INVICTA Coleta</strong> ·
          Atualizada em {ATUALIZADO_EM}
        </p>

        <S titulo="1. Quem trata os seus dados">
          <p>
            Os dados são tratados pela <strong>INVICTA Consultoria em Agronegócio</strong>, responsável
            pela Plataforma Agronômica INVICTA e pelo aplicativo INVICTA Coleta (o “aplicativo”).
            Para qualquer assunto relacionado a esta política, fale conosco pelo e-mail{' '}
            <a href={`mailto:${CONTATO}`} style={{ color: '#93c5fd' }}>{CONTATO}</a>.
          </p>
        </S>

        <S titulo="2. Para que serve o aplicativo">
          <p>
            O aplicativo é uma <strong>ferramenta de trabalho</strong> usada por equipes de consultoria
            agronômica para coletar amostras de solo e fazer levantamentos em campo. Ele não é destinado
            ao público geral nem a menores de idade, e não exibe publicidade.
          </p>
        </S>

        <S titulo="3. Quais dados coletamos">
          <p>Coletamos apenas o necessário para o serviço funcionar:</p>
          <ul style={ulSt}>
            <li>
              <b>Cadastro e acesso:</b> nome, e-mail, telefone e o papel/permissões do usuário.
              A senha é gerenciada pelo provedor de autenticação e <b>nunca fica visível para nós</b>.
            </li>
            <li>
              <b>Localização precisa (GPS):</b> coletada <b>enquanto o aplicativo está em uso</b>, para
              guiar o operador até o ponto de amostragem, confirmar que a coleta ocorreu dentro do raio
              permitido e registrar a coordenada real do ponto. Não rastreamos a pessoa fora do trabalho
              nem usamos a localização para publicidade.
            </li>
            <li>
              <b>Fotos:</b> imagens tiradas pelo operador no ponto de coleta (amostra, paisagem, algum
              problema observado), quando ele decide anexá-las.
            </li>
            <li>
              <b>Registros de trabalho:</b> data e hora da coleta, ponto/grade, profundidades, observações,
              leituras de equipamentos e qual usuário executou a ação.
            </li>
            <li>
              <b>Registros de segurança (auditoria):</b> entradas no sistema e alterações de acesso
              (convite, aprovação, mudança de papel/permissão, bloqueio), para rastreabilidade.
            </li>
          </ul>
          <p style={{ marginTop: 10 }}>
            <b>Não coletamos</b> contatos, mensagens, histórico de navegação, dados bancários nem dados
            sensíveis (saúde, biometria, origem racial, opinião política, religião).
          </p>
        </S>

        <S titulo="4. Como usamos esses dados">
          <ul style={ulSt}>
            <li>Executar o serviço contratado: planejar a amostragem, navegar até os pontos e registrar as coletas.</li>
            <li>Gerar mapas, análises e relatórios agronômicos para o produtor responsável pela área.</li>
            <li>Controlar quem acessa o quê (permissões) e manter a trilha de auditoria.</li>
            <li>Corrigir falhas e melhorar o funcionamento do sistema.</li>
          </ul>
          <p style={{ marginTop: 10 }}>
            <b>Não vendemos seus dados</b> e não os usamos para publicidade ou perfilamento comercial.
          </p>
        </S>

        <S titulo="5. Onde os dados ficam">
          <p>
            Os dados ficam <b>no próprio aparelho</b> (para o aplicativo funcionar sem internet no campo) e
            são sincronizados com nosso banco de dados na nuvem quando há conexão. A infraestrutura de
            nuvem é fornecida pela <b>Supabase</b>, que atua como operadora e pode manter servidores fora
            do Brasil. O processamento de mapas ocorre em servidor próprio hospedado na <b>Render</b>.
          </p>
        </S>

        <S titulo="6. Com quem compartilhamos">
          <p>Compartilhamos dados apenas quando necessário e nas seguintes situações:</p>
          <ul style={ulSt}>
            <li>
              <b>Com o produtor/cliente</b> a quem a área pertence — ele vê os dados agronômicos das
              áreas dele.
            </li>
            <li>
              <b>Com fornecedores de tecnologia</b> que sustentam o serviço (nuvem e processamento),
              sempre limitados a essa finalidade.
            </li>
            <li>
              <b>Por obrigação legal</b> ou determinação de autoridade competente.
            </li>
          </ul>
        </S>

        <S titulo="7. Por quanto tempo guardamos">
          <p>
            Os dados agronômicos (coletas, laudos, mapas) são mantidos enquanto durar a relação com o
            cliente, porque formam o <b>histórico da área</b> — é justamente a comparação entre safras que
            dá valor ao trabalho. Dados de acesso e auditoria são mantidos pelo tempo necessário à
            segurança e ao cumprimento de obrigações legais. Encerrada a relação, os dados podem ser
            eliminados ou anonimizados mediante solicitação, ressalvadas as hipóteses de guarda
            obrigatória previstas em lei.
          </p>
        </S>

        <S titulo="8. Seus direitos (LGPD)">
          <p>
            Conforme a Lei nº 13.709/2018 (LGPD), você pode solicitar: confirmação de que tratamos seus
            dados; acesso aos dados; correção de dados incompletos ou desatualizados; anonimização,
            bloqueio ou eliminação de dados desnecessários; portabilidade; informação sobre
            compartilhamentos; e revogação do consentimento.
          </p>
          <p style={{ marginTop: 8 }}>
            Para exercer qualquer um desses direitos, escreva para{' '}
            <a href={`mailto:${CONTATO}`} style={{ color: '#93c5fd' }}>{CONTATO}</a>. Responderemos no
            prazo legal.
          </p>
        </S>

        <S titulo="9. Permissões do aplicativo">
          <ul style={ulSt}>
            <li><b>Localização:</b> navegar até o ponto e validar/registrar a coleta. Pode ser negada — o aplicativo abre, mas a coleta por GPS não funciona.</li>
            <li><b>Câmera:</b> fotografar o ponto de coleta. Opcional.</li>
            <li><b>Fotos/mídia:</b> anexar uma imagem já existente. Opcional.</li>
            <li><b>Rede:</b> sincronizar com a nuvem quando houver internet.</li>
          </ul>
          <p style={{ marginTop: 8 }}>
            Você pode revogar qualquer permissão a qualquer momento nas configurações do aparelho.
          </p>
        </S>

        <S titulo="10. Segurança">
          <p>
            O acesso exige login individual, com papéis e permissões por usuário, e as ações relevantes
            ficam registradas em auditoria. A comunicação com a nuvem é criptografada (HTTPS). Nenhum
            sistema é totalmente imune a incidentes; em caso de incidente relevante, comunicaremos os
            titulares e a ANPD conforme a legislação.
          </p>
        </S>

        <S titulo="11. Exclusão de conta e dados">
          <p>
            Para solicitar a exclusão da sua conta e dos dados pessoais associados, envie um pedido para{' '}
            <a href={`mailto:${CONTATO}`} style={{ color: '#93c5fd' }}>{CONTATO}</a> a partir do e-mail
            cadastrado. A conta de acesso é removida e os dados pessoais são eliminados ou anonimizados,
            preservados apenas os registros que a lei obrigue a manter.
          </p>
        </S>

        <S titulo="12. Alterações desta política">
          <p>
            Se esta política mudar, atualizaremos a data no topo desta página. Mudanças relevantes serão
            comunicadas aos usuários pelos canais habituais.
          </p>
        </S>

        <p style={{ color: '#64748b', fontSize: 12, marginTop: 32, borderTop: '1px solid #1a3a6b', paddingTop: 16 }}>
          INVICTA Consultoria em Agronegócio · {CONTATO}
        </p>
      </div>
    </main>
  );
}

const ulSt = { paddingLeft: 18, marginTop: 8, display: 'flex', flexDirection: 'column' as const, gap: 8 };

function S({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 26 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: '#93c5fd', marginBottom: 8 }}>{titulo}</h2>
      <div style={{ fontSize: 14, lineHeight: 1.65, color: '#cbd5e1' }}>{children}</div>
    </section>
  );
}
