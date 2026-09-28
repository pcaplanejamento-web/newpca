import { exigirEditor } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { getGrupoAtivoId, gruposDoUsuario } from "@/lib/grupos";
import { erro, ok, parseCorpo } from "@/lib/http";
import { listasDoPeriodo } from "@/lib/calendario-core";
import { listarFeriados } from "@/lib/feriados";
import { copiarTemplatesDe, criarQuadro, criarQuadroDoModelo, gerarListasDoPeriodo, getModelo, getQuadro, modeloQuadroDe, quadroAcessivel } from "@/lib/tarefas";
import { criarQuadroSchema } from "@/lib/tarefas-validation";

export const dynamic = "force-dynamic";

/**
 * Cria um QUADRO de tarefas no GRUPO ATIVO do cabeçalho — em branco (nasce com as listas A fazer · Em andamento ·
 * Concluído) ou a partir de um MODELO de quadro de um grupo do usuário (listas + etiquetas). `periodo` acrescenta as
 * listas dos DIAS do mês (antes da de concluídas); `templatesDe` copia os TEMPLATES daquele quadro (que o usuário vê).
 */
export async function POST(req: Request) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(criarQuadroSchema, req);
  if ("resp" in p) return p.resp;
  const grupoId = await getGrupoAtivoId(a.u);
  if (grupoId == null) return erro("Escolha um grupo no cabeçalho para criar o quadro.", 422);
  const { modeloId, periodo, templatesDe, ...d } = p.data;
  const origem = templatesDe ? await quadroAcessivel(a.u, templatesDe) : null;
  if (templatesDe && !origem) return erro("Quadro dos templates não encontrado.", 404);
  let id: number;
  if (modeloId) {
    const m = await getModelo(modeloId);
    if (m?.tipo !== "quadro" || (a.u.role !== "admin" && !(await gruposDoUsuario(a.u.id)).some((g) => g.id === m.grupoId)))
      return erro("Modelo não encontrado.", 404);
    id = await criarQuadroDoModelo(grupoId, d, modeloQuadroDe(m), a.u.id);
  } else id = await criarQuadro(grupoId, d, a.u.id);
  if (periodo) await gerarListasDoPeriodo(id, listasDoPeriodo(periodo.ano, periodo.mes, periodo.diasUteis ? await listarFeriados() : [], periodo.diasUteis));
  const novo = origem ? await getQuadro(id) : null;
  if (origem && novo) await copiarTemplatesDe(a.u, origem, novo);
  await registrarAuditoria({ usuario: a.u, acao: "criar", entidade: "tarefa_quadro", entidadeId: id, resumo: `Quadro "${p.data.nome}" criado` });
  return ok({ id });
}
