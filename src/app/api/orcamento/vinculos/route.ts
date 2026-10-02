import { exigirAcesso } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { definirVinculosOrcamento } from "@/lib/orcamento";
import { vinculosOrcamentoSchema } from "@/lib/orcamento-validation";

export const dynamic = "force-dynamic";

/**
 * VÍNCULOS da UNIDADE do orçamento (texto do CUBO) com a unidade do cadastro + as AÇÕES que entram (Configurar no
 * Orçamento). UPSERT por texto normalizado; `alvoId` null desvincula; `acoesFora` = as ações que ficam sem vínculo. O
 * alvo é conferido no servidor (unidade existente, nunca a "Geral"). Global: vale para todos os orçamentos.
 */
export async function PUT(req: Request) {
  const a = await exigirAcesso("orcamento", "configurar");
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
    resumo: `Vínculos do orçamento com as unidades atualizados — ${n} ${n === 1 ? "unidade" : "unidades"}`,
    depois: { vinculos: p.data.vinculos },
  });
  return ok();
}
