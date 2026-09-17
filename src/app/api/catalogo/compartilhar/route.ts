import { exigirEditor } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { compartilharItensNoCatalogo, getCatalogo } from "@/lib/catalogo";
import { compartilharItensSchema } from "@/lib/catalogo-validation";
import { erro, ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Compartilha itens EXISTENTES (idênticos) num catálogo — o MESMO item passa a constar em
 * vários catálogos, sem duplicar a linha, herdando a união dos tipos. Só editor. Usado quando
 * a importação NÃO cria itens novos (só compartilha) — o fluxo com itens novos compartilha
 * dentro do `POST /api/catalogo` (`start-catalogo`).
 */
export async function POST(req: Request) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(compartilharItensSchema, req);
  if ("resp" in p) return p.resp;
  const { catalogoId, itemIds } = p.data;
  if (!(await getCatalogo(catalogoId))) return erro("Catálogo não encontrado.", 404);
  await compartilharItensNoCatalogo(catalogoId, itemIds);
  await registrarAuditoria({
    usuario: a.u,
    acao: "editar",
    entidade: "catalogo",
    entidadeId: catalogoId,
    resumo: `${itemIds.length} ${itemIds.length === 1 ? "item compartilhado" : "itens compartilhados"} no catálogo #${catalogoId}`,
  });
  return ok();
}
