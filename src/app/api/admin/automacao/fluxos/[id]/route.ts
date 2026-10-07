import { notificar } from "@/lib/notificacoes";
import { exigirAdmin, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { fluxoEditavel, fluxoVisivel, rotuloFrequencia } from "@/lib/fluxo-core";
import { cicloAoGravar, editarFluxo, excluirFluxo, type FluxoAutomacao, fluxosQueUsam, getFluxo, registrarExecucaoFluxo, subfluxosProibidos } from "@/lib/fluxos";
import { editarFluxoSchema, execucaoFluxoSchema } from "@/lib/fluxos-validation";
import { erro, ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
const NAO_ENCONTRADO = "Fluxo não encontrado.";

/** O fluxo que a pessoa pode MEXER (editar, executar, excluir) — o de outra pessoa responde como inexistente. */
async function doDono(id: number, usuarioId: number): Promise<FluxoAutomacao | null> {
  const f = await getFluxo(id);
  return f && fluxoEditavel(f, usuarioId) ? f : null;
}

export async function GET(_req: Request, { params }: Ctx) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const id = intId((await params).id);
  if (!id) return erro("Id inválido.", 400);
  const fluxo = await getFluxo(id);
  return fluxo && fluxoVisivel(fluxo, g.u.id) ? ok({ fluxo }) : erro(NAO_ENCONTRADO, 404);
}

export async function PATCH(req: Request, { params }: Ctx) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const id = intId((await params).id);
  if (!id) return erro("Id inválido.", 400);
  const p = await parseCorpo(editarFluxoSchema, req);
  if ("resp" in p) return p.resp;
  const antes = await doDono(id, g.u.id);
  if (!antes) return erro(NAO_ENCONTRADO, 404);
  if (p.data.grafo) {
    if ((await subfluxosProibidos(p.data.grafo, g.u.id)).length) return erro("O fluxo usa um subfluxo privado de outra pessoa (ou que não existe mais).", 422);
    const ciclo = await cicloAoGravar(id, p.data.grafo);
    if (ciclo) return erro(ciclo, 409);
  }
  // Tornar PRIVADO um fluxo que outras pessoas usam dentro dos delas quebraria esses fluxos.
  if (p.data.publico === false && antes.publico) {
    const deOutros = (await fluxosQueUsam(id)).filter((f) => f.criadoPor !== g.u.id);
    if (deOutros.length)
      return erro(`Outras pessoas usam este fluxo dentro de: ${deOutros.map((f) => `“${f.nome}”${f.autor ? ` (${f.autor})` : ""}`).join(", ")}. Ele precisa seguir público.`, 409);
  }
  const fluxo = await editarFluxo(id, p.data);
  if (!fluxo) return erro(NAO_ENCONTRADO, 404);
  const partes: string[] = [];
  if (p.data.nome && p.data.nome !== antes.nome) partes.push(`renomeado para “${fluxo.nome}”`);
  if (p.data.grafo) partes.push(`${fluxo.grafo.nos.length} nó(s), ${fluxo.grafo.conexoes.length} conexão(ões)`);
  if (p.data.frequencia) partes.push(`frequência: ${rotuloFrequencia(fluxo.frequencia)}`);
  if (p.data.ativo !== undefined && p.data.ativo !== antes.ativo) partes.push(fluxo.ativo ? "agendamento LIGADO" : "agendamento desligado");
  if (p.data.publico !== undefined && p.data.publico !== antes.publico) partes.push(fluxo.publico ? "tornado PÚBLICO" : "tornado privado");
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
  if (!(await doDono(id, g.u.id))) return erro(NAO_ENCONTRADO, 404);
  const fluxo = await registrarExecucaoFluxo(id, p.data);
  if (!fluxo) return erro(NAO_ENCONTRADO, 404);
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
  const antes = await doDono(id, g.u.id);
  if (!antes) return erro(NAO_ENCONTRADO, 404);
  const usam = await fluxosQueUsam(id);
  if (usam.length)
    return erro(`Este fluxo é usado dentro de: ${usam.map((f) => `“${f.nome}”${f.autor && f.criadoPor !== g.u.id ? ` (${f.autor})` : ""}`).join(", ")}. Tire-o de lá antes de excluir.`, 409);
  if (!(await excluirFluxo(id))) return erro(NAO_ENCONTRADO, 404);
  await registrarAuditoria({ usuario: g.u, acao: "excluir", entidade: "automacao", entidadeId: id, origem: "centi", resumo: `Fluxo de automação excluído: ${antes.nome}` });
  return ok();
}
