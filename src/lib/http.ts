import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { origemPermitida } from "./origem";
import "./zod-config";

// Helpers de resposta para as rotas de API — padronizam o envelope {ok,error}
// e cortam o boilerplate repetido em src/app/api/**.

/** Resposta de sucesso: `{ ok: true, ...data }`. */
export function ok(data?: Record<string, unknown>) {
  return NextResponse.json({ ok: true, ...(data ?? {}) });
}

/** Resposta de erro: `{ ok: false, error }` com o status dado. */
export function erro(mensagem: string, status = 400) {
  return NextResponse.json({ ok: false, error: mensagem }, { status });
}

/**
 * Valida o corpo JSON com um schema zod (e recusa, 403, a requisição de OUTRO site — `origemPermitida`). Retorna `{ data }` (ok) ou `{ resp }`
 * (uma resposta 422 pronta). Uso: `const p = await parseCorpo(schema, req);
 * if ("resp" in p) return p.resp; const { data } = p;`
 */
export async function parseCorpo<T>(
  schema: ZodType<T>,
  req: Request,
): Promise<{ data: T } | { resp: NextResponse }> {
  if (!origemPermitida(req)) return { resp: erro("Origem não permitida.", 403) };
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return {
      resp: erro(parsed.error.issues[0]?.message ?? "Dados inválidos.", 422),
    };
  return { data: parsed.data };
}
