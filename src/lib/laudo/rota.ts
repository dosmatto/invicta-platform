// Handler compartilhado por POST /api/v1/laudos e .../validar.
//
// As duas rotas percorrem EXATAMENTE o mesmo caminho e divergem numa linha (a
// gravação). É de propósito: se `/validar` tivesse um caminho próprio, ele
// aprovaria payload que a rota real recusa, e o laboratório descobriria isso na
// primeira remessa de verdade — que é justamente quando não dá para descobrir.

import { interpretarLaudo, type LaudoPayload } from './ingestao.ts';
import {
  autenticar, clienteServico, gravarLaudo, resolverRemessa, servicoConfigurado, variaveisAceitas,
} from './servidor.ts';

interface Opcoes { gravar: boolean }

const json = (corpo: unknown, status: number) =>
  new Response(JSON.stringify(corpo, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export async function tratarLaudo(req: Request, { gravar }: Opcoes): Promise<Response> {
  if (!servicoConfigurado()) {
    return json({ ok: false, erro: 'Serviço de ingestão não configurado neste ambiente.' }, 503);
  }

  let payload: LaudoPayload;
  try {
    payload = await req.json() as LaudoPayload;
  } catch {
    return json({ ok: false, erro: 'Corpo da requisição não é JSON válido.' }, 400);
  }

  const sb = clienteServico();
  const lab = await autenticar(sb, req.headers.get('authorization'));
  if (!lab) {
    return json({ ok: false, erro: 'Chave de API ausente, inválida ou revogada. Envie no cabeçalho Authorization: Bearer <chave>.' }, 401);
  }

  // 1ª passada: só formato. Sem a remessa resolvida ainda não dá para conferir a
  // numeração das amostras, e recusar por 404 antes de apontar erros de formato
  // faria o laboratório corrigir um problema por vez.
  const catalogo = await variaveisAceitas(sb, lab.empresaId);
  const previa = interpretarLaudo(payload, { variaveisValidas: catalogo });
  if (!previa.remessa) {
    return json({ ok: false, erros: previa.erros, avisos: previa.avisos }, 400);
  }
  const remessa = previa.remessa;   // já validado acima — a 2ª passada devolve o mesmo

  const res = await resolverRemessa(sb, remessa, lab);
  if (!res.ok) {
    const msg = {
      'nao-encontrada': `Remessa ${remessa} não encontrada. Use o código impresso na conferência que acompanhou as amostras.`,
      'ambigua': `Remessa ${remessa} está associada a mais de uma grade — não é possível decidir o talhão. Avise a INVICTA.`,
      'outra-empresa': `Remessa ${remessa} não pertence a esta chave de API.`,
    }[res.motivo];
    return json({ ok: false, erro: msg }, res.motivo === 'nao-encontrada' ? 404 : 409);
  }

  // 2ª passada, agora conferindo a numeração contra os pontos daquela grade.
  const laudo = interpretarLaudo(payload, {
    variaveisValidas: catalogo,
    numerosDaGrade: res.grade.numeros,
    profundidadesDaGrade: res.grade.profundidades.size ? res.grade.profundidades : undefined,
  });

  const corpoBase = {
    remessa: laudo.remessa,
    protocolo: laudo.protocolo,
    talhaoId: res.grade.talhaoId,
    safra: res.grade.safra,
    amostras: laudo.resultados.length,
    elementos: laudo.elementos,
    avisos: laudo.avisos,
  };

  if (laudo.erros.length) {
    // 422 quando o payload está bem formado e só a numeração não bate: o
    // conserto é do outro lado (etiqueta/planilha), não do código.
    const soGrade = laudo.erros.every(e => e.tipo === 'grade');
    return json({ ok: false, ...corpoBase, erros: laudo.erros }, soGrade ? 422 : 400);
  }

  if (!gravar) {
    return json({ ok: true, modo: 'validacao', gravado: false, ...corpoBase }, 200);
  }

  try {
    const { id, criado } = await gravarLaudo(sb, {
      grade: res.grade, lab,
      remessa, protocolo: laudo.protocolo, dataAnalise: laudo.dataAnalise,
      resultados: laudo.resultados, elementos: laudo.elementos,
    });
    // 201 laudo novo · 200 protocolo já conhecido (reenvio atualizou).
    return json({ ok: true, id, gravado: true, criado, ...corpoBase }, criado ? 201 : 200);
  } catch (e) {
    return json({ ok: false, erro: e instanceof Error ? e.message : 'Falha ao gravar o laudo.' }, 500);
  }
}
