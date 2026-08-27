'use client';

// ABRIR UM PDF GERADO NA HORA, COM NOME DE ARQUIVO.
//
// Todos os relatórios abriam o PDF com `aba.location.href = blobURL`. O
// navegador então nomeia o arquivo pela ÚLTIMA PARTE DA URL — e a URL de um blob
// é um UUID. Resultado: a caixa "Salvar como" vinha com
// `736c4637-3320-4ecd-87a9-616fe58ad162` e o usuário digitava o nome à mão, toda
// vez, em todo relatório.
//
// Aqui a aba passa a ser uma página NOSSA: título com o nome do arquivo, o PDF
// embutido em tela cheia e um botão "Salvar" com o atributo `download`. Quem tem
// "perguntar onde salvar" ligado recebe a caixa JÁ PREENCHIDA; quem não tem,
// baixa direto com o nome certo.
//
// Detalhe que evita um bug antigo: o object URL é criado no contexto DA ABA
// (`aba.URL`), não no da aplicação. Antes ele era revogado 60 s depois — quem
// lesse o relatório com calma e só então clicasse em salvar recebia um arquivo
// quebrado. Agora a vida do URL é a da aba que o usa.

const escapar = (s: string) => s.replace(/[<>&"']/g, c =>
  ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Garante a extensão sem duplicar quando o chamador já mandou com ela. */
export function comExtensao(nome: string, ext = '.pdf'): string {
  const limpo = (nome || 'relatorio').trim();
  return limpo.toLowerCase().endsWith(ext) ? limpo : limpo + ext;
}

/** Baixa direto (sem aba), com o nome pedido. */
export function baixarComNome(blob: Blob, nome: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = comExtensao(nome);
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Mostra o PDF na aba já aberta (as abas são abertas ANTES do await, senão o
 * navegador bloqueia o popup). Sem aba — popup bloqueado —, baixa direto.
 */
export function abrirPdfNaAba(aba: Window | null, blob: Blob, nome: string): void {
  const arquivo = comExtensao(nome);
  if (!aba || aba.closed) { baixarComNome(blob, arquivo); return; }
  try {
    // Object URL no contexto da ABA: some junto com ela, sem prazo de validade.
    // `Window` no lib.dom não declara URL; em runtime a aba same-origin tem.
    const urlDaAba = (aba as unknown as { URL?: typeof URL }).URL ?? URL;
    const url = urlDaAba.createObjectURL(blob);
    const n = escapar(arquivo);
    aba.document.open();
    aba.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>${n}</title>
<style>
  :root { color-scheme: dark; }
  html, body { margin: 0; height: 100%; background: #0b1220; font-family: system-ui, -apple-system, sans-serif; }
  .barra { display: flex; align-items: center; gap: 12px; padding: 8px 12px; background: #0d2140; border-bottom: 1px solid #1a3a6b; }
  .nome { flex: 1; min-width: 0; color: #e2e8f0; font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .btn { flex-shrink: 0; display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; border-radius: 8px;
         background: #1f5a1a; color: #fff; font-size: 12.5px; font-weight: 700; text-decoration: none; }
  .btn:hover { background: #267021; }
  .dica { flex-shrink: 0; color: #64748b; font-size: 11px; }
  embed { display: block; width: 100%; height: calc(100% - 41px); border: 0; }
  /* Janela estreita: a dica some antes do NOME, que é o que importa. */
  @media (max-width: 620px) { .dica { display: none; } }
</style></head><body>
<div class="barra">
  <span class="nome">${n}</span>
  <span class="dica">o nome já vai preenchido</span>
  <a class="btn" href="${url}" download="${n}">Salvar PDF</a>
</div>
<embed src="${url}" type="application/pdf">
</body></html>`);
    aba.document.close();
  } catch {
    // Aba perdida (fechada no meio, bloqueio de escrita): não deixa o usuário
    // sem o arquivo — cai no download direto.
    baixarComNome(blob, arquivo);
  }
}
