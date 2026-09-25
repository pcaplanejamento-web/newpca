import { exigirUsuario, intId } from "@/lib/api-auth";
import { erro, ok } from "@/lib/http";
import { listarQuadros, tarefasDoVinculo } from "@/lib/tarefas";
import { ehTipoVinculo } from "@/lib/tarefas-core";
import { dataIsoBrasilia } from "@/lib/format";
import { gruposDoUsuario } from "@/lib/grupos";

export const dynamic = "force-dynamic";

/** As tarefas LIGADAS a um protocolo/DFD/PCA/orçamento (`?tipo=&id=`) + os quadros onde o usuário pode criar outra. */
export async function GET(req: Request) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const sp = new URL(req.url).searchParams;
  const tipo = sp.get("tipo");
  const id = intId(sp.get("id") ?? "");
  if (!ehTipoVinculo(tipo) || !id) return erro("Vínculo inválido.", 422);
  const grupos = a.u.role === "admin" ? null : (await gruposDoUsuario(a.u.id)).map((g) => g.id);
  const [tarefas, quadros] = await Promise.all([tarefasDoVinculo(a.u, tipo, id), listarQuadros(grupos, dataIsoBrasilia(new Date().toISOString()))]);
  return ok({ tarefas, quadros: quadros.filter((q) => !q.arquivado).map((q) => ({ id: q.id, nome: q.nome, cor: q.cor, grupoNome: q.grupoNome })) });
}
