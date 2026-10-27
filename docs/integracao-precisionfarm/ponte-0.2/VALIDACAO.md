# Evidências e roteiro de aceite

## PrecisionFarm: validação controlada concluída
- Snapshots imutáveis e publicação idêntica sem duplicação.
- Publicações concorrentes com revisões sequenciais.
- Falha simulada na gravação do outbox reverte também a revisão.
- Bearer armazenado como hash; segredos HMAC e chave remota cifrados.
- HMAC válido, corpo alterado e timestamp vencido.
- event_id repetido e event_id conflitante.
- Reenvio após falha de rede simulada e recibo.
- Histórico do espelho e paginação por cursor.
- Inventário inclui evento para a carga inicial.
- Recurso de outra parceria invisível; troca de cliente suspende vínculo.
- Rotação/revogação de chave; exclusão gera archive.
- GeoTIFF em kg/ha, nodata e prévia sem normalização física.
- Inicialização, reinicialização e bloqueio de boot com migração inválida.
- Fluxo administrativo e largura do painel conferidos no navegador, inclusive 390 px.

## Teste conjunto pendente
Usar um talhão confirmado da Figueira. Validar inventário e carga nos dois sentidos; comparar limite, furos, unidade e nomes; publicar atualização de linha; testar limite pendente de aceite na Invicta; publicar nova zona; repetir evento; desligar a rede e recuperar pelo cursor; arquivar recurso; testar chave revogada e área fora do vínculo.

As capturas painel-demonstracao.png e painel-mobile-demonstracao.png usam dados artificiais e ilustram a interface implementada na PrecisionFarm.
