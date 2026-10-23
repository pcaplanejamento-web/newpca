import { eq, sql } from "drizzle-orm";
import { usuarios } from "@/db/schema";
import { exigirAdmin } from "@/lib/api-auth";
import { gravarAcessoConta, getAcessoConta } from "@/lib/acesso-conta";
import { lerConfigAcessoConta } from "@/lib/acesso-conta-core";
import { termoAdminSchema } from "@/lib/acesso-validation";
import { comandosLimparTesteAparelhos } from "@/lib/aparelhos-sql";
import { registrarAuditoria } from "@/lib/auditoria";
import { getDb } from "@/lib/db";
import { erro, ok, parseCorpo } from "@/lib/http";
import { exigirAceite, listarVersoes, previaDoTermo, publicarTermo, rascunho, salvarRascunho, termoDesatualizado, termoPorId, termoVigente } from "@/lib/termo-uso";
import { comandosLimparTesteTermo } from "@/lib/termos-sql";
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

  // A CONFIGURAÇÃO (implantação + aparelhos + encarregado).
  const antes = await getAcessoConta({ fresco: true });
  const nova = lerConfigAcessoConta(d.config);
  const paraAtivo = nova.modo === "ativo" && antes.modo !== "ativo";
  if (paraAtivo && !d.confirmarAtivo) {
    const [c] = await db.select({ n: sql<number>`COUNT(*)` }).from(usuarios).where(eq(usuarios.status, "ativo"));
    return NextResponse.json({ ok: false, error: "Confirme a liberação para toda a plataforma.", precisaConfirmar: true, afetados: c?.n ?? 0 }, { status: 409 });
  }
  if (paraAtivo) await db.batch([...comandosLimparTesteTermo(db), ...comandosLimparTesteAparelhos(db)]);
  const salva = await gravarAcessoConta(nova, g.u.id);
  // As pendências da versão vigente para quem as regras passaram a valer (no teste, os testadores; no ativo, todos).
  const vigente = await termoVigente();
  if (vigente && salva.modo !== "desligado" && (paraAtivo || salva.modo !== antes.modo || salva.testadores.join() !== antes.testadores.join())) {
    await exigirAceite(vigente.id, { tipo: "todos" }, salva);
  }
  await registrarAuditoria({
    usuario: g.u,
    acao: "editar",
    entidade: "termo_uso",
    entidadeId: 0,
    resumo: `Termo/aparelhos: implantação ${antes.modo} → ${salva.modo}; testadores ${salva.testadores.length}; repetir ${salva.repetirAoEntrar ? "sim" : "não"}; limite ${salva.limite}; troca ${salva.trocaDias} dia(s); ADM isento ${salva.isentarAdm ? "sim" : "não"}; aceite fecha em ${salva.fecharAceiteS ? `${salva.fecharAceiteS} s` : "não fecha sozinho"}; cláusulas desligadas: ${salva.clausulasOff.join(", ") || "nenhuma"}`,
  });
  return ok({ config: salva });
}
