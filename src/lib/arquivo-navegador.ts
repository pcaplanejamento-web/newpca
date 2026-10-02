// Arquivos no NAVEGADOR (sem JSX): base64, gzip e o download de um Blob — usados pela tela Automação.
export const deBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export async function gunzip(bytes: Uint8Array) {
  const st = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(st).arrayBuffer());
}

export const comoBlob = (b: Uint8Array, tipo = "application/pdf") => new Blob([b as Uint8Array<ArrayBuffer>], { type: tipo });

export function baixarNoNavegador(nome: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
