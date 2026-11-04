import { z } from "zod";
import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { getDb } from "@/lib/db";
import { ok, parseCorpo } from "@/lib/http";
import { LIMITES_SUBUNIDADE, limparCentro } from "@/lib/subunidades-core";
import { CENTROS_POR_COMANDO, sqlCentroCusto } from "@/lib/subunidades-sql";

export const dynamic = "force-dynamic";

const corpoSchema = z.strictObject({
  itens: z
    .array(z.strictObject({ dfdId: z.number().int().positive(), centro: z.string().max(LIMITES_SUBUNIDADE.centro * 4).nullable() }))
    .min(1)
    .max(5000),
});

/**
 * Grava o CENTRO DE CUSTO da Centi (CM002) em cada DFD (o nó "Gravar o Centro de Custo" dos fluxos): o texto COMPLETO,
 * como a Centi escreve; vazio/null = a Centi respondeu sem o dado (limpa — o DFD volta a ser apontado). Só o que muda é
 * gravado (UMA instrução por mil DFDs) e a auditoria registra o fato (a versão dos dados muda — a Mesa acompanha).
 */
export async function POST(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const p = await parseCorpo(corpoSchema, req);
  if ("resp" in p) return p.resp;
  const linhas = [...new Map(p.data.itens.map((x) => [x.dfdId, { id: x.dfdId, centro: limparCentro(x.centro) || null }])).values()];
  const db = getDb();
  let alterados = 0;
  for (let i = 0; i < linhas.length; i += CENTROS_POR_COMANDO) alterados += (await db.all(sqlCentroCusto(linhas.slice(i, i + CENTROS_POR_COMANDO)))).length;
  const vazios = linhas.filter((l) => l.centro == null).length;
  if (alterados > 0)
    await registrarAuditoria({
      usuario: g.u,
      acao: "importar",
      entidade: "automacao",
      origem: "centi",
      resumo: `Centro de Custo da Centi nos DFDs: ${alterados} alterado(s) de ${linhas.length} (${vazios} sem centro de custo na Centi)`,
    });
  return ok({ recebidos: linhas.length, alterados, semCentro: vazios });
}
