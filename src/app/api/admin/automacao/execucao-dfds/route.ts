import { eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { dfdProtocolos, dfds, orgaos, reparticoes } from "@/db/schema";
import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { getDb } from "@/lib/db";
import { classeExecucao, limparSituacao, planoExecucao, situacoesDaGrade } from "@/lib/execucao-centi";
import { ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

const LOTE = 50;

const lerDfds = () =>
  getDb()
    .select({
      id: dfds.id,
      numero: dfds.numero,
      planejamento: dfds.planejamento,
      valor: dfds.valorTotal,
      tipo: dfds.tipo,
      objeto: dfds.objeto,
      totalItens: dfds.totalItens,
      execucaoCenti: dfds.execucaoCenti,
      execucaoCentiEm: dfds.execucaoCentiEm,
      orgaoId: dfds.orgaoId,
      orgaoEntidade: dfds.orgaoEntidade,
      orgaoNome: orgaos.nome,
      // As colunas da planilha de DFDs da Mesa (a tabela das automações): a unidade, o protocolo e a conferência.
      sigla: reparticoes.codigo,
      protocolo: dfdProtocolos.numero,
      protocoloId: dfds.protocoloId,
      conferenciaCenti: dfds.conferenciaCenti,
      conferenciaCentiMotivo: dfds.conferenciaCentiMotivo,
    })
    .from(dfds)
    .leftJoin(orgaos, eq(orgaos.id, dfds.orgaoId))
    .leftJoin(reparticoes, eq(reparticoes.id, dfds.reparticaoId))
    .leftJoin(dfdProtocolos, eq(dfdProtocolos.id, dfds.protocoloId))
    .where(isNotNull(dfds.planejamento));

/** Os DFDs com nº de planejamento e a situação da Centi já gravada (a tela da Automação). */
export async function GET() {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  return ok({ dfds: await lerDfds() });
}

const corpoSchema = z.strictObject({
  colunas: z.array(z.string().max(80)).max(60),
  linhas: z.array(z.strictObject({ valores: z.array(z.string().max(400)).max(60), id: z.string().max(20).optional() })).max(20000),
  /** Só os DFDs da ENTIDADE lida (o ID do planejamento só vale dentro da entidade da Centi). */
  dfdIds: z.array(z.number().int().positive()).min(1).max(20000),
});

/** A grade lida da CM002 → a situação de cada DFD do mesmo planejamento (grava só o que mudou). */
export async function POST(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const p = await parseCorpo(corpoSchema, req);
  if ("resp" in p) return p.resp;
  const situacoes = situacoesDaGrade(p.data.colunas, p.data.linhas);
  const escopo = new Set(p.data.dfdIds);
  const plano = planoExecucao((await lerDfds()).filter((d) => escopo.has(d.id)), situacoes);
  const em = new Date().toISOString();
  const db = getDb();
  for (let i = 0; i < plano.atualizar.length; i += LOTE) {
    const fatia = plano.atualizar.slice(i, i + LOTE).map((a) =>
      db
        .update(dfds)
        .set({ execucaoCenti: limparSituacao(a.situacao), execucaoCentiEm: em })
        .where(eq(dfds.id, a.id)),
    );
    if (fatia.length) await db.batch(fatia as [(typeof fatia)[number], ...typeof fatia]);
  }
  const conta = { executado: 0, cancelado: 0, outro: 0, ausente: 0 };
  for (const l of plano.linhas) conta[classeExecucao(l.situacao) ?? "ausente"]++;
  await registrarAuditoria({
    usuario: g.u,
    acao: "importar",
    entidade: "automacao",
    origem: "centi",
    resumo: `Execução dos DFDs (CM002): ${situacoes.size} planejamento(s) lidos · ${plano.atualizar.length} DFD(s) atualizado(s) · ${conta.executado} executado(s), ${conta.cancelado} cancelado(s), ${conta.outro} outra situação, ${conta.ausente} não encontrado(s)`,
  });
  return ok({ lidos: situacoes.size, atualizados: plano.atualizar.length, semPlanejamento: plano.semPlanejamento, linhas: plano.linhas, em });
}
