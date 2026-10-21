import { z } from "zod";
import { exigirAcesso } from "@/lib/api-auth";
import { baixarSeguro } from "@/lib/busca-segura";
import { LIMITE_DOCUMENTO_ADM } from "@/lib/compactar-pdf-core";
import { erro, parseCorpo } from "@/lib/http";
import { nomeDoLink, urlPdfDoGoogle } from "@/lib/link-documento-core";

export const dynamic = "force-dynamic";

const linkSchema = z.object({ url: z.string().trim().min(1).max(2000) });

/** Baixa o PDF de um link do Google (Docs/Drive, compartilhado com o link) e devolve os bytes — a tela segue o MESMO
 * envio de um arquivo (tamanho, compactação, partes). Importar em Documentos. */
export async function POST(req: Request) {
  const a = await exigirAcesso("documentos", "importar");
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(linkSchema, req);
  if ("resp" in p) return p.resp;
  const url = urlPdfDoGoogle(p.data.url);
  if (!url) return erro("Use um link do Google Docs ou do Google Drive.", 422);
  let r: Awaited<ReturnType<typeof baixarSeguro>>;
  try {
    r = await baixarSeguro(url, { accept: "application/pdf", maxBytes: LIMITE_DOCUMENTO_ADM, quem: "O Google", binario: true, tempoMs: 30000 });
  } catch (e) {
    return erro(e instanceof Error ? e.message : "Não foi possível baixar o arquivo.", 422);
  }
  const b = r.bytes;
  const ehPdf = !!b && b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
  if (!ehPdf) return erro("O link não entregou um PDF — compartilhe como “Qualquer pessoa com o link” (ou envie um PDF do Drive).", 422);
  return new Response(new Uint8Array(b), {
    headers: { "content-type": "application/pdf", "x-nome": encodeURIComponent(nomeDoLink(r.nome)), "cache-control": "no-store" },
  });
}
