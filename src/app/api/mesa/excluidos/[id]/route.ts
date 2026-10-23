import { inArray } from "drizzle-orm";
import { reparticoes } from "@/db/schema";
import { escopoMesa } from "@/lib/acesso-mesa";
import { podePca } from "@/lib/acesso";
import { exigirSessao, intId, recusa } from "@/lib/api-auth";
import { getDb } from "@/lib/db";
import { erro, ok } from "@/lib/http";
import { dfdsDoProtocoloExcluido, excluidoVisivel, getExcluido, visualDoRetrato } from "@/lib/mesa-excluidos";
import { lerRetratoDfd, lerRetratoItem, lerRetratoProtocolo } from "@/lib/mesa-excluidos-core";
import { analisarRestauracao } from "@/lib/mesa-restauracao";
import { registrarAuditoria } from "@/lib/auditoria";

export const dynamic = "force-dynamic";

// Uma linha da lixeira COM o retrato (o banner do excluído, só leitura): o DFD no formato do `DfdView`; o protocolo com a
// capa e os DFDs excluídos junto (a cascata); o item com o DFD de onde saiu.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirSessao();
  if ("erro" in g) return g.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const e = await getExcluido(id);
  if (!e) return erro("Não encontrado.", 404);
  const negado = recusa(g.acesso, e.pcaId ? "pca" : "dfd", "visualizar");
  if (negado) return negado;
  if (e.pcaId && !podePca(g.acesso, e.pcaId)) return erro("Sem acesso a este PCA.", 403);
  const esc = await escopoMesa();
  if (!esc || !excluidoVisivel(esc, g.u.id, e)) return erro("Sem acesso.", 403);
  const { retrato, ...linha } = e;
  const cascata = e.tipo === "protocolo" && e.protocoloId ? (await dfdsDoProtocoloExcluido(e.protocoloId)).filter((d) => excluidoVisivel(esc, g.u.id, d)) : [];
  const ids = [...new Set([e.reparticaoId, ...cascata.map((d) => d.reparticaoId)].filter((v): v is number => v != null))];
  const reps = ids.length ? await getDb().select({ id: reparticoes.id, codigo: reparticoes.codigo, nome: reparticoes.nome }).from(reparticoes).where(inArray(reparticoes.id, ids)) : [];
  const rep = (rid: number | null) => reps.find((r) => r.id === rid) ?? null;
  const dfdLido = e.tipo === "dfd" ? lerRetratoDfd(retrato) : null;
  const plano = await analisarRestauracao(id, esc, g.u.id);
  return ok({
    restauracao: plano.ok ? { pode: true, resumo: plano.resumo } : { pode: false, motivo: plano.erro },
    excluido: linha,
    sigla: rep(e.reparticaoId)?.codigo ?? null,
    dfd: dfdLido ? visualDoRetrato(dfdLido, rep(e.reparticaoId)) : null,
    dfdExtra: dfdLido
      ? {
          protocoloNumero: dfdLido.protocoloNumero,
          orgaoNome: dfdLido.orgaoNome,
          siglaSetor: dfdLido.siglaSetor,
          nomeArquivo: dfdLido.nomeArquivo,
          criadoEm: dfdLido.criadoEm,
          criadoPorNome: dfdLido.criadoPorNome,
          atualizadoEm: dfdLido.atualizadoEm,
          execucaoCenti: dfdLido.execucaoCenti,
          conferenciaCenti: dfdLido.conferenciaCenti,
          conferenciaCentiMotivo: dfdLido.conferenciaCentiMotivo,
        }
      : null,
    protocolo: e.tipo === "protocolo" ? lerRetratoProtocolo(retrato) : null,
    item: e.tipo === "item" ? lerRetratoItem(retrato) : null,
    dfds: cascata.map(({ retrato: r, ...d }) => {
      const x = lerRetratoDfd(r);
      return { ...d, sigla: rep(d.reparticaoId)?.codigo ?? null, tipoDfd: x?.tipo ?? null, totalItens: x?.itens.length ?? 0 };
    }),
  });
}

// RESTAURAR (o retrato volta à Mesa com o MESMO id; a régua em `mesa-restauracao.ts`). Exige Importar na Mesa de onde saiu.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirSessao();
  if ("erro" in g) return g.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const e = await getExcluido(id);
  if (!e) return erro("Não encontrado.", 404);
  const negado = recusa(g.acesso, e.pcaId ? "pca" : "dfd", "importar");
  if (negado) return negado;
  if (e.pcaId && !podePca(g.acesso, e.pcaId)) return erro("Sem acesso a este PCA.", 403);
  const esc = await escopoMesa();
  if (!esc) return erro("Sem acesso.", 403);
  const plano = await analisarRestauracao(id, esc, g.u.id);
  if (!plano.ok) return erro(plano.erro, plano.status);
  try {
    await plano.executar({ id: g.u.id, nome: g.u.nome });
  } catch {
    return erro("Não foi possível restaurar: algo mudou na Mesa. Atualize e tente de novo.", 409);
  }
  const r = plano.resumo;
  await registrarAuditoria({
    usuario: g.u,
    acao: "criar",
    entidade: r.tipo === "protocolo" ? "protocolo" : "dfd",
    entidadeId: r.tipo === "item" ? (e.dfdId ?? null) : e.alvoId,
    protocoloId: e.protocoloId ?? null,
    origem: "restauracao",
    resumo: `Restaurado da lixeira: ${r.tipo === "protocolo" ? `protocolo ${r.numero} com ${r.voltam.length} DFD(s)` : r.tipo === "dfd" ? `DFD ${r.numero} em ${r.destino}` : `item ${r.numero ?? ""} em ${r.destino}`}`,
  });
  return ok({ resumo: r });
}
