import { isNotNull } from "drizzle-orm";
import { dfdProtocolos, dfds, orgaos, pcas, reparticoes } from "@/db/schema";
import { chaveOrgaoCenti, type ProtocoloAutomacao } from "./automacao-centi-core";
import { getDb } from "./db";

/** Os protocolos do sistema com os DFDs deles (a tela Automação, só ADM — todas as unidades): o nº de planejamento, o
 * ano do PCA e o ÓRGÃO de cada DFD (a entidade em que a Centi o emite) + a SIGLA da unidade do protocolo. Consultas
 * enxutas em paralelo; o agrupamento é feito aqui. */
export async function protocolosParaAutomacao(): Promise<ProtocoloAutomacao[]> {
  const db = getDb();
  const [protos, lista, planos, unidades, orgs] = await Promise.all([
    db
      .select({
        id: dfdProtocolos.id,
        numero: dfdProtocolos.numero,
        idExterno: dfdProtocolos.idExterno,
        assunto: dfdProtocolos.assunto,
        interessado: dfdProtocolos.interessado,
        anoPca: dfdProtocolos.anoPca,
        pcaId: dfdProtocolos.pcaId,
        reparticaoId: dfdProtocolos.reparticaoId,
        criadoEm: dfdProtocolos.criadoEm,
      })
      .from(dfdProtocolos),
    db
      .select({
        protocoloId: dfds.protocoloId,
        numero: dfds.numero,
        planejamento: dfds.planejamento,
        anoPca: dfds.anoPca,
        orgaoId: dfds.orgaoId,
        orgaoEntidade: dfds.orgaoEntidade,
        sigla: dfds.siglaSetor,
        reparticaoId: dfds.reparticaoId,
        itens: dfds.totalItens,
        valor: dfds.valorTotal,
      })
      .from(dfds)
      .where(isNotNull(dfds.protocoloId)),
    db.select({ id: pcas.id, nome: pcas.nome }).from(pcas),
    db.select({ id: reparticoes.id, codigo: reparticoes.codigo }).from(reparticoes),
    db.select({ id: orgaos.id, nome: orgaos.nome, sigla: orgaos.sigla }).from(orgaos),
  ]);
  const nomePca = new Map(planos.map((p) => [p.id, p.nome]));
  const siglaUnidade = new Map(unidades.map((u) => [u.id, u.codigo]));
  const orgao = new Map(orgs.map((o) => [o.id, o.sigla || o.nome]));
  const porProto = new Map<number, { dfds: ProtocoloAutomacao["dfds"]; siglas: string[]; anos: string[]; itens: number; valor: number }>();
  for (const d of lista) {
    if (d.protocoloId == null) continue;
    const g = porProto.get(d.protocoloId) ?? { dfds: [], siglas: [], anos: [], itens: 0, valor: 0 };
    g.itens += d.itens ?? 0;
    g.valor += d.valor ?? 0;
    if (d.anoPca != null) g.anos.push(String(d.anoPca));
    const nomeOrgao = d.orgaoId != null ? (orgao.get(d.orgaoId) ?? null) : null;
    g.dfds.push({
      numero: d.numero,
      planejamento: d.planejamento ?? null,
      anoPca: d.anoPca ?? null,
      orgao: chaveOrgaoCenti(d.orgaoId, d.orgaoEntidade),
      orgaoNome: nomeOrgao ?? (d.orgaoEntidade?.trim() || null),
      sigla: (d.reparticaoId != null ? siglaUnidade.get(d.reparticaoId) : null) ?? (d.sigla?.trim() || null),
    });
    if (d.sigla?.trim()) g.siglas.push(d.sigla.trim());
    porProto.set(d.protocoloId, g);
  }
  // A sigla do protocolo: a da unidade dele; sem unidade, a mais frequente entre os DFDs. O ano do PCA: o do protocolo;
  // o protocolo ANTIGO sem ano fica com o dos DFDs dele (a mesma régua da Mesa).
  const maisFrequente = (xs: string[]) => {
    const n = new Map<string, number>();
    for (const x of xs) n.set(x, (n.get(x) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  };
  return protos
    .map((p) => {
      const g = porProto.get(p.id);
      return {
        id: p.id,
        numero: p.numero,
        idExterno: p.idExterno ?? null,
        assunto: p.assunto ?? null,
        interessado: p.interessado ?? null,
        sigla: (p.reparticaoId != null ? siglaUnidade.get(p.reparticaoId) : null) ?? maisFrequente(g?.siglas ?? []),
        anoPca: p.anoPca ?? (Number(maisFrequente(g?.anos ?? [])) || null),
        pca: p.pcaId != null ? (nomePca.get(p.pcaId) ?? null) : null,
        criadoEm: p.criadoEm ?? null,
        itens: g?.itens ?? 0,
        valor: Math.round((g?.valor ?? 0) * 100) / 100,
        dfds: (g?.dfds ?? []).sort((a, b) => a.numero.localeCompare(b.numero, "pt-BR", { numeric: true })),
      };
    })
    .sort((a, b) => b.id - a.id);
}
