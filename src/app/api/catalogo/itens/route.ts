import { exigirEditor } from "@/lib/api-auth";
import { definirTiposItens } from "@/lib/catalogo";
import { patchItensTiposSchema } from "@/lib/catalogo-validation";
import { ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Define os TIPOS de DFD de um conjunto de itens (mesmo valor p/ todos) — por item ou
 * em massa (seleção). Só editor. Não mexe em descrição/unidade/código.
 */
export async function PATCH(req: Request) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(patchItensTiposSchema, req);
  if ("resp" in p) return p.resp;
  await definirTiposItens(p.data.ids, p.data.tipos);
  return ok();
}
