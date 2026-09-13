import { exigirEditor } from "@/lib/api-auth";
import { appendDfdItens, dfdExiste, upsertDfdCabecalho } from "@/lib/dfd";
import { dfdOpSchema, faltasObrigatorias } from "@/lib/dfd-validation";
import { getReparticaoContexto } from "@/lib/grupos";
import { erro, ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Escrita de DFD em LOTES (cobre o DFD avulso e cada DFD do protocolo):
 * - `start-dfd`: cabeçalho + 1º lote de itens → cria/zera o DFD (por `numero`) e
 *   devolve `dfdId`. Garante a regra (defeituoso NUNCA grava): `faltasObrigatorias`
 *   sobre cabeçalho + 1º lote (repartição, seções, valor unitário).
 * - `append-dfd-itens`: acrescenta lotes seguintes ao `dfdId` (cada item exige
 *   valor unitário). Assim um DFD com milhares de itens sobe em vários requests,
 *   cada um dentro dos limites do Worker/D1.
 */
export async function POST(req: Request) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;

  const p = await parseCorpo(dfdOpSchema, req);
  if ("resp" in p) return p.resp;
  const d = p.data;

  if (d.mode === "append-dfd-itens") {
    if (!(await dfdExiste(d.dfdId))) return erro("DFD não encontrado para acrescentar itens.", 404);
    if (!d.rows.every((r) => r.valorUnitario != null && r.valorUnitario > 0)) {
      return erro("Todos os itens precisam de valor unitário.", 422);
    }
    const r = await appendDfdItens(d.dfdId, d.rows, d.desde);
    return ok({ inserted: r.inserted });
  }

  // start-dfd — regra obrigatória (mesma do cliente) sobre cabeçalho + 1º lote.
  const faltas = faltasObrigatorias({ reparticaoId: d.reparticaoId, itens: d.rows, secoes: d.secoes });
  if (faltas.length > 0) return erro(`Não é possível importar: falta ${faltas.join(", ")}.`, 422);

  if (d.reparticaoId != null) {
    const { lista } = await getReparticaoContexto(a.u);
    if (!lista.some((r) => r.id === d.reparticaoId)) {
      return erro("Repartição inválida ou sem acesso.", 403);
    }
  }

  const r = await upsertDfdCabecalho(d, a.u.id, d.rows);
  return ok({ dfdId: r.id, numero: r.numero });
}
