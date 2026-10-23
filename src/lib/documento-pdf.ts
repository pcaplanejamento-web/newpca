import { baixarNoNavegador, comoBlob } from "./arquivo-navegador";
import type { BlocoDoc } from "./documento-pdf-core";
import { gerarDocumentoPdf } from "./documento-pdf-gerar";
import type { PaletaPdf } from "./exportar-pdf-core";
import { paletaDoDocumento } from "./exportar-pdf";

/**
 * Gera e BAIXA um DOCUMENTO em PDF (A4 em pé) a partir de BLOCOS (navegador; o pdf-lib é carregado só aqui). O layout é
 * do núcleo puro `documento-pdf-core` — aqui só se desenham as operações, nas cores do design system (tema claro: o
 * papel), com o rodapé "Gerado por <quem> em dd/mm/aaaa às hh:mm (horário de Brasília) · <sistema> · Página N de M".
 */
export async function baixarDocumentoPdf(
  arquivo: string,
  doc: { titulo: string; blocos: BlocoDoc[] },
  opcoes: { usuario?: string | null; sistema?: string; paleta?: PaletaPdf } = {},
): Promise<void> {
  const sistema = opcoes.sistema ?? "Plataforma PCA";
  const agora = new Date();
  const fuso = { timeZone: "America/Sao_Paulo" } as const;
  const quando = `${agora.toLocaleDateString("pt-BR", fuso)} às ${agora.toLocaleTimeString("pt-BR", { ...fuso, hour: "2-digit", minute: "2-digit" })}`;
  const rodape = `Gerado ${opcoes.usuario ? `por ${opcoes.usuario} ` : ""}em ${quando} (horário de Brasília) · ${sistema}`;
  const bytes = await gerarDocumentoPdf(doc, { rodape, sistema, paleta: opcoes.paleta ?? paletaDoDocumento(), data: agora });
  baixarNoNavegador(arquivo, comoBlob(bytes));
}
