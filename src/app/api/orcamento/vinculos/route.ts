import { exigirEditor } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { definirVinculosOrcamento } from "@/lib/orcamento";
import { vinculosOrcamentoSchema } from "@/lib/orcamento-validation";

export const dynamic = "force-dynamic";

/**
 * VÍNCULOS do Órgão/Unidade do orçamento (texto do CUBO) com o cadastro do sistema (só editor).
 * UPSERT por texto normalizado; `alvoId` null desvincula. O alvo é conferido no servidor (órgão
 * existente / unidade existente, nunca a "Geral"). Global: vale para todos os orçamentos.
 */
export async function PUT(req: Request) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(vinculosOrcamentoSchema, req);
  if ("resp" in p) return p.resp;

  const falha = await definirVinculosOrcamento(p.data.vinculos);
  if (falha) return erro(falha, 422);
  const n = p.data.vinculos.length;
  await registrarAuditoria({
    usuario: a.u,
    acao: "editar",
    entidade: "orcamento",
    entidadeId: null,
    resumo: `Vínculos do orçamento com órgãos/unidades atualizados — ${n} ${n === 1 ? "texto" : "textos"}`,
    depois: { vinculos: p.data.vinculos },
  });
  return ok();
}
