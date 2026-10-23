import { z } from "zod";
import { exigirAdmin } from "@/lib/api-auth";
import { erro, ok, parseCorpo } from "@/lib/http";
import { codigoNormal } from "@/lib/termo-uso-core";
import { aceitePorCodigo, conferirArquivoTermo, dadosDoRegistro, seloConfere } from "@/lib/termo-uso";

export const dynamic = "force-dynamic";

/** VERIFICAÇÃO INTERNA (ADM): o registro COMPLETO do aceite pelo código + se o selo confere. */
export async function GET(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const codigo = codigoNormal(new URL(req.url).searchParams.get("codigo") ?? "");
  if (!codigo) return erro("Informe o código de verificação.", 422);
  const a = await aceitePorCodigo(codigo);
  if (!a) return ok({ aceite: null });
  return ok({ aceite: { id: a.id, ...dadosDoRegistro(a), integro: await seloConfere(a) } });
}

const schema = z.strictObject({ codigo: z.string().min(1).max(80), hash: z.string().regex(/^[0-9a-f]{64}$/) });

/** Confere o ARQUIVO (o SHA-256 do PDF) — sem o limite por IP da verificação pública. */
export async function POST(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const p = await parseCorpo(schema, req);
  if ("resp" in p) return p.resp;
  return ok({ resultado: await conferirArquivoTermo(p.data.codigo, p.data.hash, new URL(req.url).origin) });
}
