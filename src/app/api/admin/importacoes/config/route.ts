import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { diffCampos } from "@/lib/auditoria-core";
import { motivoConfigImportacoes, motivoEscolhaAutomaticas, textoDiffAutomaticas } from "@/lib/empenho-cards-core";
import { todosOsCards } from "@/lib/empenho-cards";
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
  const antes = await getConfigImportacoes();
  // Sem a escolha no pedido, fica a gravada.
  const pedido = { ...p.data, automaticas: p.data.automaticas === undefined ? antes.automaticas : p.data.automaticas };
  const motivo = motivoConfigImportacoes(pedido);
  if (motivo) return erro(motivo, 422);
  const cards = await todosOsCards();
  const motivoEscolha = motivoEscolhaAutomaticas(pedido.automaticas, cards);
  if (motivoEscolha) return erro(motivoEscolha, 422);
  const config = await gravarConfigImportacoes(pedido, a.u.id);
  const dd = diffCampos(antes as Record<string, unknown>, config as Record<string, unknown>, Object.keys(ROTULOS), ROTULOS);
  const escolha = textoDiffAutomaticas(antes.automaticas, config.automaticas, cards);
  const resumo = [dd.resumo, escolha && `automáticas: ${escolha}`].filter(Boolean).join("; ");
  await registrarAuditoria({ usuario: a.u, acao: "editar", entidade: "empenho_card", resumo: `Importações da Centi: ${resumo || "configuração salva"}`, antes: dd.antes, depois: dd.depois });
  return ok({ config });
}
