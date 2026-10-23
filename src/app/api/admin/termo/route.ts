import { and, eq, sql } from "drizzle-orm";
import { usuarios } from "@/db/schema";
import { exigirAdmin } from "@/lib/api-auth";
import { gravarAcessoConta, getAcessoConta } from "@/lib/acesso-conta";
import { lerConfigAcessoConta, pessoasDasRegras } from "@/lib/acesso-conta-core";
import { termoAdminSchema } from "@/lib/acesso-validation";
import { comandosLimparTesteAparelhos } from "@/lib/aparelhos-sql";
import { registrarAuditoria } from "@/lib/auditoria";
import { getDb } from "@/lib/db";
import { erro, ok, parseCorpo } from "@/lib/http";
import { exigirAceite, listarVersoes, previaDoTermo, publicarTermo, rascunho, salvarRascunho, termoDesatualizado, termoPorId, termoVigente } from "@/lib/termo-uso";
import { comandoPendencias, comandoRevogarAceites, comandosLimparTesteTermo, comandoTirarPendenciasFora } from "@/lib/termos-sql";
import { termosPendencias } from "@/db/schema";
import { notificar } from "@/lib/notificacoes";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Tudo da aba "Termo de uso": a implantação, os aparelhos, o rascunho, as versões e o aviso de termo desatualizado. */
export async function GET() {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const [config, r, versoes, vigente] = await Promise.all([getAcessoConta({ fresco: true }), rascunho(), listarVersoes(), termoVigente()]);
  return ok({ config, rascunho: r, versoes, vigenteId: vigente?.id ?? null, desatualizado: await termoDesatualizado(vigente) });
}

export async function POST(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const corpo = await parseCorpo(termoAdminSchema, req);
  if ("resp" in corpo) return corpo.resp;
  const d = corpo.data;
  const db = getDb();

  if (d.acao === "previa") {
    const r = await rascunho();
    return ok(await previaDoTermo({ textoAdm: d.textoAdm, versao: r.versao }));
  }
  if (d.acao === "salvar") {
    const id = await salvarRascunho({ textoAdm: d.textoAdm });
    await registrarAuditoria({ usuario: g.u, acao: "editar", entidade: "termo_uso", entidadeId: id, resumo: "Rascunho do Termo de Uso salvo" });
    return ok({ id });
  }
  if (d.acao === "publicar") {
    const t = await publicarTermo(g.u.nome, d.publico);
    if (!t) return erro("Salve o rascunho antes de publicar (ou ele já foi publicado).", 409);
    await registrarAuditoria({ usuario: g.u, acao: "criar", entidade: "termo_uso", entidadeId: t.id, resumo: `Termo de Uso versão ${t.versao} publicado — público: ${d.publico.tipo}` });
    return ok({ id: t.id, versao: t.versao });
  }
  if (d.acao === "exigir") {
    const t = await termoPorId(d.termoId);
    if (t?.estado !== "publicado") return erro("Versão não encontrada.", 404);
    await exigirAceite(t.id, d.publico);
    await registrarAuditoria({ usuario: g.u, acao: "editar", entidade: "termo_uso", entidadeId: t.id, resumo: `Aceite da versão ${t.versao} exigido — público: ${d.publico.tipo}` });
    return ok();
  }

  if (d.acao === "revogar") {
    const t = await termoPorId(d.termoId);
    if (t?.estado !== "publicado") return erro("Versão não encontrada.", 404);
    const cfg = await getAcessoConta({ fresco: true });
    const [saiu] = await db.batch([comandoRevogarAceites(db, t.id, d.aceiteIds)]);
    if (!saiu.length) return erro("Nenhuma assinatura encontrada nesta versão.", 404);
    // Quem perdeu a assinatura deve de novo (só quem as regras alcançam; o desligado não exige nada).
    const valem = pessoasDasRegras(cfg);
    const devem = saiu.map((a) => a.usuarioId).filter((u): u is number => u != null && (!valem || valem.includes(u)));
    if (devem.length && cfg.modo !== "desligado") await comandoPendencias(db, t.id, { ids: devem }, new Date().toISOString()).run();
    await registrarAuditoria({
      usuario: g.u,
      acao: "excluir",
      entidade: "termo_uso",
      entidadeId: t.id,
      resumo: `${saiu.length} assinatura(s) da versão ${t.versao} excluída(s) — o aceite é exigido de novo: ${saiu.slice(0, 30).map((a) => `${a.nome} (código ${a.codigo})`).join("; ")}${saiu.length > 30 ? ` e mais ${saiu.length - 30}` : ""}`,
    });
    return ok({ revogados: saiu.length, exigidos: devem.length });
  }
  if (d.acao === "lembrar") {
    const vigente = await termoVigente();
    if (!vigente) return erro("Nenhum termo em vigor.", 409);
    const pend = await db.select({ u: termosPendencias.usuarioId }).from(termosPendencias).where(eq(termosPendencias.termoId, vigente.id));
    if (!pend.length) return ok({ avisados: 0 });
    await notificar(
      pend.map((p) => ({ usuarioId: p.u, tipo: "comunicado" as const, titulo: "Aceite o Termo de Uso", texto: `A versão ${vigente.versao} do Termo de Uso aguarda o seu aceite. Ao entrar no sistema, leia e confirme.`, link: "/painel", atorId: g.u.id, atorNome: g.u.nome })),
      g.u.id,
    );
    await registrarAuditoria({ usuario: g.u, acao: "editar", entidade: "termo_uso", entidadeId: vigente.id, resumo: `Lembrete do aceite da versão ${vigente.versao} enviado a ${pend.length} pessoa(s)` });
    return ok({ avisados: pend.length });
  }

  // A CONFIGURAÇÃO (implantação + aparelhos + encarregado).
  const antes = await getAcessoConta({ fresco: true });
  const nova = lerConfigAcessoConta(d.config);
  if (nova.modo === "ativo" && nova.alcance === "escolhidos" && !nova.exigidos.length) {
    return erro("Escolha ao menos uma pessoa que deve aceitar o termo (ou use Todos).", 422);
  }
  const paraAtivo = nova.modo === "ativo" && antes.modo !== "ativo";
  const escopoMudou = nova.modo === "ativo" && antes.modo === "ativo" && (nova.alcance !== antes.alcance || nova.exigidos.join() !== antes.exigidos.join() || nova.testadores.join() !== antes.testadores.join());
  if ((paraAtivo || escopoMudou) && !d.confirmarAtivo) {
    const alvo = pessoasDasRegras(nova);
    const [c] = await db
      .select({ n: sql<number>`COUNT(*)` })
      .from(usuarios)
      .where(alvo ? and(eq(usuarios.status, "ativo"), sql`${usuarios.id} IN (SELECT value FROM json_each(${JSON.stringify(alvo)}))`) : eq(usuarios.status, "ativo"));
    // No ativo, contam só os que ainda não aceitaram a versão vigente (os que já aceitaram não são travados).
    const vig = await termoVigente();
    const [ja] = vig && !paraAtivo
      ? await db
          .select({ n: sql<number>`COUNT(*)` })
          .from(usuarios)
          .where(and(eq(usuarios.status, "ativo"), alvo ? sql`usuarios.id IN (SELECT value FROM json_each(${JSON.stringify(alvo)}))` : sql`1`, sql`EXISTS (SELECT 1 FROM termos_aceites ta WHERE ta.usuario_id = usuarios.id AND ta.termo_id = ${vig.id} AND ta.teste = 0)`))
      : [{ n: 0 }];
    return NextResponse.json({ ok: false, error: "Confirme a mudança de quem precisa aceitar.", precisaConfirmar: true, afetados: Math.max(0, (c?.n ?? 0) - (ja?.n ?? 0)), ativando: paraAtivo }, { status: 409 });
  }
  if (paraAtivo) await db.batch([...comandosLimparTesteTermo(db), ...comandosLimparTesteAparelhos(db)]);
  const salva = await gravarAcessoConta(nova, g.u.id);
  // As pendências da versão vigente para quem as regras passaram a valer (no teste, os testadores; no ativo, todos).
  const vigente = await termoVigente();
  if (vigente && salva.modo !== "desligado" && (paraAtivo ||
      salva.modo !== antes.modo ||
      salva.alcance !== antes.alcance ||
      salva.exigidos.join() !== antes.exigidos.join() ||
      salva.testadores.join() !== antes.testadores.join())) {
    await exigirAceite(vigente.id, { tipo: "todos" }, salva);
  }
  // Quem saiu da lista não deve mais nada (as pendências dele saem do banco).
  const manter = pessoasDasRegras(salva);
  if (manter && salva.modo !== "desligado") await comandoTirarPendenciasFora(db, manter).run();
  await registrarAuditoria({
    usuario: g.u,
    acao: "editar",
    entidade: "termo_uso",
    entidadeId: 0,
    resumo: `Termo/aparelhos: implantação ${antes.modo} → ${salva.modo}; alcance ${salva.alcance === "todos" ? "todos" : `${salva.exigidos.length} pessoa(s)`}; testadores ${salva.testadores.length}; repetir ${salva.repetirAoEntrar ? "sim" : "não"}; limite ${salva.limite}; troca ${salva.trocaDias} dia(s); ADM isento ${salva.isentarAdm ? "sim" : "não"}; aceite fecha em ${salva.fecharAceiteS ? `${salva.fecharAceiteS} s` : "não fecha sozinho"}; tela de aceite ${salva.telaAceito ? "sim" : "não"}; baixar comprovante ${salva.baixarComprovante ? "sim" : "só visualizar"}; cláusulas desligadas: ${salva.clausulasOff.join(", ") || "nenhuma"}`,
  });
  return ok({ config: salva });
}
