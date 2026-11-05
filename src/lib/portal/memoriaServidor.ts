// Limitador de taxa e cache LRU do benchmark — vivem na MEMÓRIA da instância do
// servidor (cada instância serverless tem os seus: o limite não é global, só
// impede que UM usuário faça a mesma instância varrer a base sem parar).
//
// Puro: o relógio e a carga entram por parâmetro, para o teste em node
// (scripts/teste-portal-benchmark.mjs). Quem usa: lib/portal/benchmarkServidor.

// ── Limite de pedidos por usuário (janela deslizante) ───────────────────────

export type ResultadoLimite = { ok: true } | { ok: false; esperarMs: number };

export interface Limitador {
  /** Conta o pedido de `chave` em `agora` (ms) e diz se ele pode seguir.
   *  Pedido recusado NÃO conta: quem insiste volta assim que a janela anda. */
  permitir(chave: string, agora: number): ResultadoLimite;
  /** Quantas chaves estão guardadas (para o teste do teto de memória). */
  tamanho(): number;
}

/** `max` pedidos por `janelaMs` para cada chave. `maxChaves` limita a memória:
 *  passando dele, sai a chave usada há mais tempo. */
export function criarLimitador(o: { max: number; janelaMs: number; maxChaves?: number }): Limitador {
  const maxChaves = o.maxChaves ?? 5000;
  // Instantes dos pedidos aceitos dentro da janela (mais antigo primeiro). O Map
  // fica na ordem de uso: cada pedido reinsere a chave no fim.
  const pedidos = new Map<string, number[]>();
  return {
    permitir(chave, agora) {
      const desde = agora - o.janelaMs;
      const lista = (pedidos.get(chave) ?? []).filter(t => t > desde);
      pedidos.delete(chave);
      if (lista.length >= o.max) {
        pedidos.set(chave, lista);
        return { ok: false, esperarMs: Math.max(1, lista[0] + o.janelaMs - agora) };
      }
      lista.push(agora);
      pedidos.set(chave, lista);
      while (pedidos.size > maxChaves) pedidos.delete(pedidos.keys().next().value as string);
      return { ok: true };
    },
    tamanho: () => pedidos.size,
  };
}

// ── Cache LRU com carga única por chave ─────────────────────────────────────

export interface CacheComCarga<K, V> {
  /** Valor de `chave`: do cache se fresco (e ele vira o mais recente); senão
   *  `carregar()` — pedidos simultâneos da mesma chave esperam a MESMA carga.
   *  Falha não fica presa: o próximo pedido tenta de novo. */
  obter(chave: K, carregar: () => Promise<V>): Promise<V>;
  /** Chaves prontas, da usada há mais tempo para a mais recente. */
  chaves(): K[];
}

/** `max` valores prontos (o usado há mais tempo sai primeiro), cada um válido
 *  por `ttlMs`. `agora` é o relógio (ms). */
export function criarCacheLru<K, V>(o: { max: number; ttlMs: number; agora?: () => number }): CacheComCarga<K, V> {
  const agora = o.agora ?? Date.now;
  const prontos = new Map<K, { em: number; valor: V }>();
  const carregando = new Map<K, Promise<V>>();
  return {
    obter(chave, carregar) {
      const c = prontos.get(chave);
      if (c && agora() - c.em <= o.ttlMs) {
        prontos.delete(chave); prontos.set(chave, c);   // LRU: vai para o fim (mais recente)
        return Promise.resolve(c.valor);
      }
      let p = carregando.get(chave);
      if (!p) {
        p = Promise.resolve()
          .then(carregar)
          .then(valor => {
            prontos.delete(chave);
            prontos.set(chave, { em: agora(), valor });
            while (prontos.size > o.max) prontos.delete(prontos.keys().next().value as K);
            return valor;
          })
          .finally(() => carregando.delete(chave));
        carregando.set(chave, p);
      }
      return p;
    },
    chaves: () => [...prontos.keys()],
  };
}
