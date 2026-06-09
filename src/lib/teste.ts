// Carrega um talhão-teste completo (IGEFI 07) a partir dos arquivos empacotados
// em public/teste/ — usando a MESMA rotina de import da plataforma. Idempotente:
// reaproveita cliente/fazenda/talhão por nome e recria grade + importação de lab.

import { parseGeoFile } from './geo';
import { lerArquivo, aplicarPerfil, PERFIS_BUILTIN } from './lab';
import { pontosDaFC, detectarCampoId, montarGradeImportada } from './importarGrade';
import {
  getClientes, saveCliente, getFazendas, saveFazenda, getTalhoes, saveTalhao, updateTalhao,
  getSafras, saveSafra, getGrades, saveGrade, deleteGrade, marcarParaProcessar,
  getImportacoesLab, saveImportacaoLab, deleteImportacaoLab,
} from './store';

const CLIENTE = 'Cliente Teste';
const FAZENDA = 'Fazenda Figueira (teste)';
const TALHAO = 'IGEFI 07';

async function fetchFile(url: string, nome: string): Promise<File> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Arquivo de teste não encontrado: ${url} (${r.status}). Veja public/teste/.`);
  return new File([await r.blob()], nome);
}

export interface TalhaoTeste {
  produtorId: string; produtor: string;
  fazendaId: string; fazenda: string;
  talhaoId: string; talhao: string;
  safra: string; area: number;
  geojson: GeoJSON.FeatureCollection; bbox: [number, number, number, number];
}

export async function carregarTalhaoTeste(): Promise<TalhaoTeste> {
  // safra ativa (cria se não houver)
  const safra = getSafras().find(s => s.ativa)
    ?? saveSafra({ nome: '25/26', anoInicio: 2025, anoFim: 2026, ativa: true });
  const safraNome = safra.nome;

  const [fAreas, fPontos, fLab] = await Promise.all([
    fetchFile('/teste/igefi07_areas.zip', 'areas.zip'),
    fetchFile('/teste/igefi07_amostragem.zip', 'amostragem.zip'),
    fetchFile('/teste/igefi07_lab.xlsx', 'lab.xlsx'),
  ]);

  // polígono do talhão
  const areas = await parseGeoFile(fAreas);
  const talhaoData = { geojson: JSON.stringify(areas.geojson), bbox: areas.bbox, areaHa: areas.areaHa };

  // cliente / fazenda / talhão (idempotente por nome)
  const cliente = getClientes().find(c => c.nome === CLIENTE)
    ?? saveCliente({ nome: CLIENTE, documento: '', tipoPessoa: 'PJ', telefone: '', email: '', cidade: 'Figueira', estado: 'PR' });
  const fazenda = getFazendas(cliente.id).find(f => f.nome === FAZENDA)
    ?? saveFazenda({ clienteId: cliente.id, nome: FAZENDA, municipio: 'Figueira', estado: 'PR' });
  let talhao = getTalhoes(fazenda.id).find(t => t.nome === TALHAO);
  if (talhao) updateTalhao(talhao.id, talhaoData);
  else talhao = saveTalhao({ fazendaId: fazenda.id, nome: TALHAO, status: 'ativo', ...talhaoData });
  const t = talhao!;

  // grade importada (limpa as anteriores deste talhão para não duplicar)
  getGrades(t.id).forEach(g => deleteGrade(g.id));
  const fcPontos = (await parseGeoFile(fPontos)).geojson;
  const { pontos } = pontosDaFC(fcPontos, detectarCampoId(fcPontos));
  const grade = saveGrade(montarGradeImportada({ talhaoId: t.id, safra: safraNome, nome: 'Grade IGEFI 07 (importada)', pontos }));
  marcarParaProcessar(grade.id);

  // laboratório (limpa importações anteriores deste talhão+safra)
  getImportacoesLab(t.id, safraNome).forEach(i => deleteImportacaoLab(i.id));
  const cfg = PERFIS_BUILTIN.find(p => p.id === 'fundacao-abc-planilha')!.config;
  const aoa = await lerArquivo(fLab);
  const { resultados } = aplicarPerfil(aoa, cfg);
  const elementos = [...new Set(resultados.flatMap(r => Object.keys(r.valores)))];
  saveImportacaoLab({ talhaoId: t.id, safra: safraNome, gradeId: grade.id, laboratorio: 'Fundação ABC (planilha)', resultados, elementos });

  return {
    produtorId: cliente.id, produtor: cliente.nome,
    fazendaId: fazenda.id, fazenda: fazenda.nome,
    talhaoId: t.id, talhao: t.nome,
    safra: safraNome, area: areas.areaHa,
    geojson: areas.geojson, bbox: areas.bbox,
  };
}
