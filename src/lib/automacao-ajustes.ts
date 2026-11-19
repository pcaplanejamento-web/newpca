import { isNotNull } from "drizzle-orm";
import { dfds, orgaos } from "@/db/schema";
import { type AjustesCenti, lerAjustesCenti, PREF_AJUSTES_CENTI } from "./automacao-ajustes-core";
import { CONFIG_CENTI_PADRAO, chaveOrgaoCenti } from "./automacao-centi-core";
import { getConfigAutomacao } from "./automacao-plataforma";
import { getDb } from "./db";
import { listarPreferenciasTabela, salvarPreferenciaTabela } from "./preferencias-tabela";

/** Os ajustes do ADM e se já foram salvos no sistema (`salvo` = false: a tela migra o que estava no aparelho). */
export async function lerAjustes(usuarioId: number): Promise<{ ajustes: AjustesCenti; salvo: boolean }> {
  const p = await listarPreferenciasTabela(usuarioId, PREF_AJUSTES_CENTI);
  const v = p[PREF_AJUSTES_CENTI];
  return { ajustes: lerAjustesCenti(v), salvo: v !== undefined };
}

export const gravarAjustes = (usuarioId: number, a: AjustesCenti) => salvarPreferenciaTabela(usuarioId, PREF_AJUSTES_CENTI, a);

/** A operação Emitir DFD em uso (a do servidor — vale para todos os ADMs — ou a padrão). */
export async function operacaoEmUso(): Promise<{ moduleKey: number; guid: string; ativa: boolean }> {
  const c = await getConfigAutomacao();
  return { moduleKey: c.operacao?.moduleKey ?? CONFIG_CENTI_PADRAO.moduleKey, guid: c.operacao?.guid ?? CONFIG_CENTI_PADRAO.guid, ativa: c.ativa };
}

export type OrgaoDaAutomacao = { chave: string; nome: string; n: number; fixa: string | null };

/** Os órgãos dos DFDs protocolados (a MESMA chave da tela — `chaveOrgaoCenti`) com quantos DFDs e o ID CADASTRADO. */
export async function orgaosDaAutomacao(): Promise<OrgaoDaAutomacao[]> {
  const db = getDb();
  const [lista, orgs] = await Promise.all([
    db.select({ orgaoId: dfds.orgaoId, orgaoEntidade: dfds.orgaoEntidade }).from(dfds).where(isNotNull(dfds.protocoloId)),
    db.select({ id: orgaos.id, nome: orgaos.nome, sigla: orgaos.sigla, entidadeCenti: orgaos.entidadeCenti }).from(orgaos),
  ]);
  const porId = new Map(orgs.map((o) => [o.id, o]));
  const m = new Map<string, OrgaoDaAutomacao>();
  for (const d of lista) {
    const chave = chaveOrgaoCenti(d.orgaoId, d.orgaoEntidade);
    if (!chave) continue;
    const o = d.orgaoId != null ? porId.get(d.orgaoId) : undefined;
    const atual = m.get(chave) ?? {
      chave,
      nome: (o ? o.sigla || o.nome : null) ?? (d.orgaoEntidade?.trim() || chave.slice(2)),
      n: 0,
      fixa: o?.entidadeCenti?.trim() || null,
    };
    atual.n++;
    m.set(chave, atual);
  }
  return [...m.values()].sort((a, b) => b.n - a.n || a.nome.localeCompare(b.nome, "pt-BR"));
}
