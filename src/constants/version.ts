// DUAS versões, de propósito: a plataforma web e o app de campo têm ritmos
// diferentes e não devem arrastar um ao outro.

// PLATAFORMA (web, /painel e /portal). Muda a cada entrega — várias por semana.
// O histórico fica em src/constants/changelog.ts.
export const APP_VERSION = '2.144.0';

// APP DE CAMPO (INVICTA Coleta, o .aab/.ipa das lojas). Só muda quando o app de
// campo muda de verdade. Antes, ele herdava a APP_VERSION e ia parar nas lojas
// anunciando uma versão nova a cada mexida na plataforma — a 2.138.0 subiu sem
// uma linha alterada no app desde a 2.136.0.
//
// A numeração recomeçou em 3.0.0 para não conflitar com o que já foi enviado
// (o versionCode é maior*1.000.000 + menor*1.000 + correção, então 3.0.0 =
// 3.000.000 supera a 2.138.0 = 2.138.000 e as lojas seguem aceitando).
// Daqui em diante: 3.1.0, 3.2.0... e o primeiro número só sobe em mudança
// grande. Sempre TRÊS partes — os preflights não leem "3.0".
//
// Quem consome: scripts/preflight-android.mjs, scripts/preflight-ios.mjs,
// scripts/empacotar-android.mjs e as telas de /coleta.
export const APP_CAMPO_VERSION = '3.0.0';
