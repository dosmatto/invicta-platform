// RECOMENDAÇÃO POR ZONA — um valor único por zona, não um mosaico de pixels.
//
// Quando a Fertilidade é processada em zona, cada atributo é CHAPADO: todo pixel
// de uma zona carrega o mesmo valor da amostra composta. A equação é aplicada
// pixel a pixel, então a dose sai chapada pela mesma razão. Ou seja: a dose de
// uma zona já é um número só — o raster de 20 m é só o meio de transporte.
//
// Este módulo extrai esse número de volta. Com ele a prescrição vira o que o
// campo espera de um mapa por zona: UM polígono por zona com UMA taxa, em vez de
// milhares de quadradinhos de 20 m que desenham a mesma coisa em escadinha.
//
// POR QUE MÉDIA e não "o valor do centroide":
//   • com o mapa chapado as duas dão exatamente o mesmo número (todas as células
//     da zona são iguais), então não se perde nada;
//   • a média não depende de UM ponto dar certo — centroide de zona côncava, ou
//     que caia numa célula de borda sem valor, devolveria NaN ou o valor errado;
//   • e se a dose NÃO estiver chapada (o usuário misturou um atributo interpolado
//     na equação), a média é o número honesto para a zona — e `chapada: false`
//     avisa quem chamou, em vez de fingir que era um valor só.
//
// A leitura índice→lon/lat é a MESMA do resto do pipeline da dose (cobertura.ts):
// linha 0 no NORTE e o nó no CENTRO da célula, com `bounds` na extensão dos NÓS.
//
// Módulo PURO e AUTOCONTIDO — sem import nenhum, como `cobertura.ts` e
// `faixas.ts`. É o que o deixa rodar no node cru: npm run teste:dosezona

type Pt = [number, number];

// Ponto dentro de um anel (ray casting) — a mesma conta de zonasGrid/cobertura.
function pip(x: number, y: number, ring: Pt[]): boolean {
  let dentro = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi)) dentro = !dentro;
  }
  return dentro;
}

// Dentro do polígono, contando FURO (anel interno) como fora.
function dentroGeom(geom: GeoJSON.Geometry, x: number, y: number): boolean {
  const polys: GeoJSON.Position[][][] =
    geom.type === 'Polygon' ? [geom.coordinates]
      : geom.type === 'MultiPolygon' ? geom.coordinates
        : [];
  for (const rings of polys) {
    let n = 0;
    for (const ring of rings) if (pip(x, y, ring as Pt[])) n++;
    if (n % 2 === 1) return true;
  }
  return false;
}

export interface ZonaGeom {
  /** identidade do polígono ("01", "01_2") */
  id: string;
  /** o número que o mapa mostra — zona de várias manchas repete o mesmo */
  rotulo: string;
  geometry: GeoJSON.Geometry;
}

export interface DoseDaZona {
  id: string;
  rotulo: string;
  geometry: GeoJSON.Geometry;
  /** a taxa da zona (NaN se nenhuma célula do mapa caiu dentro dela) */
  dose: number;
  /** quantas células entraram na conta */
  celulas: number;
  /** true = todas as células da zona tinham o MESMO valor (o esperado no modo
   *  zona). false = a dose varia dentro da zona — algum atributo da equação não
   *  era por zona, e `dose` virou uma média. */
  chapada: boolean;
}

export interface LeituraPorZona {
  zonas: DoseDaZona[];
  /** Células COM dose que caem dentro do TALHÃO mas fora de toda zona. É a área
   *  que a máquina cruzaria sem receber nada se o arquivo saísse por zona. Só é
   *  contada quando o polígono do talhão é informado. */
  celulasForaDeZona: number;
  /** Células com dose dentro do talhão (denominador da cobertura). */
  celulasNoTalhao: number;
}

/** Diferença relativa abaixo da qual dois valores são "o mesmo número". Float32
 *  não guarda o decimal exato, então comparar por igualdade estrita marcaria
 *  como não-chapada uma zona que é chapada. */
const EPS = 1e-6;

/**
 * A dose de cada zona, lida do grid da dose.
 *
 * Zona de VÁRIAS MANCHAS ("01" e "01_2") é UMA zona só: as manchas entram na
 * mesma conta e saem com uma taxa só — senão a prescrição mandaria taxas
 * diferentes para pedaços que o agrônomo tratou como a mesma zona.
 */
export function dosesDasZonas(
  zonas: ZonaGeom[],
  valores: Float32Array,
  shape: [number, number],
  bounds: [number, number, number, number],
  /** Contorno do talhão — sem ele não dá para saber se as zonas cobrem a área
   *  toda, e uma zona faltando passaria despercebida. */
  poligono?: GeoJSON.Geometry | null,
): LeituraPorZona {
  const [rows, cols] = shape;
  const [w, s, e, n] = bounds;
  // Agrupa as manchas pelo rótulo — a zona é a unidade da prescrição.
  const ordem: string[] = [];
  const porRotulo = new Map<string, ZonaGeom[]>();
  for (const z of zonas) {
    let g = porRotulo.get(z.rotulo);
    if (!g) { g = []; porRotulo.set(z.rotulo, g); ordem.push(z.rotulo); }
    g.push(z);
  }

  const vazio = (): LeituraPorZona => ({
    zonas: ordem.map(rot => {
      const g = porRotulo.get(rot)!;
      return { id: g[0].id, rotulo: rot, geometry: g[0].geometry, dose: NaN, celulas: 0, chapada: false };
    }),
    celulasForaDeZona: 0,
    celulasNoTalhao: 0,
  });
  if (!(rows > 0 && cols > 0) || !(e > w) || !(n > s)) return vazio();

  // nó = CENTRO da célula; linha 0 = norte (convenção de cobertura.ts)
  const dx = cols > 1 ? (e - w) / (cols - 1) : (e - w);
  const dy = rows > 1 ? (n - s) / (rows - 1) : (n - s);

  // Acumuladores por zona, preenchidos numa varredura ÚNICA do grid — assim a
  // conta de cobertura ("célula com dose dentro do talhão que não é de zona
  // nenhuma") sai de graça, na mesma passada.
  type Acc = { soma: number; cnt: number; primeiro: number; chapada: boolean };
  const acc = new Map<string, Acc>(ordem.map(r => [r, { soma: 0, cnt: 0, primeiro: NaN, chapada: true }]));
  let celulasNoTalhao = 0, celulasForaDeZona = 0;

  for (let r = 0; r < rows; r++) {
    const lat = n - r * dy;
    for (let c = 0; c < cols; c++) {
      const v = valores[r * cols + c];
      if (!isFinite(v)) continue;
      const lon = w + c * dx;
      let achou: string | null = null;
      for (const rot of ordem) {
        for (const m of porRotulo.get(rot)!) {
          if (dentroGeom(m.geometry, lon, lat)) { achou = rot; break; }
        }
        if (achou) break;
      }
      if (achou) {
        const a = acc.get(achou)!;
        if (a.cnt === 0) a.primeiro = v;
        else if (a.chapada && Math.abs(v - a.primeiro) > EPS * Math.max(1, Math.abs(a.primeiro))) a.chapada = false;
        a.soma += v; a.cnt++;
      }
      // Cobertura: só conta o que está DENTRO do talhão. O raster da dose
      // transborda a divisa de propósito (a coroa que cobre 100% do polígono),
      // e essa sobra não é buraco de zoneamento.
      if (poligono && dentroGeom(poligono, lon, lat)) {
        celulasNoTalhao++;
        if (!achou) celulasForaDeZona++;
      }
    }
  }

  const out: DoseDaZona[] = ordem.map(rot => {
    const manchas = porRotulo.get(rot)!;
    const a = acc.get(rot)!;
    return {
      id: manchas[0].id,
      rotulo: rot,
      geometry: manchas.length === 1
        ? manchas[0].geometry
        : { type: 'MultiPolygon', coordinates: manchas.flatMap(m => partesDe(m.geometry)) },
      // chapada → devolve o valor EXATO da zona (não a média, que o float
      // acumularia com erro); não chapada → a média honesta.
      dose: a.cnt === 0 ? NaN : (a.chapada ? a.primeiro : a.soma / a.cnt),
      celulas: a.cnt,
      // Zona SEM célula nenhuma não é "chapada": é zona sem dose. Marcar true
      // aqui fazia a checagem final aprovar um arquivo com a zona faltando — a
      // máquina cruzaria aquele pedaço aplicando nada.
      chapada: a.cnt > 0 && a.chapada,
    };
  });
  return { zonas: out, celulasForaDeZona, celulasNoTalhao };
}

/**
 * Junta as manchas de uma mesma zona numa entrada só (geometria = MultiPolygon).
 *
 * A zona é a unidade da amostragem composta: "01" e "01_2" são pedaços do mesmo
 * saco que foi ao laboratório, e por isso têm de receber o MESMO valor de laudo
 * e a MESMA taxa. Tratadas separadamente, cada mancha disputaria um número de
 * amostra no vínculo e a zona sairia com duas taxas diferentes — sem nada na
 * tela denunciando.
 */
export function agruparPorRotulo(zonas: ZonaGeom[]): ZonaGeom[] {
  const ordem: string[] = [];
  const porRotulo = new Map<string, ZonaGeom[]>();
  for (const z of zonas) {
    let g = porRotulo.get(z.rotulo);
    if (!g) { g = []; porRotulo.set(z.rotulo, g); ordem.push(z.rotulo); }
    g.push(z);
  }
  return ordem.map(rot => {
    const g = porRotulo.get(rot)!;
    return {
      id: g[0].id,
      rotulo: rot,
      geometry: g.length === 1
        ? g[0].geometry
        : { type: 'MultiPolygon', coordinates: g.flatMap(m => partesDe(m.geometry)) },
    };
  });
}

/** Anéis de um Polygon/MultiPolygon, no formato de partes de MultiPolygon. */
function partesDe(g: GeoJSON.Geometry): GeoJSON.Position[][][] {
  if (g.type === 'Polygon') return [g.coordinates];
  if (g.type === 'MultiPolygon') return g.coordinates;
  return [];
}

/** Fração da área do talhão que pode ficar fora do zoneamento sem reprovar o
 *  arquivo. Existe porque o polígono da zona quase nunca encosta com exatidão
 *  na divisa do talhão — sobra sempre uma franja de menos de uma célula. Acima
 *  disso é buraco de verdade, e a máquina passaria em branco. */
const TOLERANCIA_FORA = 0.02;

export type DecisaoPorZona =
  | { porZona: true; zonas: DoseDaZona[] }
  | { porZona: false; motivo: string };

/**
 * A recomendação DEVE sair como um valor por zona?
 *
 * Regra única, usada pela tela e pela exportação — se cada uma decidisse por
 * conta, o usuário veria zonas no mapa e receberia a grade no arquivo (ou o
 * contrário). Reprova por padrão: um arquivo que vai para o monitor do trator
 * só sai por zona quando TODAS as condições abaixo se confirmam.
 *
 * `metodosDosAtributos` são os `fontes[].metodo` da dose. É o sinal EXPLÍCITO
 * de que a fertilidade foi processada em zona — muito mais forte que deduzir
 * pelo mapa estar chapado. Uma dose interpolada pode sair uniforme sem ser por
 * zona: basta a equação saturar tudo no teto (`doseMaxima`) ou no piso
 * (`abaixoMinimo: 'minimo'`), ou não usar atributo nenhum. Nesses casos a taxa
 * até estaria certa, mas a ÁREA do arquivo passaria a ser a do zoneamento em
 * vez da do talhão — e entregaríamos uma aplicação de taxa fixa como se fosse
 * prescrição por zona.
 */
export function decidirPorZona(
  metodosDosAtributos: (string | undefined)[] | undefined,
  leitura: LeituraPorZona,
): DecisaoPorZona {
  const ms = metodosDosAtributos ?? [];
  if (ms.length === 0 || !ms.every(m => m === 'zona')) {
    return { porZona: false, motivo: 'a dose não veio de fertilidade processada por zona' };
  }
  const { zonas, celulasForaDeZona, celulasNoTalhao } = leitura;
  if (zonas.length === 0) return { porZona: false, motivo: 'o talhão não tem zoneamento' };

  const semDose = zonas.filter(z => !isFinite(z.dose));
  if (semDose.length) {
    return {
      porZona: false,
      motivo: `sem dose na${semDose.length > 1 ? 's' : ''} zona${semDose.length > 1 ? 's' : ''} `
        + `${semDose.map(z => z.rotulo).join(', ')} — o arquivo sairia com esse pedaço em branco`,
    };
  }
  const variando = zonas.filter(z => !z.chapada);
  if (variando.length) {
    return {
      porZona: false,
      motivo: `a dose varia dentro da${variando.length > 1 ? 's' : ''} zona${variando.length > 1 ? 's' : ''} `
        + `${variando.map(z => z.rotulo).join(', ')} — não há um valor único para prescrever`,
    };
  }
  if (celulasNoTalhao > 0) {
    const fora = celulasForaDeZona / celulasNoTalhao;
    if (fora > TOLERANCIA_FORA) {
      return {
        porZona: false,
        motivo: `o zoneamento cobre só ${Math.round((1 - fora) * 100)}% do talhão — `
          + 'a máquina cruzaria o resto sem aplicar nada',
      };
    }
  }
  return { porZona: true, zonas };
}
