import { exigirAdmin, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { diffCampos } from "@/lib/auditoria-core";
import { atualizarApiCenti, getApiCenti, orgaosDoCadastro } from "@/lib/centi-apis";
import { motivoApiInvalida } from "@/lib/centi-apis-core";
import { centiApiSchema } from "@/lib/centi-apis-validation";
import { erro, ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

const ROTULOS = {
  nome: "nome",
  descricao: "descrição",
  urlBase: "URL base",
  endpoint: "endpoint",
  uf: "UF",
  tenant: "município",
  divisao: "divisão",
  paginado: "paginada",
  parametros: "parâmetros",
  lista: "fontes",
  orgaos: "órgãos",
  unidades: "unidades",
  ativa: "ligada",
  frequenciaMin: "frequência (min)",
  diasUteis: "só dias úteis",
  horaInicio: "início",
  horaFim: "fim",
  anos: "anos",
} as const;

/** Edita o cadastro de UMA API (nada é buscado na Centi). Ligar só vale com a importação pronta (409). */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const p = await parseCorpo(centiApiSchema, req);
  if ("resp" in p) return p.resp;
  const antes = await getApiCenti(id);
  if (!antes) return erro("API não encontrada.", 404);
  const motivo = motivoApiInvalida(p.data, antes.implementada, await orgaosDoCadastro());
  if (motivo) return erro(motivo, p.data.ativa && !antes.implementada ? 409 : 422);
  await atualizarApiCenti(id, p.data);
  const campos = Object.keys(ROTULOS) as (keyof typeof ROTULOS)[];
  const dd = diffCampos(antes, { ...antes, ...p.data }, campos, ROTULOS);
  await registrarAuditoria({
    usuario: g.u,
    acao: "editar",
    entidade: "centi_api",
    entidadeId: id,
    resumo: `API da Centi "${antes.nome}": ${dd.resumo || "sem mudança"}`,
    antes: dd.antes,
    depois: dd.depois,
  });
  return ok({ api: await getApiCenti(id) });
}
