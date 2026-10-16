import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { getConfigEscopo, gravarConfigEscopo } from "@/lib/escopo-cabecalho";
import { diffConfigEscopo } from "@/lib/escopo-cabecalho-core";
import { configEscopoSchema } from "@/lib/escopo-cabecalho-validation";
import { ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

// Configurações → Filtro da unidade (ADM): quais telas obedecem à unidade escolhida no cabeçalho. Mesma linha
// `configuracoes` id=1 (chave `escopoCabecalho`) — as chaves irmãs ficam.

export async function GET() {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  return ok({ escopo: await getConfigEscopo({ fresco: true }) });
}

export async function PATCH(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const p = await parseCorpo(configEscopoSchema, req);
  if ("resp" in p) return p.resp;
  const antes = await getConfigEscopo({ fresco: true });
  const escopo = await gravarConfigEscopo(p.data, g.u.id);
  await registrarAuditoria({ usuario: g.u, acao: "editar", entidade: "configuracao", entidadeId: 1, resumo: `Filtro da unidade (ADM): ${diffConfigEscopo(antes, escopo).join("; ") || "sem mudança"}` });
  return ok({ escopo });
}
