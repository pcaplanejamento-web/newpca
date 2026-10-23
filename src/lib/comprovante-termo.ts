import { baixarNoNavegador } from "./arquivo-navegador";

/** Baixa o COMPROVANTE do aceite — o PDF é gerado no SERVIDOR (sempre igual, conferível pela verificação do arquivo). */
export async function baixarComprovanteTermo(aceiteId: number, _sistema?: string): Promise<void> {
  const r = await fetch(`/api/termo/aceites/${aceiteId}/pdf`, { cache: "no-store" });
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? "Não foi possível gerar o comprovante.");
  }
  const nome = /filename="([^"]+)"/.exec(r.headers.get("Content-Disposition") ?? "")?.[1] ?? "comprovante-termo-de-uso.pdf";
  baixarNoNavegador(nome, await r.blob());
}

/** O texto do termo em partes de até ~18 mil caracteres (o leitor formatado lê 20 mil por vez), cortadas nos títulos. */
export function partesDoTermo(texto: string): string[] {
  const secoes = texto.split(/\n(?=#{1,3} )/);
  const out: string[] = [];
  let atual = "";
  for (const s of secoes) {
    if (atual && atual.length + s.length > 18_000) {
      out.push(atual);
      atual = "";
    }
    atual = atual ? `${atual}\n${s}` : s;
    while (atual.length > 18_000) {
      out.push(atual.slice(0, 18_000));
      atual = atual.slice(18_000);
    }
  }
  if (atual) out.push(atual);
  return out;
}
