# Backlog — ideias registradas, ainda não implementadas

Este arquivo guarda o que foi **pedido mas ainda não entregue**. Quando um item
sai daqui e vira código, ele some deste arquivo e entra no `PENDENCIAS.md` com o
número, o título e a versão — ver o padrão de registro descrito lá.

**O número é do usuário.** Item que chegou em texto livre fica sem número aqui
também; não inventar o próximo da lista.

---

## S/N — Composição de mapas de colheita para delimitar padrões produtivos

**Registrado em:** 15/09/2026
**Origem:** pedido do usuário, em texto livre, sem número.

### O pedido

Compor mapas de colheita (múltiplas safras) para delimitar padrões produtivos do
talhão — ou seja, sair do mapa de uma safra e chegar no comportamento que se
repete ao longo dos anos.

**Método de padronização definido pelo usuário: Score Z (z-score).** Cada safra
é padronizada contra a sua própria média e desvio antes de entrar na composição,
o que torna anos de potencial diferente comparáveis entre si:

```
z = (produtividade_do_ponto − média_da_safra) / desvio_padrão_da_safra
```

Assim o que a composição enxerga é a posição relativa de cada ponto dentro do
talhão naquele ano, não o valor absoluto em sacas.

### O que já existe e conversa com isso

- **Pendência 42 (v2.154.0)** — "Mapa de colheita entra como camada nas Zonas de
  Manejo". Hoje o mapa de colheita já entra como camada no gerador de zonas por
  similaridade, mas **um mapa por vez**: Talhão → Zonas → Gerar zonas por
  similaridade → "Camadas a usar" → botões "Produtividade `<cultura>` `<ano>`".
  Esta ideia é a evolução: compor a série, não escolher um ano.
- **Pendência 24 (v2.101.0)** — "Composição temporal" do NDVI, com contraste e
  download em GeoTIFF. É o precedente mais próximo de como a plataforma já faz
  composição de várias camadas ao longo do tempo; vale olhar antes de desenhar a
  de colheita, para a interface não ficar com duas gramáticas diferentes para a
  mesma ideia.
- **Pendência 37 (v2.143.0)** — "Correção local entre colhedoras (por raio)", em
  Talhão → Produtividade → Unificação. Trata da normalização entre máquinas
  dentro de uma safra; a composição multi-safra provavelmente depende de uma
  normalização análoga **entre safras**.
- **MEAP** (`13.00_DOC_CONCEITUAL_MEAP.md` e FS partes 01–04) — o motor de zonas
  por similaridade onde o resultado desta composição deve desaguar.

### Decisões que ficam em aberto

A padronização já está decidida (Score Z, acima). Estas continuam abertas — não
decidir por conta própria quando for implementar:

1. **Culturas diferentes entram juntas?** Soja e milho no mesmo talhão em anos
   alternados. O z-score torna as safras comparáveis em escala, mas não responde
   se faz sentido agronômico misturar culturas na mesma composição, ou se deve
   haver uma composição por cultura.
2. **O que a composição entrega?** A média dos z-scores (onde o talhão é
   consistentemente melhor ou pior), a estabilidade (desvio dos z-scores ao
   longo dos anos, separando "sempre bom", "sempre ruim" e "instável"), ou as
   duas saídas como camadas distintas.
3. **Mínimo de safras** para a composição fazer sentido — com duas safras o
   desvio é frágil.
4. **Malha comum** — os mapas de colheita de anos diferentes não têm os mesmos
   pontos. Definir sobre qual grade os z-scores são somados (grade fixa,
   interpolação prévia, células da amostragem composta da pendência 41).
5. **Onde aparece na tela** — aba Produtividade (ao lado de Unificação) ou
   direto como camada composta no gerador de zonas.

### Escopo

Apenas registrado. Nada implementado, nada decidido.
