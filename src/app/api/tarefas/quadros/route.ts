import { exigirEditor, exigirUsuario } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { getGrupoAtivoId, gruposDoUsuario } from "@/lib/grupos";
import { erro, ok, parseCorpo } from "@/lib/http";
import { resolverImagemFundo } from "@/lib/imagem-fundo";
import { listasDoPeriodo } from "@/lib/calendario-core";
import { listarFeriados } from "@/lib/feriados";
import { dataIsoBrasilia } from "@/lib/format";
import { atualizarQuadro, copiarTemplatesDe, criarQuadro, criarQuadroDoModelo, gerarListasDoPeriodo, getModelo, getQuadro, listarQuadros, modeloQuadroDe, quadroAcessivel } from "@/lib/tarefas";
import { conjuntosDaPessoa } from "@/lib/tarefas-dados";
import { criarQuadroSchema } from "@/lib/tarefas-validation";

export const dynamic = "force-dynamic";

/**
 * Os QUADROS ativos que a pessoa vê (de TODOS os grupos dela — o ADM, todos; o privado só do dono), com as contagens do
 * card, e os CONJUNTOS da pessoa — o "Mudar de quadros" usa o MESMO `QuadroCard` e as MESMAS seções da tela de Tarefas.
 */
export async function GET() {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const grupos = a.u.role === "admin" ? null : (await gruposDoUsuario(a.u.id)).map((g) => g.id);
  const [quadros, conjuntos] = await Promise.all([listarQuadros(grupos, dataIsoBrasilia(new Date().toISOString()), a.u.id), conjuntosDaPessoa(a.u.id)]);
  return ok({ quadros: quadros.filter((q) => !q.arquivado), conjuntos });
}

/**
 * Cria um QUADRO de tarefas no GRUPO ATIVO do cabeçalho — em branco (nasce com as listas A fazer · Em andamento ·
 * Concluído) ou a partir de um MODELO de quadro de um grupo do usuário (listas + etiquetas). `periodo` acrescenta as
 * listas dos DIAS do mês (antes da de concluídas); `templatesDe` copia os TEMPLATES daquele quadro (que o usuário vê);
 * `fundoUrl`/`fundoGradiente` = o FUNDO escolhido (um ou outro; nenhum = o padrão do sistema); `privado` = só quem cria vê.
 */
export async function POST(req: Request) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(criarQuadroSchema, req);
  if ("resp" in p) return p.resp;
  const grupoId = await getGrupoAtivoId(a.u);
  if (grupoId == null) return erro("Escolha um grupo no cabeçalho para criar o quadro.", 422);
  const { modeloId, periodo, templatesDe, fundoUrl, fundoGradiente, privado, ...d } = p.data;
  // O FUNDO escolhido (a imagem por link é resolvida ANTES — um link sem imagem não cria o quadro pela metade).
  let imagem: string | null = null;
  if (fundoUrl && !fundoGradiente)
    try {
      imagem = await resolverImagemFundo(fundoUrl);
    } catch (e) {
      return erro((e as Error).message, 422);
    }
  const origem = templatesDe ? await quadroAcessivel(a.u, templatesDe) : null;
  if (templatesDe && !origem) return erro("Quadro dos templates não encontrado.", 404);
  let id: number;
  if (modeloId) {
    const m = await getModelo(modeloId);
    if (m?.tipo !== "quadro" || (a.u.role !== "admin" && !(await gruposDoUsuario(a.u.id)).some((g) => g.id === m.grupoId)))
      return erro("Modelo não encontrado.", 404);
    id = await criarQuadroDoModelo(grupoId, d, modeloQuadroDe(m), a.u.id);
  } else id = await criarQuadro(grupoId, d, a.u.id);
  if (imagem || fundoGradiente || privado)
    await atualizarQuadro(id, { fundoUrl: imagem, fundoGradiente: fundoGradiente ? JSON.stringify(fundoGradiente) : null, privado: !!privado });
  if (periodo) await gerarListasDoPeriodo(id, listasDoPeriodo(periodo.ano, periodo.mes, periodo.diasUteis ? await listarFeriados() : [], periodo.diasUteis));
  const novo = origem ? await getQuadro(id) : null;
  if (origem && novo) await copiarTemplatesDe(a.u, origem, novo);
  await registrarAuditoria({ usuario: a.u, acao: "criar", entidade: "tarefa_quadro", entidadeId: id, resumo: `Quadro "${p.data.nome}" criado${privado ? " (privado)" : ""}` });
  return ok({ id });
}
