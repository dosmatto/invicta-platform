'use client';

// GPS contínuo do app de campo (posição/precisão/velocidade) — usado pela
// Amostragem e pela Medição.

import { useEffect, useState } from 'react';
import type { PosOperador } from './MapaColeta';

export function useGps() {
  const [userPos, setUserPos] = useState<PosOperador | null>(null);
  const [velKmH, setVelKmH] = useState<number | null>(null);
  const [gpsErro, setGpsErro] = useState('');

  useEffect(() => {
    if (!navigator.geolocation) { setGpsErro('GPS não disponível neste aparelho.'); return; }
    const id = navigator.geolocation.watchPosition(
      pos => {
        setGpsErro('');
        setUserPos({ lng: pos.coords.longitude, lat: pos.coords.latitude, acc: pos.coords.accuracy ?? 0 });
        setVelKmH(pos.coords.speed != null ? pos.coords.speed * 3.6 : null);
      },
      err => setGpsErro(err.code === 1 ? 'Permita o acesso à localização para navegar.' : 'Sem sinal de GPS.'),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  return { userPos, velKmH, gpsErro };
}
