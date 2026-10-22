import { baixarDocumentoPdf } from "./documento-pdf";
import { blocosComprovante, type DadosAceite } from "./termo-uso-core";

/** Baixa o COMPROVANTE do aceite (o termo integral + o registro da assinatura) — os dados vêm de `/api/termo/aceites/[id]`. */
export async function baixarComprovanteTermo(aceiteId: number, sistema?: string): Promise<void> {
  const r = await fetch(`/api/termo/aceites/${aceiteId}`, { cache: "no-store" });
  const j = (await r.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    aceite?: DadosAceite & { selo: string; id: number };
    texto?: string;
    titulo?: string;
    urlVerificacao?: string;
  };
  if (!r.ok || !j.ok || !j.aceite || !j.texto) throw new Error(j.error ?? "Não foi possível gerar o comprovante.");
  const a = j.aceite;
  await baixarDocumentoPdf(
    `termo-de-uso-v${a.versao}-${a.codigo}.pdf`,
    { titulo: `${j.titulo ?? "Termo de Uso"} — versão ${a.versao} (comprovante de aceite)`, blocos: blocosComprovante(j.texto, { ...a, urlVerificacao: j.urlVerificacao ?? "" }) },
    { usuario: a.nome, sistema },
  );
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
