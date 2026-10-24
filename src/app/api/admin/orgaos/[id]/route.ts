import { eq, sql } from "drizzle-orm";
import { orgaos, reparticoes } from "@/db/schema";
import { exigirAdmin, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { getDb } from "@/lib/db";
import { erro, ok, parseCorpo } from "@/lib/http";
import { numeroInteressadoEmUso, orgaoTemVinculo } from "@/lib/orgaos";
import { orgaoSchema } from "@/lib/rbac-validation";
import { comandosDoPlano, planejarRealinhamento, resumoRealinhamento } from "@/lib/responsaveis";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const corpo = await parseCorpo(orgaoSchema, req);
  if ("resp" in corpo) return corpo.resp;
  const numeroInteressado = corpo.data.numeroInteressado?.trim() || null;
  if (numeroInteressado && (await numeroInteressadoEmUso(numeroInteressado, { orgaoId: id })))
    return erro("Este Nº do interessado já está em uso por outro órgão ou unidade.", 409);
  // Os RESPONSÁVEIS acompanham a regra de assinatura no MESMO lote: com a regra nova, cada vínculo vai ao lugar que vale
  // (ligar a única = as unidades → o órgão; desligar = o órgão → a unidade própria, a única unidade ou as escolhidas).
  const { plano, config } = await planejarRealinhamento(
    (c) => ({ ...c, orgaos: c.orgaos.map((o) => (o.id === id ? { ...o, assinaturaUnica: corpo.data.assinaturaUnica, oculto: corpo.data.oculto } : o)) }),
    corpo.data.destinosVinculos ? { [id]: corpo.data.destinosVinculos } : {},
  );
  const ambiguo = plano.ambiguos.find((a) => a.orgaoId === id);
  if (ambiguo)
    return Response.json(
      {
        ok: false,
        error: `O órgão tem ${ambiguo.vinculos.length} responsável(is) e ${ambiguo.unidades.length} unidades — escolha para quais unidades eles vão.`,
        escolherUnidades: config.unidades.filter((u) => ambiguo.unidades.includes(u.id)).map((u) => ({ id: u.id, codigo: u.codigo, nome: u.nome })),
        vinculos: ambiguo.vinculos.length,
      },
      { status: 409 },
    );
  const db = getDb();
  await db.batch([
    db
      .update(orgaos)
      .set({
        sigla: corpo.data.sigla,
        nome: corpo.data.nome,
        orgaoEntidade: corpo.data.orgaoEntidade ?? null,
        numeroInteressado,
        ...(corpo.data.entidadeCenti === undefined ? {} : { entidadeCenti: corpo.data.entidadeCenti?.trim() || null }),
        assinaturaUnica: corpo.data.assinaturaUnica,
        oculto: corpo.data.oculto,
        atualizadoEm: sql`(CURRENT_TIMESTAMP)`,
      })
      .where(eq(orgaos.id, id)),
    ...comandosDoPlano(plano),
  ]);
  const realinhado = resumoRealinhamento(plano);
  await registrarAuditoria({
    usuario: guard.u,
    acao: "editar",
    entidade: "orgao",
    entidadeId: id,
    resumo: `Órgão "${corpo.data.nome}" editado${realinhado ? ` — responsáveis realinhados: ${realinhado}` : ""}`,
    depois: { nome: corpo.data.nome, sigla: corpo.data.sigla, entidadeCenti: corpo.data.entidadeCenti ?? undefined, assinaturaUnica: corpo.data.assinaturaUnica, oculto: corpo.data.oculto },
  });
  return ok({ realinhado });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  // Ponto 8: não exclui órgão com DFD/protocolo vinculado (direto ou via unidades) — só OCULTA.
  if (await orgaoTemVinculo(id))
    return erro("Este órgão tem DFD/protocolo vinculado — não pode ser excluído. Oculte-o (deixa de aparecer para novos documentos, sem perder o histórico).", 409);
  // Toda unidade pertence a um órgão: excluir o órgão exclui as unidades dele (no MESMO lote). Sem vínculo de DFD/protocolo
  // (conferido acima, também pelas unidades), só cai o acesso grupo ↔ unidade (cascade).
  const db = getDb();
  const unidades = await db.select({ id: reparticoes.id, codigo: reparticoes.codigo }).from(reparticoes).where(eq(reparticoes.orgaoId, id));
  await db.batch([db.delete(reparticoes).where(eq(reparticoes.orgaoId, id)), db.delete(orgaos).where(eq(orgaos.id, id))]);
  await registrarAuditoria({
    usuario: guard.u,
    acao: "excluir",
    entidade: "orgao",
    entidadeId: id,
    resumo: `Órgão #${id} excluído${unidades.length ? ` com ${unidades.length} unidade(s): ${unidades.map((u) => u.codigo).join(", ")}` : ""}`,
  });
  return ok();
}
