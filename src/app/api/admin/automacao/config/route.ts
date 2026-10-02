import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { coerceConfigAutomacao, RECEITAS, receitaAtiva } from "@/lib/automacao-core";
import { getConfigAutomacao, gravarConfigAutomacao } from "@/lib/automacao-plataforma";
import { configAutomacaoSchema } from "@/lib/automacao-validation";
import { ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

/** A configuração da Automação (freio de emergência, receitas, operação do Emitir DFD) + o catálogo das receitas. */
export async function GET() {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const config = await getConfigAutomacao();
  return ok({ config, receitas: RECEITAS.map((r) => ({ ...r, ativa: receitaAtiva(config, r.id) })) });
}

export async function PATCH(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const p = await parseCorpo(configAutomacaoSchema, req);
  if ("resp" in p) return p.resp;
  const antes = await getConfigAutomacao();
  const depois = coerceConfigAutomacao({
    ...antes,
    ...(p.data.ativa === undefined ? {} : { ativa: p.data.ativa }),
    receitas: { ...antes.receitas, ...(p.data.receitas ?? {}) },
    operacao: p.data.operacao ? { ...p.data.operacao, em: new Date().toISOString() } : antes.operacao,
  });
  await gravarConfigAutomacao(depois, g.u.id);
  const partes: string[] = [];
  if (antes.ativa !== depois.ativa) partes.push(depois.ativa ? "Automação RETOMADA" : "Automação PAUSADA (freio de emergência)");
  for (const r of RECEITAS)
    if (receitaAtiva(antes, r.id) !== receitaAtiva(depois, r.id)) partes.push(`${r.nome}: ${receitaAtiva(depois, r.id) ? "ligada" : "desligada"}`);
  if (p.data.operacao && JSON.stringify(antes.operacao) !== JSON.stringify(depois.operacao))
    partes.push(`Operação Emitir DFD: ModuleKey ${depois.operacao?.moduleKey}`);
  if (partes.length)
    await registrarAuditoria({ usuario: g.u, acao: "editar", entidade: "automacao", origem: "centi", resumo: partes.join(" · ") });
  return ok({ config: depois });
}
