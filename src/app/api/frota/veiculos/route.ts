import { eq, sql } from "drizzle-orm";
import { frotaVeiculos, orgaos, reparticoes } from "@/db/schema";
import { exigirAcesso } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { getDb } from "@/lib/db";
import { escopoDaFrota, listarClassificacoesFrota, veiculosDoEscopo } from "@/lib/frota";
import { aplicarTravaOrigem } from "@/lib/frota-core";
import { veiculosEdicaoSchema } from "@/lib/frota-validation";
import { erro, ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

/** O CADASTRO dos veículos no escopo da pessoa + as classificações (as telas da frota juntam pela placa). */
export async function GET() {
  const g = await exigirAcesso(["veiculos", "frotas", "combustivel", "manutencao"], "visualizar");
  if ("erro" in g) return g.erro;
  // As unidades do cadastro com o ÓRGÃO de cada uma (as colunas Unidade e Órgão do cadastro dos veículos).
  const unidades = getDb()
    .select({ id: reparticoes.id, codigo: reparticoes.codigo, nome: reparticoes.nome, orgao: sql<string | null>`COALESCE(NULLIF(${orgaos.sigla}, ''), ${orgaos.nome})`, orgaoNome: orgaos.nome })
    .from(reparticoes)
    .leftJoin(orgaos, eq(orgaos.id, reparticoes.orgaoId))
    .where(sql`${reparticoes.codigo} <> 'GERAL'`)
    .orderBy(reparticoes.ordem, reparticoes.id);
  const [veiculos, classificacoes, us] = await Promise.all([veiculosDoEscopo(await escopoDaFrota()), listarClassificacoesFrota(), unidades]);
  return ok({ veiculos, classificacoes, unidades: us });
}

/**
 * EDITA o cadastro (só o que mudou de cada placa — também em massa e pela planilha). Só os veículos do escopo da pessoa; a
 * ORIGEM manda: o próprio não tem locação nem contrato; o de contrato não tem FIPE (gravados vazios).
 */
export async function PATCH(req: Request) {
  const g = await exigirAcesso("veiculos", "manipular");
  if ("erro" in g) return g.erro;
  const p = await parseCorpo(veiculosEdicaoSchema, req);
  if ("resp" in p) return p.resp;
  const atuais = new Map((await veiculosDoEscopo(await escopoDaFrota())).map((v) => [v.placa, v]));
  const fora = p.data.alteracoes.filter((a) => !atuais.has(a.placa)).map((a) => a.placa);
  if (fora.length) return erro(`Placa fora do cadastro ou do seu escopo: ${fora.slice(0, 5).join(", ")}${fora.length > 5 ? "…" : ""}.`, 422);
  const db = getDb();
  const cmds = p.data.alteracoes.map((a) => {
    const atual = atuais.get(a.placa) as NonNullable<ReturnType<typeof atuais.get>>;
    const { placa, ...campos } = a;
    const final = aplicarTravaOrigem({ ...atual, ...campos });
    return db
      .update(frotaVeiculos)
      .set({
        tipo: final.tipo,
        classificacaoId: final.classificacaoId,
        ano: final.ano,
        situacao: final.situacao,
        origem: final.origem,
        fipe: final.fipe,
        locacao: final.locacao,
        contrato: final.contrato,
        capacidadeTanque: final.capacidadeTanque,
        reparticaoId: final.reparticaoId,
        observacao: final.observacao,
        atualizadoEm: sql`CURRENT_TIMESTAMP`,
        atualizadoPor: g.u.nome,
      })
      .where(eq(frotaVeiculos.placa, placa));
  });
  for (let i = 0; i < cmds.length; i += 100) await db.batch(cmds.slice(i, i + 100) as never);
  await registrarAuditoria({
    usuario: g.u,
    acao: "editar",
    entidade: "veiculo",
    resumo: `Veículos: ${p.data.alteracoes.length} placa(s) — ${p.data.alteracoes
      .slice(0, 8)
      .map((a) => a.placa)
      .join(", ")}${p.data.alteracoes.length > 8 ? "…" : ""}`,
  });
  return ok({ alterados: cmds.length });
}
