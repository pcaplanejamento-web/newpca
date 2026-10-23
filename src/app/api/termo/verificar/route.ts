import { z } from "zod";
import { erro, ok, parseCorpo } from "@/lib/http";
import { contarTentativa } from "@/lib/seguranca-acesso";
import { conferirArquivoTermo } from "@/lib/termo-uso";

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
  return ok({ resultado: await conferirArquivoTermo(p.data.codigo, p.data.hash, new URL(req.url).origin) });
}
