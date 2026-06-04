import { LegendaNutriente, GRADIENTE_NORMAL, GRADIENTE_INVERTIDO } from '@/constants/agronomica';

interface LegendaBarProps {
  legenda: LegendaNutriente;
  size?: 'sm' | 'md' | 'lg';
}

const NOMES_CLASSES = ['Muito Baixo', 'Baixo', 'Médio', 'Alto', 'Muito Alto'];
const NOMES_CURTOS  = ['M. Baixo',   'Baixo', 'Médio', 'Alto', 'M. Alto'];

export function LegendaBar({ legenda, size = 'md' }: LegendaBarProps) {
  const { classes, invertido, unidade } = legenda;
  const gradiente = invertido ? GRADIENTE_INVERTIDO : GRADIENTE_NORMAL;

  const barH    = size === 'lg' ? 28 : size === 'md' ? 20 : 14;
  const fontSize = size === 'lg' ? 'text-xs' : 'text-[10px]';
  const nomesExibir = size === 'sm' ? NOMES_CURTOS : NOMES_CLASSES;

  // Posições horizontais dos limites: 5 classes = 4 pontos internos + borda esquerda + direita
  // Cada classe ocupa 20% da barra (visual fixo, independente dos valores)
  const positions = [0, 20, 40, 60, 80, 100]; // % na barra

  // Valores dos limites: min da primeira + max de cada classe
  const limitValues: string[] = [];
  if (classes[0].min !== null) {
    limitValues.push(String(classes[0].min));
  } else {
    // pega o max como referência para o início da barra
    limitValues.push('—');
  }
  classes.forEach(c => {
    limitValues.push(c.max !== null ? String(c.max) : '∞');
  });

  return (
    <div className="select-none">
      {/* Labels acima da barra */}
      <div className="relative flex mb-1" style={{ height: '18px' }}>
        {nomesExibir.map((nome, i) => (
          <div key={nome}
            className={`absolute flex flex-col items-center ${fontSize} font-semibold`}
            style={{
              left: `${positions[i] + 10}%`,
              transform: 'translateX(-50%)',
              color: '#e2e8f0',
              whiteSpace: 'nowrap',
            }}>
            {nome}
          </div>
        ))}
      </div>

      {/* Indicadores de classe acima */}
      <div className="relative flex mb-0.5" style={{ height: '6px' }}>
        {positions.slice(1, 5).map((pos, i) => (
          <div key={i} className="absolute flex flex-col items-center"
            style={{ left: `${pos}%`, transform: 'translateX(-50%)' }}>
            <div style={{ width: '1px', height: '6px', background: 'rgba(255,255,255,0.5)' }} />
          </div>
        ))}
      </div>

      {/* Barra de cor */}
      <div className="relative w-full rounded overflow-hidden"
        style={{ height: `${barH}px`, background: gradiente }}>
        {/* Linhas divisórias entre classes */}
        {positions.slice(1, 5).map((pos, i) => (
          <div key={i} className="absolute top-0 bottom-0"
            style={{ left: `${pos}%`, width: '1px', background: 'rgba(255,255,255,0.4)' }} />
        ))}
      </div>

      {/* Valores abaixo da barra */}
      <div className="relative" style={{ height: '20px' }}>
        {positions.map((pos, i) => (
          <div key={i}
            className={`absolute ${fontSize} font-mono font-bold`}
            style={{
              left: `${pos}%`,
              transform: i === 0 ? 'translateX(0)' : i === positions.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)',
              top: '2px',
              color: '#94a3b8',
              whiteSpace: 'nowrap',
            }}>
            {limitValues[i]}
          </div>
        ))}
        {/* Unidade */}
        <div className={`absolute right-0 top-2 ${fontSize}`} style={{ color: '#64748b' }}>
          {unidade}
        </div>
      </div>
    </div>
  );
}
