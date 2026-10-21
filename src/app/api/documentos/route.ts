import { exigirAcesso } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { cabeAlvo, ehPdf, LIMITE_DOCUMENTO, LIMITE_DOCUMENTO_ADM } from "@/lib/compactar-pdf-core";
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

/** Guarda um PDF já compactado no navegador — recusa o que não é PDF ou passa do limite (100 KB; o ADM, 1 MB). Importar em Documentos. */
export async function POST(req: Request) {
  const a = await exigirAcesso("documentos", "importar");
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(novoDocumentoSchema, req);
  if ("resp" in p) return p.resp;
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(p.data.conteudo), (c) => c.charCodeAt(0));
  } catch {
    return erro("Conteúdo inválido.", 422);
  }
  if (!ehPdf(bytes)) return erro("O arquivo não é um PDF.", 422);
  // O ADM escolhe o tamanho (até 1 MB); os demais, até 100 KB.
  const limite = a.u.admin ? LIMITE_DOCUMENTO_ADM : LIMITE_DOCUMENTO;
  if (!cabeAlvo(bytes.length, limite)) return erro(`O PDF tem ${formatBytes(bytes.length)} — o limite é ${formatBytes(limite)}.`, 422);
  const id = await criarDocumento({ ...p.data, tamanho: bytes.length, criadoPor: a.u.id });
  await registrarAuditoria({
    usuario: a.u,
    acao: "criar",
    entidade: "documento",
    entidadeId: id,
    resumo: `Documento "${p.data.nome}" (${formatBytes(bytes.length)}${p.data.compactado ? `, compactado de ${formatBytes(p.data.tamanhoOriginal)}` : ""})`,
  });
  return ok({ id });
}
