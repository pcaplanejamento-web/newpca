import { gruposDeTarefas } from "@/lib/acesso";
import { exigirSessao, intId } from "@/lib/api-auth";
import { erro, ok } from "@/lib/http";
import { listarQuadros, tarefasDoVinculo } from "@/lib/tarefas";
import { ehTipoVinculo } from "@/lib/tarefas-core";
import { dataIsoBrasilia } from "@/lib/format";

export const dynamic = "force-dynamic";

/** As tarefas LIGADAS a um protocolo/DFD/PCA/orçamento (`?tipo=&id=`) — dos grupos em que o papel VÊ as tarefas — + os
 * quadros onde ele pode criar outra (Manipular). */
export async function GET(req: Request) {
  const a = await exigirSessao();
  if ("erro" in a) return a.erro;
  const sp = new URL(req.url).searchParams;
  const tipo = sp.get("tipo");
  const id = intId(sp.get("id") ?? "");
  if (!ehTipoVinculo(tipo) || tipo === "tarefa" || !id) return erro("Vínculo inválido.", 422);
  const [tarefas, quadros] = await Promise.all([
    tarefasDoVinculo(a.u, gruposDeTarefas(a.acesso, "visualizar", true), tipo, id),
    listarQuadros(gruposDeTarefas(a.acesso, "manipular"), dataIsoBrasilia(new Date().toISOString()), a.u.id),
  ]);
  return ok({ tarefas, quadros: quadros.filter((q) => !q.arquivado).map((q) => ({ id: q.id, nome: q.nome, cor: q.cor, grupoNome: q.grupoNome })) });
}
