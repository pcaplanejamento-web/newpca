import { eq } from "drizzle-orm";
import { z } from "zod";
import { dfds } from "@/db/schema";
import { dfdLegivelNaMesa, escopoMesa, MSG_SEM_ACESSO_DFD } from "@/lib/acesso-mesa";
import { exigirAcesso, exigirSessao, intId, recusa } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { comandoApagarRetratos, comandosHistoricoCenti, consultaHistoricoCenti, consultaRetrato } from "@/lib/conferencia-centi-sql";
import {
  type AceiteCenti,
  chaveMotivo,
  conferenciaDoRetrato,
  lerAceite,
  lerRetrato,
  MAX_JUSTIFICATIVA,
  MIN_JUSTIFICATIVA,
} from "@/lib/conferencia-dfd-centi";
import { getDb } from "@/lib/db";
import { getDfd, getDfdReparticao } from "@/lib/dfd";
import { erro, ok, parseCorpo } from "@/lib/http";
import { telaDoRecurso } from "@/lib/papeis-core";
import { sincronizarDfdNoPca } from "@/lib/pca-sincronia";

export const dynamic = "force-dynamic";

/** O HISTÓRICO da conferência DESTE DFD com a Centi (as 20 últimas mudanças) — ou, com `?retrato=1`, o RETRATO do DFD
 * lido na Centi (a correção campo a campo). O mesmo escopo do histórico do DFD. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirAcesso(["dfd", "pca"], "visualizar");
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const dfd = await getDfdReparticao(id);
  if (!dfd) return erro("DFD não encontrado.", 404);
  const esc = await escopoMesa();
  if (!esc || !(await dfdLegivelNaMesa(esc, { ...dfd, id }))) return erro(MSG_SEM_ACESSO_DFD, 403);
  const db = getDb();
  if (new URL(req.url).searchParams.get("retrato") === "1") {
    const [r] = await consultaRetrato(db, id);
    const retrato = lerRetrato(r?.retrato);
    return ok({ retrato, em: r?.em ?? null });
  }
  return ok({ historico: await consultaHistoricoCenti(db, id) });
}

const corpoSchema = z.discriminatedUnion("acao", [
  z.strictObject({ acao: z.literal("recalcular") }),
  z.strictObject({ acao: z.literal("aceitar"), justificativa: z.string().trim().min(MIN_JUSTIFICATIVA, `Justifique com ao menos ${MIN_JUSTIFICATIVA} caracteres.`).max(MAX_JUSTIFICATIVA) }),
  z.strictObject({ acao: z.literal("desfazerAceite") }),
  z.strictObject({
    acao: z.literal("planejamento"),
    planejamento: z.string().trim().regex(/^\d{1,12}$/, "O nº de planejamento tem só dígitos."),
    justificativa: z.string().trim().min(MIN_JUSTIFICATIVA, `Justifique com ao menos ${MIN_JUSTIFICATIVA} caracteres.`).max(MAX_JUSTIFICATIVA),
  }),
]);

/**
 * TRATAR a conferência deste DFD com a Centi (Manipular na Mesa em que ele está):
 * - `recalcular` = refaz a conferência com o RETRATO guardado (sem a extensão) — depois de corrigir os dados;
 * - `aceitar` = a divergência é da Centi (justificada): "Convergente com ressalva" enquanto a divergência for a MESMA;
 * - `desfazerAceite`;
 * - `planejamento` = SÓ o Administrador corrige o nº de planejamento (identificador), com justificativa — a conferência
 *   e o retrato antigos saem (eram de outro planejamento); reconfira na Centi.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirSessao();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const p = await parseCorpo(corpoSchema, req);
  if ("resp" in p) return p.resp;
  const dfd = await getDfdReparticao(id);
  if (!dfd) return erro("DFD não encontrado.", 404);
  const esc = await escopoMesa();
  if (!esc || !esc.acessivel(dfd.reparticaoId) || !(await dfdLegivelNaMesa(esc, { ...dfd, id }))) return erro(MSG_SEM_ACESSO_DFD, 403);
  const negado = recusa(a.acesso, telaDoRecurso(dfd.pcaId), "manipular");
  if (negado) return negado;
  const db = getDb();
  const [atual] = await db
    .select({ status: dfds.conferenciaCenti, motivo: dfds.conferenciaCentiMotivo, aceite: dfds.conferenciaCentiAceite })
    .from(dfds)
    .where(eq(dfds.id, id))
    .limit(1);
  const ref = `DFD ${dfd.numero} (Planej. ${dfd.planejamento ?? ""})`;
  const em = new Date().toISOString();
  const porNome = a.u.nome ?? null;

  if (p.data.acao === "recalcular") {
    const [r] = await consultaRetrato(db, id);
    const retrato = lerRetrato(r?.retrato);
    if (!retrato) return erro("Este DFD não tem os dados da Centi guardados — reconfira na Centi (Automação).", 409);
    const sistema = await getDfd(id);
    if (!sistema) return erro("DFD não encontrado.", 404);
    const c = conferenciaDoRetrato(sistema, retrato);
    const mudou = atual?.status !== c.status || (atual?.motivo ?? null) !== c.motivo;
    const cmds = [
      db.update(dfds).set({ conferenciaCenti: c.status, conferenciaCentiMotivo: c.motivo, conferenciaCentiEm: em }).where(eq(dfds.id, id)),
      ...(mudou ? comandosHistoricoCenti(db, [{ dfdId: id, status: c.status, motivo: c.motivo, em, porNome }]) : []),
    ];
    await db.batch(cmds as [(typeof cmds)[number], ...typeof cmds]);
    // Sempre registra (a versão dos dados muda e a Mesa recarrega o selo).
    await registrarAuditoria({
      usuario: a.u,
      acao: "editar",
      entidade: "dfd",
      entidadeId: id,
      protocoloId: dfd.protocoloId,
      origem: "centi",
      resumo: `${ref}: conferência com a Centi refeita com os dados guardados de ${new Date(r?.em ?? em).toLocaleDateString("pt-BR")} — ${c.status === "convergente" ? "convergente" : "divergente"}`.slice(0, 500),
    });
    return ok({ status: c.status, motivo: c.motivo, em, mudou });
  }

  if (p.data.acao === "aceitar") {
    if (atual?.status !== "divergente") return erro("Só uma divergência pode ser aceita.", 409);
    const aceite: AceiteCenti = { chave: chaveMotivo(atual.motivo), justificativa: p.data.justificativa, por: porNome ?? "", em };
    await db.update(dfds).set({ conferenciaCentiAceite: JSON.stringify(aceite) }).where(eq(dfds.id, id));
    await registrarAuditoria({
      usuario: a.u,
      acao: "editar",
      entidade: "dfd",
      entidadeId: id,
      protocoloId: dfd.protocoloId,
      origem: "centi",
      resumo: `${ref}: divergência com a Centi ACEITA (convergente com ressalva) — ${p.data.justificativa}`.slice(0, 500),
    });
    return ok({ aceite });
  }

  if (p.data.acao === "desfazerAceite") {
    if (!lerAceite(atual?.aceite)) return ok({ aceite: null });
    await db.update(dfds).set({ conferenciaCentiAceite: null }).where(eq(dfds.id, id));
    await registrarAuditoria({ usuario: a.u, acao: "editar", entidade: "dfd", entidadeId: id, protocoloId: dfd.protocoloId, origem: "centi", resumo: `${ref}: aceite da divergência com a Centi desfeito` });
    return ok({ aceite: null });
  }

  // O nº de PLANEJAMENTO é identificador: só o Administrador o corrige (com justificativa).
  if (!a.u.admin) return erro("Só o Administrador corrige o nº de planejamento.", 403);
  const novo = p.data.planejamento;
  if (novo === (dfd.planejamento ?? "")) return erro("O nº de planejamento informado é o mesmo do DFD.", 422);
  await db.batch([
    db
      .update(dfds)
      .set({ planejamento: novo, conferenciaCenti: null, conferenciaCentiMotivo: null, conferenciaCentiEm: null, conferenciaCentiAceite: null })
      .where(eq(dfds.id, id)),
    comandoApagarRetratos(db, [id]),
  ]);
  // O PCA consolida pelo nº de planejamento: acompanha.
  await sincronizarDfdNoPca(id, a.u.id, "todos");
  await registrarAuditoria({
    usuario: a.u,
    acao: "editar",
    entidade: "dfd",
    entidadeId: id,
    protocoloId: dfd.protocoloId,
    origem: "centi",
    resumo: `DFD ${dfd.numero}: nº de planejamento corrigido de ${dfd.planejamento || "—"} para ${novo} — ${p.data.justificativa}`.slice(0, 500),
    detalhe: { alvo: { numero: dfd.numero, planejamento: novo }, campos: [{ campo: "planejamento", rotulo: "Nº de planejamento", antes: dfd.planejamento || "—", depois: novo }] },
  });
  return ok({ planejamento: novo });
}
