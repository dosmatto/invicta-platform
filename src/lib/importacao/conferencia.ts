// MOTOR DE CONFERÊNCIA — pega as linhas lidas da planilha mais o cadastro e
// monta o PLANO da importação: o que grava sozinho, o que precisa de
// confirmação, o que vira cadastro novo. Puro: sem DOM, sem I/O, sem store.
//
// Recebe o cadastro por parâmetro (e não importando `store.ts`) para continuar
// testável em node e para a tela poder recalcular o plano inteiro depois de cada
// decisão do usuário — são 68 ms nas 592 linhas contra o cadastro real, então
// recalcular tudo é mais simples e mais confiável do que remendar o plano.
//
// Este módulo NÃO grava nada e NÃO decide nada que possa estar errado. Ele
// classifica e explica; quem aperta o botão é o usuário.

import { chave } from './texto.ts';
import { casarProdutor, casarFazenda, type Casamento, type Acao, type Motivo } from './identidade.ts';
import { casarTalhao, classificarRepeticao, type CasamentoTalhao, type TipoRepeticao } from './casarTalhao.ts';
import { casarCatalogo, type ItemCatalogo } from './catalogo.ts';
import { casarCultura, type CulturaCasada } from './culturas.ts';
import { casarSafra, epocaDePlantio, type LinhaPlanilha } from './planilha.ts';

// ── o que o motor precisa saber do cadastro ────────────────────────────────
// Interfaces mínimas, não os tipos do store: o motor só usa nome e id, e depender
// de `Cliente`/`Fazenda`/`Talhao` inteiros arrastaria `store.ts` para dentro de
// um módulo que precisa rodar em node.

export interface RefCadastro { id: string; nome: string; sinonimos?: string[] }
export interface RefFazenda extends RefCadastro { clienteId: string }
export interface RefTalhao extends RefCadastro { fazendaId: string; areaHa?: number }
export interface RefCatalogo extends ItemCatalogo { id: string }

export interface Cadastro {
  clientes: RefCadastro[];
  fazendas: RefFazenda[];
  talhoes: RefTalhao[];
  /** Nomes das safras cadastradas ("26/27"). */
  safras: string[];
  culturas: string[];
  propositos: RefCatalogo[];
  cultivares: RefCatalogo[];
  /** `anoDaSafra` de `periodo.ts`, injetado para o módulo seguir puro. */
  anoDaSafra: (s: string) => number | null;
}

// ── resultado ──────────────────────────────────────────────────────────────

/** A pior ação manda: uma linha com produtor resolvido e talhão a criar é 'criar'. */
const PESO: Record<Acao, number> = { gravar: 0, confirmar: 1, partir: 2, criar: 3 };
const piorAcao = (as: Acao[]): Acao =>
  as.reduce((pior, a) => (PESO[a] > PESO[pior] ? a : pior), 'gravar' as Acao);

export interface LinhaConferida {
  origem: LinhaPlanilha;
  produtor: Casamento<RefCadastro>;
  fazenda: Casamento<RefFazenda>;
  talhao: CasamentoTalhao<RefTalhao>;
  cultura: CulturaCasada;
  proposito: Casamento<RefCatalogo>;
  cultivar: Casamento<RefCatalogo>;
  /** Safra cadastrada correspondente, ou '' se o ano não existe no cadastro. */
  safra: string;
  epoca: '' | 'verao' | 'safrinha' | 'inverno';
  /** Chave do grupo produtor+fazenda+talhão — linhas do mesmo talhão. */
  grupo: string;
  /** Só faz sentido quando o grupo tem mais de uma linha. */
  repeticao: TipoRepeticao | null;
  /** Posição dentro do grupo, para virar `Cultivo.ordem` no consórcio. */
  ordemNoGrupo: number;
  acao: Acao;
  /** Em português, o que impede de gravar. Vazio = pode gravar. */
  bloqueios: string[];
}

export interface PlanoImportacao {
  linhas: LinhaConferida[];
  resumo: Record<Acao, number> & { total: number };
  /**
   * O que resolver ANTES de abrir a tabela. Cada produtor ausente destrava, em
   * média, 6,6 linhas — e os maiores valem 30. Resolver 22 cadastros em bloco é
   * incomparavelmente mais rápido que 146 decisões linha a linha.
   */
  preVoo: {
    produtores: { nome: string; linhas: number }[];
    fazendas: { nome: string; produtor: string; linhas: number }[];
    talhoes: { nome: string; fazenda: string; linhas: number }[];
    cultivares: { nome: string; linhas: number }[];
    propositos: { nome: string; linhas: number }[];
    culturas: { nome: string; linhas: number }[];
    safrasAusentes: string[];
  };
}

const contar = (pares: { chave: string; rotulo: string; extra?: string }[]) => {
  const m = new Map<string, { rotulo: string; extra?: string; linhas: number }>();
  for (const p of pares) {
    const a = m.get(p.chave);
    if (a) a.linhas++;
    else m.set(p.chave, { rotulo: p.rotulo, extra: p.extra, linhas: 1 });
  }
  return [...m.values()].sort((a, b) => b.linhas - a.linhas);
};

/**
 * Monta o plano de importação.
 *
 * Memoiza produtor e fazenda por chave: a planilha de referência tem 592 linhas
 * e apenas 61 produtores distintos, então ~90% das chamadas repetiriam uma
 * comparação já feita contra o cadastro inteiro.
 */
export function conferirPlanilha(linhas: LinhaPlanilha[], cadastro: Cadastro): PlanoImportacao {
  const fazendasPorCliente = new Map<string, RefFazenda[]>();
  for (const f of cadastro.fazendas) {
    const l = fazendasPorCliente.get(f.clienteId) ?? [];
    l.push(f); fazendasPorCliente.set(f.clienteId, l);
  }
  const talhoesPorFazenda = new Map<string, RefTalhao[]>();
  for (const t of cadastro.talhoes) {
    const l = talhoesPorFazenda.get(t.fazendaId) ?? [];
    l.push(t); talhoesPorFazenda.set(t.fazendaId, l);
  }

  const sinonimosDe = (x: RefCadastro) => x.sinonimos;
  const cacheProdutor = new Map<string, Casamento<RefCadastro>>();
  const cacheFazenda = new Map<string, Casamento<RefFazenda>>();
  const cacheCultura = new Map<string, CulturaCasada>();
  const cacheProposito = new Map<string, Casamento<RefCatalogo>>();
  const cacheCultivar = new Map<string, Casamento<RefCatalogo>>();

  const conferidas: LinhaConferida[] = linhas.map(origem => {
    const kProd = chave(origem.produtor);
    let produtor = cacheProdutor.get(kProd);
    if (!produtor) {
      produtor = casarProdutor(origem.produtor, cadastro.clientes, x => x.nome, sinonimosDe);
      cacheProdutor.set(kProd, produtor);
    }

    const kFaz = `${kProd}|${chave(origem.fazenda)}`;
    let fazenda = cacheFazenda.get(kFaz);
    if (!fazenda) {
      fazenda = casarFazenda(
        origem.fazenda,
        produtor.alvo ? fazendasPorCliente.get(produtor.alvo.id) ?? [] : [],
        x => x.nome, sinonimosDe,
      );
      cacheFazenda.set(kFaz, fazenda);
    }

    // Talhão NÃO é memoizado: o mesmo nome em fazendas diferentes é outro
    // talhão, e a chave já embute a fazenda — o ganho não pagaria o risco.
    const talhao = casarTalhao(
      origem.talhao,
      fazenda.alvo ? talhoesPorFazenda.get(fazenda.alvo.id) ?? [] : [],
      x => x.nome, sinonimosDe,
    );

    const kCul = chave(origem.cultura);
    let cultura = cacheCultura.get(kCul);
    if (!cultura) { cultura = casarCultura(origem.cultura, cadastro.culturas); cacheCultura.set(kCul, cultura); }

    const kProp = chave(origem.proposito);
    let proposito = cacheProposito.get(kProp);
    if (!proposito) { proposito = casarCatalogo(origem.proposito, cadastro.propositos); cacheProposito.set(kProp, proposito); }

    const kCv = chave(origem.cultivar);
    let cultivar = cacheCultivar.get(kCv);
    if (!cultivar) { cultivar = casarCatalogo(origem.cultivar, cadastro.cultivares); cacheCultivar.set(kCv, cultivar); }

    const safra = casarSafra(origem.safra, cadastro.safras, cadastro.anoDaSafra);
    const epoca = epocaDePlantio(origem.dataRetirada);
    const grupo = `${kProd}|${chave(origem.fazenda)}|${talhao.analise.canonico}`;

    const bloqueios: string[] = [];
    if (!produtor.alvo) bloqueios.push('Produtor não está no cadastro.');
    else if (!fazenda.alvo) bloqueios.push('Fazenda não está no cadastro deste produtor.');
    else if (!talhao.alvo && talhao.motivo !== 'subdivisao' && talhao.motivo !== 'agregado') {
      bloqueios.push('Talhão não está no cadastro desta fazenda.');
    }
    if (!safra) bloqueios.push(`O ano "${origem.safra}" não está cadastrado.`);
    if (!cultura.cultura) bloqueios.push(`Cultura "${origem.cultura}" não foi reconhecida.`);
    if (origem.cultivar && !cultivar.alvo) bloqueios.push(`Cultivar "${origem.cultivar}" não está no cadastro.`);
    if (origem.proposito && !proposito.alvo) bloqueios.push(`Propósito "${origem.proposito}" não está no cadastro.`);

    const acao = piorAcao([
      produtor.acao, fazenda.acao, talhao.acao,
      cultura.automatico ? 'gravar' : (cultura.opcoes.length ? 'confirmar' : 'criar'),
      origem.proposito ? proposito.acao : 'gravar',
      origem.cultivar ? cultivar.acao : 'gravar',
      safra ? 'gravar' : 'criar',
    ]);

    return {
      origem, produtor, fazenda, talhao, cultura, proposito, cultivar,
      safra, epoca, grupo, repeticao: null, ordemNoGrupo: 1, acao, bloqueios,
    };
  });

  // ── grupos: duas linhas no mesmo talhão ──────────────────────────────────
  const porGrupo = new Map<string, LinhaConferida[]>();
  for (const l of conferidas) {
    const g = porGrupo.get(l.grupo) ?? [];
    g.push(l); porGrupo.set(l.grupo, g);
  }
  for (const g of porGrupo.values()) {
    if (g.length < 2) continue;
    const tipo = classificarRepeticao(g.map(l => ({
      areaHa: l.origem.areaHa, tipoPlantio: l.origem.tipoPlantio,
      cultura: l.origem.cultura, cultivar: l.origem.cultivar,
    })));
    g.forEach((l, i) => {
      l.repeticao = tipo;
      // Em consórcio a ordem distingue os registros na MESMA área; em partes e
      // em ambíguo cada linha vira o seu próprio cultivo e a ordem fica em 1.
      l.ordemNoGrupo = tipo === 'consorcio' ? i + 1 : 1;
      if (tipo === 'ambiguo') {
        l.bloqueios.push('Duas linhas neste talhão com tudo igual menos a área — é talhão partido ou lançamento repetido? Confirme.');
        l.acao = piorAcao([l.acao, 'confirmar']);
      }
      if (tipo === 'partes' && !l.origem.areaHa) {
        l.bloqueios.push('Talhão partido sem área nesta linha — não dá para saber o tamanho da parte.');
        l.acao = piorAcao([l.acao, 'confirmar']);
      }
    });
  }

  // ── pré-voo ──────────────────────────────────────────────────────────────
  const semProdutor = conferidas.filter(l => !l.produtor.alvo);
  const comProdutorSemFazenda = conferidas.filter(l => l.produtor.alvo && !l.fazenda.alvo);
  const semTalhao = conferidas.filter(l => l.fazenda.alvo && !l.talhao.alvo && l.talhao.acao === 'criar');

  const preVoo: PlanoImportacao['preVoo'] = {
    produtores: contar(semProdutor.map(l => ({ chave: chave(l.origem.produtor), rotulo: l.origem.produtor })))
      .map(x => ({ nome: x.rotulo, linhas: x.linhas })),
    fazendas: contar(comProdutorSemFazenda.map(l => ({
      chave: `${chave(l.origem.produtor)}|${chave(l.origem.fazenda)}`,
      rotulo: l.origem.fazenda, extra: l.produtor.alvo?.nome,
    }))).map(x => ({ nome: x.rotulo, produtor: x.extra ?? '', linhas: x.linhas })),
    talhoes: contar(semTalhao.map(l => ({
      chave: `${chave(l.origem.fazenda)}|${l.talhao.analise.canonico}`,
      rotulo: l.origem.talhao, extra: l.fazenda.alvo?.nome,
    }))).map(x => ({ nome: x.rotulo, fazenda: x.extra ?? '', linhas: x.linhas })),
    cultivares: contar(conferidas.filter(l => l.origem.cultivar && !l.cultivar.alvo)
      .map(l => ({ chave: chave(l.origem.cultivar), rotulo: l.origem.cultivar })))
      .map(x => ({ nome: x.rotulo, linhas: x.linhas })),
    propositos: contar(conferidas.filter(l => l.origem.proposito && !l.proposito.alvo)
      .map(l => ({ chave: chave(l.origem.proposito), rotulo: l.origem.proposito })))
      .map(x => ({ nome: x.rotulo, linhas: x.linhas })),
    culturas: contar(conferidas.filter(l => !l.cultura.cultura)
      .map(l => ({ chave: chave(l.origem.cultura), rotulo: l.origem.cultura })))
      .map(x => ({ nome: x.rotulo, linhas: x.linhas })),
    safrasAusentes: [...new Set(conferidas.filter(l => !l.safra).map(l => l.origem.safra))].filter(Boolean),
  };

  const resumo = { total: conferidas.length, gravar: 0, confirmar: 0, partir: 0, criar: 0 };
  for (const l of conferidas) resumo[l.acao]++;

  return { linhas: conferidas, resumo, preVoo };
}

/**
 * Aplica uma decisão do usuário a TODAS as linhas equivalentes.
 *
 * É o "aplicar aos outros N casos idênticos" do plano: resolver o produtor Morro
 * Chato uma vez vale por 30 linhas, e confirmar uma subdivisão vale pelas 22.
 * Devolve os índices afetados para a tela poder dizer quantas mudaram.
 */
export function linhasEquivalentes(
  plano: PlanoImportacao, indice: number, campo: 'produtor' | 'fazenda' | 'talhao' | 'cultivar' | 'proposito' | 'cultura',
): number[] {
  const alvo = plano.linhas[indice];
  if (!alvo) return [];
  const chaveDe = (l: LinhaConferida): string => {
    switch (campo) {
      case 'produtor': return l.produtor.chaveDecisao;
      // Fazenda e talhão só são "o mesmo caso" dentro do mesmo dono — nomes de
      // fazenda se repetem entre produtores (onze vezes na planilha real).
      case 'fazenda': return `${l.produtor.chaveDecisao}|${l.fazenda.chaveDecisao}`;
      case 'talhao': return `${l.produtor.chaveDecisao}|${l.fazenda.chaveDecisao}|${l.talhao.chaveDecisao}`;
      case 'cultivar': return chave(l.origem.cultivar);
      case 'proposito': return chave(l.origem.proposito);
      case 'cultura': return chave(l.origem.cultura);
    }
  };
  const k = chaveDe(alvo);
  return plano.linhas.map((l, i) => (chaveDe(l) === k ? i : -1)).filter(i => i >= 0);
}

/** Motivos em português, para a tela e para o relatório final. */
export const ROTULO_MOTIVO: Record<Motivo, string> = {
  exato: 'nome idêntico',
  sinonimo: 'apelido já confirmado antes',
  nucleo: 'mesmo nome, sem o tipo do imóvel',
  canonico: 'mesmo talhão, escrito diferente',
  contido: 'o nome do cadastro está contido no da planilha',
  tokens: 'mesmo nome, com abreviatura ou erro de digitação',
  truncado: 'nome cortado no campo da planilha',
  similar: 'parecido — confirme',
  subdivisao: 'parte de um talhão maior',
  agregado: 'uma linha para vários talhões',
  ambiguo: 'mais de um candidato igualmente bom',
  nenhum: 'não encontrado no cadastro',
};

export const ROTULO_ACAO: Record<Acao, string> = {
  gravar: 'Pronto',
  confirmar: 'Confirmar',
  partir: 'Partir',
  criar: 'Cadastrar',
};
