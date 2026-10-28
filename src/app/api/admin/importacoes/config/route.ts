import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { diffCampos } from "@/lib/auditoria-core";
import { motivoConfigImportacoes } from "@/lib/empenho-cards-core";
import { configImportacoesSchema } from "@/lib/empenho-cards-validation";
import { erro, ok, parseCorpo } from "@/lib/http";
import { getConfigImportacoes, gravarConfigImportacoes } from "@/lib/importacoes-config";

export const dynamic = "force-dynamic";

const ROTULOS: Record<string, string> = {
  ativa: "atualização automática",
  frequenciaMin: "frequência",
  diasUteis: "dias úteis",
  horaInicio: "início",
  horaFim: "fim",
  quedaSoma: "queda da soma",
  quedaRegistros: "queda dos registros",
  removidos: "removidos na Centi",
};

/** A configuração CENTRAL das importações da Centi (Configurações → Importações — só o ADM). */
export async function GET() {
  const a = await exigirAdmin();
  if ("erro" in a) return a.erro;
  return ok({ config: await getConfigImportacoes() });
}

/** Grava a atualização automática e as regras da conferência — valem para TODOS os cards. */
export async function PATCH(req: Request) {
  const a = await exigirAdmin();
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(configImportacoesSchema, req);
  if ("resp" in p) return p.resp;
  const motivo = motivoConfigImportacoes(p.data);
  if (motivo) return erro(motivo, 422);
  const antes = await getConfigImportacoes();
  const config = await gravarConfigImportacoes(p.data, a.u.id);
  const dd = diffCampos(antes as Record<string, unknown>, config as Record<string, unknown>, Object.keys(ROTULOS), ROTULOS);
  await registrarAuditoria({ usuario: a.u, acao: "editar", entidade: "empenho_card", resumo: `Importações da Centi: ${dd.resumo || "configuração salva"}`, antes: dd.antes, depois: dd.depois });
  return ok({ config });
}
