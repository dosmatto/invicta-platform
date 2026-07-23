'use client';

// Relatório de CONFERÊNCIA DO CADASTRO em Excel — pedido do usuário (23/07/2026):
// na safra atual, quais produtores/talhões estão cadastrados, a área de cada um
// e a SOMA por fazenda, por produtor e geral — para conferir duplicidades e
// áreas erradas. 4 abas:
//   1. Talhões      — linha a linha (produtor, fazenda, talhão, área, status,
//                     cultura na safra ativa) + coluna Alerta (nome repetido,
//                     órfão, área zerada) + total geral;
//   2. Por Fazenda  — nº de talhões e soma de área por fazenda + total;
//   3. Por Produtor — nº de fazendas/talhões e soma de área por produtor + total;
//   4. Problemas    — resumo da auditoria (ids repetidos, órfãos, duplicatas).
// Tudo dos dados LOCAIS já hidratados (mesma fonte dos KPIs do Início).

import { getClientes, getFazendas, getTalhoes, getSafras, getPlantio, auditoriaCadastro } from './store';

const r2 = (n: number) => Math.round(n * 100) / 100;
const norm = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

export async function gerarConferenciaExcel(): Promise<{ talhoes: number; arquivo: string }> {
  const XLSX = await import('xlsx');
  const safra = getSafras().find(s => s.ativa)?.nome ?? '—';
  const clientes = getClientes();
  const fazendas = getFazendas();
  const talhoes = getTalhoes();
  const fazPorId = new Map(fazendas.map(f => [f.id, f]));
  const cliPorId = new Map(clientes.map(c => [c.id, c]));

  // nomes repetidos de talhão DENTRO da mesma fazenda (indício de duplicidade)
  const porNomeFaz = new Map<string, number>();
  for (const t of talhoes) {
    const k = `${t.fazendaId}|${norm(t.nome)}`;
    porNomeFaz.set(k, (porNomeFaz.get(k) ?? 0) + 1);
  }

  type LinhaT = {
    Produtor: string; Fazenda: string; 'Talhão': string; 'Área (ha)': number;
    Status: string; 'Cultura (safra)': string; Alerta: string;
  };
  const linhas: LinhaT[] = talhoes.map(t => {
    const f = fazPorId.get(t.fazendaId);
    const c = f ? cliPorId.get(f.clienteId) : undefined;
    const alertas: string[] = [];
    if ((porNomeFaz.get(`${t.fazendaId}|${norm(t.nome)}`) ?? 0) > 1) alertas.push('NOME REPETIDO na fazenda');
    if (!f) alertas.push('SEM FAZENDA (órfão)');
    else if (!c) alertas.push('SEM PRODUTOR (fazenda órfã)');
    if (t.status !== 'incompleto' && !(t.areaHa > 0)) alertas.push('ÁREA ZERADA');
    return {
      Produtor: c?.nome ?? '(SEM PRODUTOR)',
      Fazenda: f?.nome ?? '(SEM FAZENDA)',
      'Talhão': t.nome,
      'Área (ha)': r2(t.areaHa || 0),
      Status: t.status === 'incompleto' ? 'Sem limite' : 'Ativo',
      'Cultura (safra)': getPlantio(t.id, safra) || '',
      Alerta: alertas.join(' · '),
    };
  }).sort((a, b) =>
    a.Produtor.localeCompare(b.Produtor, 'pt-BR') ||
    a.Fazenda.localeCompare(b.Fazenda, 'pt-BR') ||
    a['Talhão'].localeCompare(b['Talhão'], 'pt-BR'));

  const areaTotal = r2(linhas.reduce((s, l) => s + l['Área (ha)'], 0));

  // ── agregações ──
  type AgrF = { Produtor: string; Fazenda: string; 'Talhões': number; 'Área (ha)': number };
  const porFaz = new Map<string, AgrF>();
  for (const l of linhas) {
    const k = `${l.Produtor}|${l.Fazenda}`;
    const a = porFaz.get(k) ?? { Produtor: l.Produtor, Fazenda: l.Fazenda, 'Talhões': 0, 'Área (ha)': 0 };
    a['Talhões']++; a['Área (ha)'] = r2(a['Área (ha)'] + l['Área (ha)']);
    porFaz.set(k, a);
  }
  type AgrP = { Produtor: string; Fazendas: number; 'Talhões': number; 'Área (ha)': number };
  const porProd = new Map<string, AgrP>();
  for (const a of porFaz.values()) {
    const p = porProd.get(a.Produtor) ?? { Produtor: a.Produtor, Fazendas: 0, 'Talhões': 0, 'Área (ha)': 0 };
    p.Fazendas++; p['Talhões'] += a['Talhões']; p['Área (ha)'] = r2(p['Área (ha)'] + a['Área (ha)']);
    porProd.set(a.Produtor, p);
  }

  // ── aba Problemas (auditoria) ──
  const aud = auditoriaCadastro();
  const problemas: { Item: string; Valor: number | string }[] = [
    { Item: 'Safra verificada', Valor: safra },
    { Item: 'Produtores', Valor: aud.clientes },
    { Item: 'Fazendas', Valor: aud.fazendas },
    { Item: 'Talhões (total)', Valor: aud.talhoes },
    { Item: 'Talhões ativos', Valor: aud.talhoesAtivos },
    { Item: 'Talhões sem limite', Valor: aud.incompletos },
    { Item: 'Área total — todos (ha)', Valor: aud.areaTotalHa },
    { Item: 'Área — só ativos (ha)', Valor: aud.areaAtivosHa },
    { Item: 'IDs repetidos — produtores', Valor: aud.idsDuplicados.clientes.length },
    { Item: 'IDs repetidos — fazendas', Valor: aud.idsDuplicados.fazendas.length },
    { Item: 'IDs repetidos — talhões', Valor: aud.idsDuplicados.talhoes.length },
    { Item: 'Fazendas órfãs (sem produtor)', Valor: aud.orfaos.fazendasSemCliente },
    { Item: 'Talhões órfãos (sem fazenda)', Valor: aud.orfaos.talhoesSemFazenda },
    { Item: 'Produtores repetidos (doc/nome)', Valor: aud.duplicatasPorNome.clientes },
    { Item: 'Fazendas repetidas (nome no produtor)', Valor: aud.duplicatasPorNome.fazendas },
    { Item: 'Talhões repetidos (nome na fazenda)', Valor: aud.duplicatasPorNome.talhoes },
  ];

  // ── monta o workbook ──
  const wb = XLSX.utils.book_new();
  const wsT = XLSX.utils.json_to_sheet<object>([
    ...linhas,
    { Produtor: 'TOTAL GERAL', Fazenda: '', 'Talhão': `${linhas.length} talhões`, 'Área (ha)': areaTotal, Status: '', 'Cultura (safra)': '', Alerta: '' },
  ]);
  wsT['!cols'] = [{ wch: 32 }, { wch: 26 }, { wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 16 }, { wch: 34 }];
  XLSX.utils.book_append_sheet(wb, wsT, 'Talhões');

  const fazRows = [...porFaz.values()].sort((a, b) => a.Produtor.localeCompare(b.Produtor, 'pt-BR') || a.Fazenda.localeCompare(b.Fazenda, 'pt-BR'));
  const wsF = XLSX.utils.json_to_sheet<object>([
    ...fazRows,
    { Produtor: 'TOTAL GERAL', Fazenda: `${fazRows.length} fazendas`, 'Talhões': linhas.length, 'Área (ha)': areaTotal },
  ]);
  wsF['!cols'] = [{ wch: 32 }, { wch: 26 }, { wch: 9 }, { wch: 11 }];
  XLSX.utils.book_append_sheet(wb, wsF, 'Por Fazenda');

  const prodRows = [...porProd.values()].sort((a, b) => a.Produtor.localeCompare(b.Produtor, 'pt-BR'));
  const wsP = XLSX.utils.json_to_sheet<object>([
    ...prodRows,
    { Produtor: 'TOTAL GERAL', Fazendas: fazRows.length, 'Talhões': linhas.length, 'Área (ha)': areaTotal },
  ]);
  wsP['!cols'] = [{ wch: 32 }, { wch: 10 }, { wch: 9 }, { wch: 11 }];
  XLSX.utils.book_append_sheet(wb, wsP, 'Por Produtor');

  const wsA = XLSX.utils.json_to_sheet<object>(problemas);
  wsA['!cols'] = [{ wch: 38 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsA, 'Problemas');

  const arquivo = `Conferencia_Cadastro_Safra_${safra.replace(/[^\w-]+/g, '-')}.xlsx`;
  XLSX.writeFile(wb, arquivo);
  return { talhoes: linhas.length, arquivo };
}
