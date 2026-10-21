/**
 * Núcleo PURO da compactação dos PDFs de Documentos: o limite, a ESCADA de qualidade (escala × qualidade JPEG) e os
 * textos. Sem DOM nem pdf-lib — o adaptador do navegador (`compactar-pdf.ts`) percorre a escada até o PDF caber.
 */

/** Todo documento gravado tem no máximo 100 KB. */
export const LIMITE_DOCUMENTO = 100 * 1024;

/** Uma etapa da compactação por imagem: a escala da página (1 = o tamanho do PDF em pontos) e a qualidade do JPEG. */
export type EtapaCompactacao = { escala: number; qualidade: number };

/** Do melhor ao menor: começa legível e só desce o necessário. */
const ESCADA: readonly EtapaCompactacao[] = [
  { escala: 1.5, qualidade: 0.7 },
  { escala: 1.25, qualidade: 0.6 },
  { escala: 1, qualidade: 0.55 },
  { escala: 0.85, qualidade: 0.45 },
  { escala: 0.7, qualidade: 0.4 },
  { escala: 0.55, qualidade: 0.35 },
  { escala: 0.45, qualidade: 0.3 },
  { escala: 0.35, qualidade: 0.25 },
];

/** A menor escala tentada — abaixo disso a página tem poucos pixels e qualquer PDF cabe. */
const ESCALA_MINIMA = 0.02;

/**
 * As etapas, na ordem: a escada e, depois dela, a escala reduzida a 80% a cada vez (qualidade 0,2) até o piso técnico —
 * a regra pedida: baixar a qualidade até caber, nunca recusar pelo tamanho.
 */
export function etapasCompactacao(): EtapaCompactacao[] {
  const etapas = [...ESCADA];
  let escala = ESCADA[ESCADA.length - 1].escala;
  while (escala > ESCALA_MINIMA) {
    escala = Math.round(escala * 0.8 * 1000) / 1000;
    etapas.push({ escala: Math.max(escala, ESCALA_MINIMA), qualidade: 0.2 });
  }
  return etapas;
}

export const cabe = (bytes: number): boolean => bytes > 0 && bytes <= LIMITE_DOCUMENTO;

/** O arquivo começa com "%PDF" (o cabeçalho de todo PDF). */
export function ehPdf(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

/** O nome do documento a partir do arquivo: sem a extensão, espaços juntos, até 120 caracteres. */
export function nomeDoDocumento(arquivo: string): string {
  const nome = arquivo
    .replace(/\.pdf$/i, "")
    .replace(/[_\s]+/g, " ")
    .trim();
  return (nome || "Documento").slice(0, 120);
}

/** O tamanho em base64 de N bytes (o que vai na requisição e no banco). */
export const tamanhoBase64 = (bytes: number): number => Math.ceil(bytes / 3) * 4;
