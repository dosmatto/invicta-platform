// Quanto de cada pixel do raster está DENTRO do talhão (0..1).
//
// Desde que o raster da dose passou a cobrir 100% do polígono, a célula da divisa
// entra inteira mesmo cobrindo só um pedaço de área útil — e é justo ali que a
// krigagem extrapola. Contá-la com peso cheio inflaria as faixas das pontas e
// mexeria na dose média (e, por tabela, na tonelagem e no custo do PDF), que é o
// que NÃO pode acontecer: a malha maior é uma decisão de desenho, não de conta.
//
// Aqui cada pixel pesa a fração dele que o contorno deixa passar. É a mesma coisa
// que o recorte faz no mapa, só que em número. O miolo (peso 1) e o lado de fora
// (peso 0) saem por point-in-polygon; só as ~centenas de células de borda pagam o
// recorte geométrico.
//
// Sem dependência de nuvem/React de propósito — coberto por `npm run teste:cobertura`.

type Pt = [number, number];

// Anéis com sinal: o externo SOMA área, o furo SUBTRAI. O talhão pode ter furo
// (represa, benfeitoria) e a área cadastrada já desconta — se a cobertura não
// descontasse, o furo receberia dose no plano de aplicação.
interface AnelSinal { anel: Pt[]; sinal: 1 | -1 }
function aneisComSinal(p: GeoJSON.Polygon | GeoJSON.MultiPolygon): AnelSinal[] {
  const poligonos = p.type === 'Polygon' ? [p.coordinates] : p.coordinates;
  const out: AnelSinal[] = [];
  for (const poli of poligonos) {
    poli.forEach((r, i) => out.push({
      anel: r.map(c => [c[0], c[1]] as Pt),
      sinal: i === 0 ? 1 : -1,
    }));
  }
  return out;
}

// Ponto dentro do polígono (ray casting; even-odd entre anéis externos).
function pip(x: number, y: number, ring: Pt[]): boolean {
  let dentro = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi)) dentro = !dentro;
  }
  return dentro;
}

// Sutherland–Hodgman: recorta o SUBJECT (anel do talhão, pode ser côncavo) pela
// janela CONVEXA (a célula, em CCW) → parte do talhão dentro da célula.
// Mesma rotina do shapefile de máquina (recomendacao/shapefile.ts), aqui isolada
// para a conta poder ser testada sem montar um SHP.
export function recortarPelaCelula(subject: Pt[], celulaCCW: Pt[]): Pt[] {
  const dentro = (p: Pt, a: Pt, b: Pt) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0;
  const cruz = (p1: Pt, p2: Pt, a: Pt, b: Pt): Pt => {
    const x1 = p1[0], y1 = p1[1], x2 = p2[0], y2 = p2[1], x3 = a[0], y3 = a[1], x4 = b[0], y4 = b[1];
    const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4) || 1e-12;
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
    return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
  };
  let out = subject;
  for (let i = 0; i < celulaCCW.length; i++) {
    const a = celulaCCW[i], b = celulaCCW[(i + 1) % celulaCCW.length];
    const inp = out; out = [];
    if (inp.length === 0) break;
    for (let j = 0; j < inp.length; j++) {
      const cur = inp[j], prev = inp[(j + inp.length - 1) % inp.length];
      const ci = dentro(cur, a, b), pi = dentro(prev, a, b);
      if (ci) { if (!pi) out.push(cruz(prev, cur, a, b)); out.push(cur); }
      else if (pi) out.push(cruz(prev, cur, a, b));
    }
  }
  return out;
}

const areaAnel = (r: Pt[]): number => {
  let s = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] * r[i][1]) - (r[i][0] * r[j][1]);
  return Math.abs(s) / 2;
};

/**
 * Peso (0..1) de cada pixel do grid, na ordem do próprio grid (norte no topo).
 *
 * `bounds` é [oeste, sul, leste, norte] — o retângulo sobre o qual o grid é
 * esticado. O nó do pixel é o CENTRO da célula, mesma convenção do backend.
 */
export function coberturaDoGrid(
  shape: [number, number],
  bounds: [number, number, number, number],
  poligono: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): Float32Array {
  const [rows, cols] = shape;
  const pesos = new Float32Array(rows * cols);
  const [w, s, e, n] = bounds;
  if (!(rows > 0 && cols > 0) || !(e > w) || !(n > s)) return pesos;

  // Passo entre nós — o nó é o CENTRO da célula (mesma convenção do backend, que
  // testa um quadrado de ±meio pixel em volta do nó). Com um nó só no eixo, a
  // célula ocupa o bounds inteiro.
  const dx = cols > 1 ? (e - w) / (cols - 1) : (e - w);
  const dy = rows > 1 ? (n - s) / (rows - 1) : (n - s);
  const areaCel = dx * dy;
  if (!(areaCel > 0)) return pesos;
  const aneis = aneisComSinal(poligono);
  const externos = aneis.filter(a => a.sinal === 1);
  const furos = aneis.filter(a => a.sinal === -1);

  for (let r = 0; r < rows; r++) {
    // linha 0 = norte (o grid vem invertido do backend p/ casar com a imagem)
    const cy = n - r * dy;
    for (let c = 0; c < cols; c++) {
      const cx = w + c * dx;
      const x0 = cx - dx / 2, x1 = cx + dx / 2;
      const y0 = cy - dy / 2, y1 = cy + dy / 2;
      // Atalho do miolo: um só anel externo, sem furos, com os 4 cantos dentro →
      // peso 1 sem recorte. Só a borda de fato paga o Sutherland–Hodgman.
      if (externos.length === 1 && furos.length === 0) {
        const a = externos[0].anel;
        if (pip(x0, y0, a) && pip(x1, y0, a) && pip(x1, y1, a) && pip(x0, y1, a)) {
          pesos[r * cols + c] = 1; continue;
        }
      }
      const celula: Pt[] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];   // CCW
      let dentro = 0;
      for (const { anel, sinal } of aneis) {
        const cl = recortarPelaCelula(anel, celula);
        if (cl.length >= 3) dentro += sinal * areaAnel(cl);
      }
      pesos[r * cols + c] = Math.max(0, Math.min(1, dentro / areaCel));
    }
  }
  return pesos;
}
