// Handler compartilhado por POST /api/v1/programacao e .../validar.
//
// Mesmo desenho dos laudos (lib/laudo/rota.ts): as duas rotas percorrem o MESMO
// caminho e divergem numa linha — a gravação. Um /validar com caminho próprio
// aprovaria envio que a rota real recusa, e a Lavra só descobriria na safra.
//
// Ordem das respostas (docs/integracao-lavra.md):
//   503 serviço não configurado · 400 corpo não-JSON · 401 chave
//   422 formato/campos (todos os erros de uma vez; inclui atualizadoEm > agora+24 h
//       e limites de itens/zonas) · 404 talhão
//   409 zoneamento não liberado / trocado (devolve o liberado atual)
//   422 zonas faltando/inexistentes · 200 ok (criadas/atualizadas/…)

import {
  validarFormato, conferirLiberacao, validarZonas, planejarGravacao,
  type ProgramacaoPayload,
} from './nucleo.ts';
import {
  autenticarIntegracao, carregarExistentes, carregarTalhao, carregarZoneamento, clienteServico,
  gravarPrescricoes, servicoConfigurado,
} from './servidor.ts';

interface Opcoes { gravar: boolean }

const json = (corpo: unknown, status: number) =>
  new Response(JSON.stringify(corpo, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const MSG_LIBERACAO = {
  'nao-liberado': 'Este talhão não tem zoneamento liberado para programação. Peça ao agrônomo da AP para liberar uma versão (Talhão → Zonas → versões → "Liberar p/ Lavra").',
  'trocado': 'O zoneamento liberado deste talhão mudou. Recarregue as zonas do zoneamentoLiberadoId devolvido e programe de novo.',
  'outro-talhao': 'O zoneamento liberado não foi encontrado para este talhão. Peça ao agrônomo da AP para liberar a versão de novo.',
} as const;

export async function tratarProgramacao(req: Request, { gravar }: Opcoes): Promise<Response> {
  if (!servicoConfigurado()) {
    return json({ ok: false, erro: 'Serviço de integração não configurado neste ambiente.' }, 503);
  }

  let bruto: unknown;
  try {
    bruto = await req.json();
  } catch {
    return json({ ok: false, erro: 'Corpo da requisição não é JSON válido.' }, 400);
  }

  const sb = clienteServico();
  const chave = await autenticarIntegracao(sb, req.headers.get('authorization'));
  if (!chave) {
    return json({ ok: false, erro: 'Chave de API ausente, inválida ou revogada. Envie no cabeçalho Authorization: Bearer <chave>.' }, 401);
  }

  const { payload, erros } = validarFormato(bruto);
  if (!payload) return json({ ok: false, erros }, 422);
  const p: ProgramacaoPayload = payload;

  const talhao = await carregarTalhao(sb, p.talhaoId, chave);
  if (!talhao) return json({ ok: false, erro: `Talhão ${p.talhaoId} não encontrado.` }, 404);

  const zoneamento = await carregarZoneamento(sb, p.zoneamentoId);
  const lib = conferirLiberacao(p, talhao, zoneamento);
  if (!lib.ok) {
    return json({
      ok: false, codigo: lib.motivo, erro: MSG_LIBERACAO[lib.motivo],
      talhaoId: talhao.id, zoneamentoId: p.zoneamentoId, zoneamentoLiberadoId: lib.zoneamentoLiberadoId,
    }, 409);
  }

  const errosZona = validarZonas(p.prescricoes, zoneamento!.fc);
  if (errosZona.length) return json({ ok: false, talhaoId: talhao.id, zoneamentoId: p.zoneamentoId, erros: errosZona }, 422);

  const agora = new Date().toISOString();
  let plano;
  try {
    const existentes = await carregarExistentes(sb, p.origem.cultivoId, talhao);
    plano = planejarGravacao(p, { talhao, zoneamento: zoneamento!, existentes, agora });
  } catch (e) {
    return json({ ok: false, erro: e instanceof Error ? e.message : 'Falha ao ler as prescrições.' }, 500);
  }

  const corpo = {
    talhaoId: talhao.id,
    zoneamentoId: p.zoneamentoId,
    cultivoId: p.origem.cultivoId,
    prescricoes: plano.resultados,
    // Sempre presente (lista vazia quando não há o que avisar). Aviso não
    // impede a gravação — ver "avisos" em docs/integracao-lavra.md.
    avisos: plano.avisos,
  };

  if (!gravar) return json({ ok: true, modo: 'validacao', gravado: false, ...corpo }, 200);

  try {
    await gravarPrescricoes(sb, plano.gravar, agora);
  } catch (e) {
    return json({ ok: false, erro: e instanceof Error ? e.message : 'Falha ao gravar as prescrições.' }, 500);
  }
  return json({ ok: true, modo: 'gravacao', gravado: plano.gravar.length > 0, ...corpo }, 200);
}
