import { exigirEditor } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { definirTiposItens, mesclarTiposEmItens } from "@/lib/catalogo";
import { patchItensTiposSchema } from "@/lib/catalogo-validation";
import { ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * TIPOS de DFD de um conjunto de itens (por item ou em massa) — só editor. `modo`:
 * `definir` (SET, o padrão) OU `mesclar` (UNIÃO — o item ganha os tipos sem perder os que
 * já tinha; usado quando um item idêntico é importado com um tipo novo).
 */
export async function PATCH(req: Request) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(patchItensTiposSchema, req);
  if ("resp" in p) return p.resp;
  const { ids, tipos, modo } = p.data;
  if (modo === "mesclar") await mesclarTiposEmItens(ids, tipos);
  else await definirTiposItens(ids, tipos);
  await registrarAuditoria({
    usuario: a.u,
    acao: "editar",
    entidade: "catalogo_item",
    resumo: `Tipos de DFD ${modo === "mesclar" ? "mesclados" : "definidos"} em ${ids.length} ${ids.length === 1 ? "item" : "itens"}: ${tipos.join(", ") || "—"}`,
    depois: { ids, tipos, modo },
  });
  return ok();
}
