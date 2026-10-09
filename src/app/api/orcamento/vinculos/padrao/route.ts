import { exigirAcesso } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { usarPadraoNaVisao, vinculosGravados } from "@/lib/orcamento";
import { padraoVinculoSchema } from "@/lib/orcamento-validation";

export const dynamic = "force-dynamic";

/** A VISÃO volta a seguir os vínculos PADRÃO numa unidade do CUBO (os próprios dela saem). Configurar no Orçamento. */
export async function POST(req: Request) {
  const a = await exigirAcesso("orcamento", "configurar");
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(padraoVinculoSchema, req);
  if ("resp" in p) return p.resp;
  if (!(await usarPadraoNaVisao(p.data.visaoId, p.data.chave))) return erro("Visão não encontrada.", 404);
  await registrarAuditoria({
    usuario: a.u,
    acao: "editar",
    entidade: "orcamento_visao",
    entidadeId: p.data.visaoId,
    resumo: `Vínculos da unidade do orçamento "${p.data.chave}" voltaram ao padrão nesta visão`,
  });
  return ok(await vinculosGravados());
}
