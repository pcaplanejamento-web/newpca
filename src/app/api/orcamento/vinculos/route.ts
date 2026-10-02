import { exigirAcesso } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { criarVinculosOrcamento } from "@/lib/orcamento";
import { criarVinculosOrcamentoSchema } from "@/lib/orcamento-validation";

export const dynamic = "force-dynamic";

/**
 * CRIA vínculos da UNIDADE do orçamento (texto do CUBO) com unidades do cadastro (Configurar no Orçamento) — cada um
 * com as suas AÇÕES (lista explícita ou as DEMAIS). Uma unidade do CUBO pode ter vários; a regra (`conflitoVinculo`) e a
 * unidade cadastrada são conferidas no servidor. Global: vale para todos os orçamentos.
 */
export async function POST(req: Request) {
  const a = await exigirAcesso("orcamento", "configurar");
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(criarVinculosOrcamentoSchema, req);
  if ("resp" in p) return p.resp;
  const falha = await criarVinculosOrcamento(p.data.vinculos);
  if (falha) return erro(falha, 422);
  const n = p.data.vinculos.length;
  await registrarAuditoria({
    usuario: a.u,
    acao: "criar",
    entidade: "orcamento",
    entidadeId: null,
    resumo: `${n} ${n === 1 ? "vínculo criado" : "vínculos criados"} entre unidades do orçamento e do cadastro`,
    depois: { vinculos: p.data.vinculos },
  });
  return ok();
}
