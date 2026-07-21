'use client';

// Backup PRÓPRIO dos dados — exporta TODO o espelho local (localStorage `inv_*`)
// num JSON datado e restaura de volta (no navegador atual E na nuvem).
//
// LIMITAÇÃO: os mapas de fertilidade PROCESSADOS (rasters em inv_mapas_fert)
// vivem SÓ na nuvem e NÃO entram neste backup — são DERIVADOS (podem ser
// reprocessados a partir dos dados primários). Os dados primários que os geram
// (inv_grades, inv_lab/laudos, inv_talhoes, inv_condutividade, inv_mde…) ENTRAM
// normalmente, então uma restauração permite reprocessar os mapas.

import { lerRawLocal, gravarRawLocal, gravarListaLocal, chavesPesadasEmMemoria } from './localComprimido';
import { cloudPushLista, cloudPushObj } from './cloud';
import { APP_VERSION } from '@/constants/version';

// Marcador de valor cru (string que NÃO é JSON válido) dentro do backup — para
// round-trip fiel: na restauração gravamos exatamente a string original.
interface RawMarker { __raw: string }

// Chaves POR-DISPOSITIVO / EFÊMERAS que NÃO entram no backup:
//  - inv_uid_local ...... id anônimo local (por aparelho; não faz sentido migrar)
//  - inv_login_offline .. VERIFICADOR de senha (PBKDF2 hash+salt) do login offline
//                         (auth.ts); segredo por-dispositivo — nunca sai daqui.
//  - inv_coleta_ultimo_sync . carimbo do último sync (efêmero, recalculado)
//  - inv_migrado_* ...... flags de migração idempotente (re-rodam sozinhas)
const EFEMERAS = new Set<string>([
  'inv_uid_local',
  'inv_login_offline',
  'inv_coleta_ultimo_sync',
]);
function ehEfemera(key: string): boolean {
  return EFEMERAS.has(key) || key.startsWith('inv_migrado_');
}

// Chaves das principais coleções usadas no resumo legível.
const COLECOES_RESUMO: Array<{ key: string; rotulo: string }> = [
  { key: 'inv_clientes',  rotulo: 'produtores' },
  { key: 'inv_fazendas',  rotulo: 'fazendas' },
  { key: 'inv_talhoes',   rotulo: 'talhões' },
  { key: 'inv_grades',    rotulo: 'grades' },
  { key: 'inv_lab',       rotulo: 'laudos' },
  { key: 'inv_medicoes',  rotulo: 'medições' },
];

// Data local AAAA-MM-DD (sem depender de fuso — usa os componentes locais).
function dataLocalISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function contarLista(chaves: Record<string, unknown>, key: string): number {
  const v = chaves[key];
  return Array.isArray(v) ? v.length : 0;
}

// ── Exportar ────────────────────────────────────────────────────────────────
export function exportarBackup(): { nomeArquivo: string; blob: Blob; resumo: string } {
  const chaves: Record<string, unknown> = {};

  if (typeof window !== 'undefined') {
    // Enumeração: localStorage + chaves PESADAS que migraram para o IndexedDB
    // (localStorage.key(i) não as enxerga mais; lerRawLocal lê da memória, que
    // pós-hidratação reflete o IndexedDB).
    const ks = new Set<string>(chavesPesadasEmMemoria());
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) ks.add(k);
    }
    for (const key of ks) {
      if (!key.startsWith('inv_') || ehEfemera(key)) continue;
      // lerRawLocal descomprime transparentemente as chaves @@LZ@@ legadas.
      const raw = lerRawLocal(key);
      if (raw == null) continue;
      try {
        chaves[key] = JSON.parse(raw);            // valor estruturado
      } catch {
        chaves[key] = { __raw: raw } as RawMarker; // string crua (não-JSON)
      }
    }
  }

  const backup = {
    formato: 'invicta-backup',
    versaoApp: APP_VERSION,
    geradoEm: new Date().toISOString(),
    chaves,
  };

  const nChaves = Object.keys(chaves).length;
  const partes = COLECOES_RESUMO
    .map(c => `${contarLista(chaves, c.key)} ${c.rotulo}`)
    .join(', ');
  const resumo = `${nChaves} chaves — ${partes}`;

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const nomeArquivo = `invicta-backup-${dataLocalISO()}.json`;
  return { nomeArquivo, blob, resumo };
}

// ── Restaurar ─────────────────────────────────────────────────────────────────
// Grava cada chave no espelho local e espelha as coleções de LISTA (e a config
// de etiqueta) na nuvem. NÃO recarrega a página — a UI faz o location.reload().
export function restaurarBackup(texto: string): { ok: boolean; erro?: string; resumo?: string } {
  let dados: unknown;
  try {
    dados = JSON.parse(texto);
  } catch {
    return { ok: false, erro: 'Arquivo inválido — não é um JSON legível.' };
  }

  const obj = dados as { formato?: unknown; chaves?: unknown };
  if (obj?.formato !== 'invicta-backup') {
    return { ok: false, erro: 'Arquivo não é um backup do Invicta (formato incompatível).' };
  }
  if (!obj.chaves || typeof obj.chaves !== 'object') {
    return { ok: false, erro: 'Backup sem dados (campo "chaves" ausente).' };
  }

  const chaves = obj.chaves as Record<string, unknown>;
  let n = 0;

  for (const [key, valor] of Object.entries(chaves)) {
    // 1) Marcador de string crua (não-JSON) → grava a string original.
    const marker = valor as RawMarker;
    if (valor && typeof valor === 'object' && !Array.isArray(valor)
        && typeof marker.__raw === 'string') {
      gravarRawLocal(key, marker.__raw);
      n++;
      continue;
    }

    // 2) Lista → grava como lista e espelha na nuvem (cloud ignora fora da whitelist).
    if (Array.isArray(valor)) {
      gravarListaLocal(key, valor);
      cloudPushLista(key, valor);
      n++;
      continue;
    }

    // 3) Objeto/string/número → re-serializa e grava cru.
    gravarRawLocal(key, JSON.stringify(valor));
    // Config de etiqueta é o único objeto-único sincronizado (KEYS_OBJ).
    if (key === 'inv_etiqueta_cfg') cloudPushObj(key, JSON.stringify(valor));
    n++;
  }

  return { ok: true, resumo: `${n} chaves restauradas` };
}
