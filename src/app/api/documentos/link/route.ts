import { avisarAdmsDocumento } from "@/lib/avisos-mesa";
import { z } from "zod";
import { exigirAcesso } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { pdfDoGoogle } from "@/lib/documento-google";
import { criarDocumentoLink } from "@/lib/documentos";
import { erro, ok, parseCorpo } from "@/lib/http";
import { contarPaginas, nomeDoLink } from "@/lib/link-documento-core";

export const dynamic = "force-dynamic";

const linkSchema = z.object({ url: z.string().trim().min(1).max(2000) });

/** Cadastra um documento que FICA NO DRIVE: confere que o link entrega um PDF e guarda só o link. Importar em Documentos. */
export async function POST(req: Request) {
  const a = await exigirAcesso("documentos", "importar");
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(linkSchema, req);
  if ("resp" in p) return p.resp;
  let pdf: Awaited<ReturnType<typeof pdfDoGoogle>>;
  try {
    pdf = await pdfDoGoogle(p.data.url);
  } catch (e) {
    return erro(e instanceof Error ? e.message : "Não foi possível abrir o link.", 422);
  }
  const nome = nomeDoLink(pdf.nome);
  const id = await criarDocumentoLink({ nome, url: p.data.url, tamanho: pdf.bytes.length, paginas: contarPaginas(pdf.bytes), criadoPor: a.u.id });
  await registrarAuditoria({ usuario: a.u, acao: "criar", entidade: "documento", entidadeId: id, resumo: `documento pelo link do Google: ${nome}` });
  await avisarAdmsDocumento(a.u, "Documento adicionado pelo link do Drive", nome, id);
  return ok({ id });
}
