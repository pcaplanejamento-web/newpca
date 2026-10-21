import { exigirAcesso } from "@/lib/api-auth";
import { cabeAlvo, LIMITE_DOCUMENTO, LIMITE_DOCUMENTO_ADM, partesDe } from "@/lib/compactar-pdf-core";
import { criarDocumento, listarDocumentos } from "@/lib/documentos";
import { novoDocumentoSchema } from "@/lib/documentos-validation";
import { formatBytes } from "@/lib/format";
import { erro, ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Os documentos (sem o conteúdo). Visualizar em Documentos. */
export async function GET() {
  const a = await exigirAcesso("documentos", "visualizar");
  if ("erro" in a) return a.erro;
  return ok({ documentos: await listarDocumentos() });
}

/** Abre o envio de um PDF já compactado no navegador (os bytes vão em partes) — recusa o que passa do limite (100 KB; o
 * ADM, 20 MB). Importar em Documentos. */
export async function POST(req: Request) {
  const a = await exigirAcesso("documentos", "importar");
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(novoDocumentoSchema, req);
  if ("resp" in p) return p.resp;
  const limite = a.u.admin ? LIMITE_DOCUMENTO_ADM : LIMITE_DOCUMENTO;
  if (!cabeAlvo(p.data.tamanho, limite)) return erro(`O PDF tem ${formatBytes(p.data.tamanho)} — o limite é ${formatBytes(limite)}.`, 422);
  const id = await criarDocumento({ ...p.data, partes: partesDe(p.data.tamanho), criadoPor: a.u.id });
  return ok({ id, partes: partesDe(p.data.tamanho) });
}
