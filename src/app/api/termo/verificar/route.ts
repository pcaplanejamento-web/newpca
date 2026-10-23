import { z } from "zod";
import { pdfDoComprovante, sha256Arquivo } from "@/lib/comprovante-termo-pdf";
import { erro, ok, parseCorpo } from "@/lib/http";
import { contarTentativa } from "@/lib/seguranca-acesso";
import { codigoNormal } from "@/lib/termo-uso-core";
import { aceitePorCodigo, seloConfere, termoPorId } from "@/lib/termo-uso";

export const dynamic = "force-dynamic";

const schema = z.strictObject({ codigo: z.string().min(1).max(80), hash: z.string().regex(/^[0-9a-f]{64}$/) });

/**
 * VERIFICAÇÃO PÚBLICA DO ARQUIVO: o navegador manda só o SHA-256 do PDF (o arquivo não sai do aparelho); o servidor refaz o
 * comprovante do código e compara. Limite de consultas por IP.
 */
export async function POST(req: Request) {
  const p = await parseCorpo(schema, req);
  if ("resp" in p) return p.resp;
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? "local";
  if (await contarTentativa("verificarTermoIp", ip)) return erro("Muitas consultas seguidas. Tente de novo em alguns minutos.", 429);
  const codigo = codigoNormal(p.data.codigo);
  const a = codigo ? await aceitePorCodigo(codigo) : null;
  if (!a) return ok({ resultado: "nao-encontrado" });
  if (!(await seloConfere(a))) return ok({ resultado: "registro-alterado" });
  const t = await termoPorId(a.termoId);
  if (!t?.textoFinal) return ok({ resultado: "nao-encontrado" });
  const original = await sha256Arquivo(await pdfDoComprovante(a, { textoFinal: t.textoFinal, publicadoEm: t.publicadoEm }, new URL(req.url).origin));
  return ok({ resultado: original === p.data.hash ? "original" : "alterado" });
}
