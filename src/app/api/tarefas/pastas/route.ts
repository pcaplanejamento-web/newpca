import { atorPasta } from "@/lib/acesso";
import { exigirSessao, recusaNoQuadro } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { getGrupoAtivoId, gruposDoUsuario } from "@/lib/grupos";
import { erro, ok, parseCorpo } from "@/lib/http";
import { cabeMaisPasta, criarPasta, definirQuadrosDaPasta, excluirPastaDoBanco, pastaAcessivel } from "@/lib/tarefas";
import { MAX_CONJUNTOS } from "@/lib/tarefas-core";
import { criarPastaSchema } from "@/lib/tarefas-validation";

export const dynamic = "force-dynamic";

/**
 * Cria uma PASTA de quadros (migração `0061`) no grupo pedido (padrão = o ativo do cabeçalho): a PÚBLICA (do grupo) com
 * Configurar Tarefas no grupo; a PRIVADA com Manipular — os quadros que entram viram privados. `quadros` = os de dentro, na ordem.
 */
export async function POST(req: Request) {
  const a = await exigirSessao();
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(criarPastaSchema, req);
  if ("resp" in p) return p.resp;
  const { quadros, grupoId: pedido, ...d } = p.data;
  const grupoId = pedido ?? (await getGrupoAtivoId(a.u));
  if (grupoId == null) return erro("Escolha um grupo no cabeçalho para criar a pasta.", 422);
  if (!a.u.admin && !(await gruposDoUsuario(a.u.id)).some((g) => g.id === grupoId)) return erro("Grupo não encontrado.", 404);
  const negado = recusaNoQuadro(a.acesso, { grupoId }, d.privado ? "manipular" : "configurar");
  if (negado) return negado;
  if (!(await cabeMaisPasta(grupoId, a.u))) return erro(`Até ${MAX_CONJUNTOS} pastas por grupo.`, 409);
  const id = await criarPasta(grupoId, d, a.u.id);
  const pasta = await pastaAcessivel(a.u, id);
  const motivo = pasta && quadros.length ? await definirQuadrosDaPasta(a.u, atorPasta(a.acesso), pasta, quadros) : null;
  if (motivo) {
    await excluirPastaDoBanco(id);
    return erro(motivo, 422);
  }
  await registrarAuditoria({ usuario: a.u, acao: "criar", entidade: "tarefa_pasta", entidadeId: id, resumo: `Pasta ${d.privado ? "privada" : "pública"} "${d.nome}" criada${quadros.length ? ` com ${quadros.length} quadro(s)` : ""}` });
  return ok({ id: String(id) });
}
