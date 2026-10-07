import { notificar } from "@/lib/notificacoes";
import { exigirAdmin, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { rotuloFrequencia } from "@/lib/fluxo-core";
import { cicloAoGravar, editarFluxo, excluirFluxo, fluxosQueUsam, getFluxo, registrarExecucaoFluxo } from "@/lib/fluxos";
import { editarFluxoSchema, execucaoFluxoSchema } from "@/lib/fluxos-validation";
import { erro, ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const id = intId((await params).id);
  if (!id) return erro("Id inválido.", 400);
  const fluxo = await getFluxo(id);
  return fluxo ? ok({ fluxo }) : erro("Fluxo não encontrado.", 404);
}

export async function PATCH(req: Request, { params }: Ctx) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const id = intId((await params).id);
  if (!id) return erro("Id inválido.", 400);
  const p = await parseCorpo(editarFluxoSchema, req);
  if ("resp" in p) return p.resp;
  if (p.data.grafo) {
    const ciclo = await cicloAoGravar(id, p.data.grafo);
    if (ciclo) return erro(ciclo, 409);
  }
  const antes = await getFluxo(id);
  const fluxo = await editarFluxo(id, p.data);
  if (!antes || !fluxo) return erro("Fluxo não encontrado.", 404);
  const partes: string[] = [];
  if (p.data.nome && p.data.nome !== antes.nome) partes.push(`renomeado para “${fluxo.nome}”`);
  if (p.data.grafo) partes.push(`${fluxo.grafo.nos.length} nó(s), ${fluxo.grafo.conexoes.length} conexão(ões)`);
  if (p.data.frequencia) partes.push(`frequência: ${rotuloFrequencia(fluxo.frequencia)}`);
  if (p.data.ativo !== undefined && p.data.ativo !== antes.ativo) partes.push(fluxo.ativo ? "agendamento LIGADO" : "agendamento desligado");
  if (partes.length)
    await registrarAuditoria({ usuario: g.u, acao: "editar", entidade: "automacao", entidadeId: id, origem: "centi", resumo: `Fluxo “${fluxo.nome}”: ${partes.join(" · ")}` });
  return ok({ fluxo });
}

/** Fim de uma execução (o motor roda no navegador): grava o resumo e agenda a próxima. */
export async function POST(req: Request, { params }: Ctx) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const id = intId((await params).id);
  if (!id) return erro("Id inválido.", 400);
  const p = await parseCorpo(execucaoFluxoSchema, req);
  if ("resp" in p) return p.resp;
  const fluxo = await registrarExecucaoFluxo(id, p.data);
  if (!fluxo) return erro("Fluxo não encontrado.", 404);
  if (p.data.estado !== "concluido" || p.data.apontados)
    await registrarAuditoria({
      usuario: g.u,
      acao: "importar",
      entidade: "automacao",
      entidadeId: id,
      origem: "centi",
      resumo: `Fluxo “${fluxo.nome}” ${p.data.estado}${p.data.erro ? `: ${p.data.erro}` : ""} · ${p.data.apontados} erro(s) apontado(s)`,
    });
  const rel = p.data.relatorio;
  if (rel?.length || p.data.estado === "falhou") {
    const imp = rel?.filter((x) => x.status === "importado") ?? [];
    const nao = rel?.filter((x) => x.status !== "importado") ?? [];
    const linhas = [
      `${imp.length} importado(s) · ${nao.length} não importado(s)${p.data.apontados ? ` · ${p.data.apontados} apontamento(s)` : ""}`,
      ...nao.slice(0, 3).map((x) => `${x.protocolo}: ${x.motivo ?? "não importado"}`),
      ...(p.data.erro ? [p.data.erro] : []),
    ];
    await notificar([
      { usuarioId: g.u.id, tipo: "centi", titulo: `Fluxo “${fluxo.nome}” — ${p.data.estado === "concluido" ? "concluído" : p.data.estado}`, texto: linhas.join("\n").slice(0, 500), link: "/painel/automacao" },
    ]);
  }
  return ok({ fluxo });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const id = intId((await params).id);
  if (!id) return erro("Id inválido.", 400);
  const antes = await getFluxo(id);
  if (!antes) return erro("Fluxo não encontrado.", 404);
  const usam = await fluxosQueUsam(id);
  if (usam.length) return erro(`Este fluxo é usado dentro de: ${usam.map((f) => `“${f.nome}”`).join(", ")}. Tire-o de lá antes de excluir.`, 409);
  if (!(await excluirFluxo(id))) return erro("Fluxo não encontrado.", 404);
  await registrarAuditoria({ usuario: g.u, acao: "excluir", entidade: "automacao", entidadeId: id, origem: "centi", resumo: `Fluxo de automação excluído: ${antes.nome}` });
  return ok();
}
