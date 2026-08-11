'use client';

// Mantém a TELA LIGADA enquanto o app de campo estiver aberto (Screen Wake Lock).
//
// POR QUE: o operador anda com o celular na mão ou no bolso e o sistema apaga a
// tela pelo tempo dele. Com a tela apagada a WebView é congelada — os timers
// param e o GPS deixa de entregar posição —, então a GRAVAÇÃO DA CAMINHADA da
// Medição para no meio: ao voltar, o ponto seguinte liga em linha reta ao último
// antes de apagar, e a área/perímetro saem errados sem nenhum aviso.
//
// LIMITE: isto impede a tela de apagar SOZINHA. Se você apertar o botão de
// desligar, o sistema desliga mesmo e a medição para — medir de tela desligada
// exige serviço nativo em primeiro plano (outro trabalho).
//
// O lock é liberado pelo próprio navegador quando a página sai de vista (troca de
// app, ligação), por isso é PEDIDO DE NOVO no `visibilitychange`. Onde não houver
// suporte à API (`navigator.wakeLock` ausente), não faz nada.

import { useEffect } from 'react';

type Sentinela = { release: () => Promise<void> };
type NavComWakeLock = Navigator & {
  wakeLock?: { request: (tipo: 'screen') => Promise<Sentinela> };
};

export function useTelaLigada(ativo = true) {
  useEffect(() => {
    if (!ativo) return;
    let lock: Sentinela | null = null;
    let montado = true;

    const pedir = () => {
      (navigator as NavComWakeLock).wakeLock?.request('screen')
        .then(l => {
          // Se a tela já foi desmontada enquanto a promessa resolvia, solta na
          // hora — senão o lock ficaria pendurado até o app ser fechado.
          if (montado) lock = l; else void l.release().catch(() => {});
        })
        .catch(() => {});   // sem suporte, sem permissão ou página oculta: segue sem
    };
    pedir();

    const aoMudarVisibilidade = () => {
      if (document.visibilityState === 'visible') pedir();
    };
    document.addEventListener('visibilitychange', aoMudarVisibilidade);

    return () => {
      montado = false;
      document.removeEventListener('visibilitychange', aoMudarVisibilidade);
      void lock?.release().catch(() => {});
    };
  }, [ativo]);
}
