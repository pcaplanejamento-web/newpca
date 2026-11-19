import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { ORIGEM_EXTENSAO_CENTI } from "./automacao-centi-core";
import { pedidoDaExtensao } from "./centi-login-core";
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
  opcoes?: { extensao?: boolean },
): Promise<{ data: T } | { resp: NextResponse }> {
  // `extensao` = a rota aceita também o banner da extensão da Automação (o `Origin` dela — página nenhuma o imita).
  const daExtensao =
    opcoes?.extensao === true && pedidoDaExtensao(req.method, req.headers.get("origin"), req.headers.get("sec-fetch-site"), ORIGEM_EXTENSAO_CENTI);
  if (!daExtensao && !origemPermitida(req)) return { resp: erro("Origem não permitida.", 403) };
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return {
      resp: erro(parsed.error.issues[0]?.message ?? "Dados inválidos.", 422),
    };
  return { data: parsed.data };
}

/** Edição sobre uma versão antiga (outra pessoa salvou depois que o banner leu) — o banner recarrega. */
export const MSG_ALTERADO_POR_OUTRA = "Outra pessoa salvou alterações depois que você abriu — os dados foram recarregados; refaça a sua alteração.";
