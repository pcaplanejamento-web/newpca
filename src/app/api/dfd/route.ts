import { exigirEditor } from "@/lib/api-auth";
import { appendDfdItens, getDfdReparticao, getReparticaoDfdNumero, upsertDfdCabecalho } from "@/lib/dfd";
import { dfdOpSchema, faltasObrigatorias } from "@/lib/dfd-validation";
import { getReparticaoContexto } from "@/lib/grupos";
import { erro, ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Escrita de DFD em LOTES (cobre o DFD avulso e cada DFD do protocolo):
 * - `start-dfd`: cabeçalho + 1º lote → cria/zera o DFD (por `numero`), devolve `dfdId`.
 *   Garante a regra (defeituoso NUNCA grava) via `faltasObrigatorias`; exige que a
 *   repartição seja **acessível** e **anti-sequestro** por `numero`.
 * - `append-dfd-itens`: acrescenta lotes ao `dfdId` (idempotente no servidor). Exige
 *   que a repartição do DFD seja acessível ao editor.
 */
export async function POST(req: Request) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;

  const p = await parseCorpo(dfdOpSchema, req);
  if ("resp" in p) return p.resp;
  const d = p.data;

  const { lista } = await getReparticaoContexto(a.u);
  const acessivel = (id: number | null | undefined) => id == null || lista.some((r) => r.id === id);

  if (d.mode === "append-dfd-itens") {
    const dfd = await getDfdReparticao(d.dfdId);
    if (!dfd) return erro("DFD não encontrado para acrescentar itens.", 404);
    if (!acessivel(dfd.reparticaoId)) return erro("Sem acesso à repartição deste DFD.", 403);
    if (!d.rows.every((r) => r.valorUnitario != null && r.valorUnitario > 0)) {
      return erro("Todos os itens precisam de valor unitário.", 422);
    }
    const r = await appendDfdItens(d.dfdId, d.rows, d.desde);
    return ok({ inserted: r.inserted });
  }

  // start-dfd — regra obrigatória (mesma do cliente) sobre cabeçalho + 1º lote.
  const faltas = faltasObrigatorias({ reparticaoId: d.reparticaoId, itens: d.rows, secoes: d.secoes });
  if (faltas.length > 0) return erro(`Não é possível importar: falta ${faltas.join(", ")}.`, 422);
  if (!acessivel(d.reparticaoId)) return erro("Repartição inválida ou sem acesso.", 403);
  // Anti-sequestro: não sobrescrever/mover um DFD (mesmo `numero`) de uma repartição inacessível.
  const existente = await getReparticaoDfdNumero(d.numero);
  if (existente && !acessivel(existente.reparticaoId)) {
    return erro("Já existe um DFD com esse número em outra repartição, sem acesso.", 403);
  }

  const r = await upsertDfdCabecalho(d, a.u.id, d.rows);
  return ok({ dfdId: r.id, numero: r.numero });
}
