import { exigirAcesso } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { criarPastaCatalogo } from "@/lib/catalogo-historico";
import { pastaCatalogoSchema } from "@/lib/catalogo-validation";
import { ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Cria uma PASTA de catálogos (Manipular no Catálogo) — com os catálogos escolhidos. */
export async function POST(req: Request) {
  const a = await exigirAcesso("catalogo", "manipular");
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(pastaCatalogoSchema, req);
  if ("resp" in p) return p.resp;
  const id = await criarPastaCatalogo(p.data, a.u.id);
  await registrarAuditoria({
    usuario: a.u,
    acao: "criar",
    entidade: "catalogo_pasta",
    entidadeId: id,
    resumo: `Pasta "${p.data.nome}" criada${p.data.catalogos?.length ? ` com ${p.data.catalogos.length} ${p.data.catalogos.length === 1 ? "catálogo" : "catálogos"}` : ""}`,
    depois: { nome: p.data.nome, cor: p.data.cor },
  });
  return ok({ id });
}
