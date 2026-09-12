import { exigirEditor } from "@/lib/api-auth";
import { criarOuSubstituirDfd } from "@/lib/dfd";
import { dfdImportSchema, faltasObrigatorias } from "@/lib/dfd-validation";
import { getReparticaoContexto } from "@/lib/grupos";
import { erro, ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Importa (ou substitui, pelo número) um DFD parseado no navegador. */
export async function POST(req: Request) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;

  const p = await parseCorpo(dfdImportSchema, req);
  if ("resp" in p) return p.resp;
  const { data } = p;

  // Requisitos obrigatórios (mesma regra do cliente) — não grava incompleto.
  const faltas = faltasObrigatorias(data);
  if (faltas.length > 0) {
    return erro(`Não é possível importar: falta ${faltas.join(", ")}.`, 422);
  }

  // A repartição escolhida precisa estar entre as acessíveis (admin: todas).
  if (data.reparticaoId != null) {
    const { lista } = await getReparticaoContexto(a.u);
    if (!lista.some((r) => r.id === data.reparticaoId)) {
      return erro("Repartição inválida ou sem acesso.", 403);
    }
  }

  const r = await criarOuSubstituirDfd(data, a.u.id);
  return ok({ id: r.id, numero: r.numero });
}
