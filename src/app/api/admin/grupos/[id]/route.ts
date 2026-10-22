import { eq, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { grupoReparticoes, grupos, orcamentos, pcas, usuarioGrupos } from "@/db/schema";
import { ABAS, abasConhecidas } from "@/lib/abas";
import { lerPcasGrupo } from "@/lib/acesso";
import { compactarEscopoTelas, compactarFontesAbas, type EscopoTelas, lerEscopoTelas, lerFontesAbas, rotuloFonte } from "@/lib/escopo-unidades-core";
import { getModulosFresco } from "@/lib/modulos";
import { lerModulosGrupo, type Modulo, motivoModulosInvalidos, telasDoGrupo, telasDosModulos } from "@/lib/modulos-core";
import { exigirAdmin, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { getDb } from "@/lib/db";
import { erro, ok, parseCorpo } from "@/lib/http";
import { apagaConteudo, comandosMembros, comandosUnidades, impactoDoGrupo, motivoIdsInvalidos, textoImpactoGrupo } from "@/lib/rbac-sql";
import { grupoPatchSchema } from "@/lib/rbac-validation";

export const dynamic = "force-dynamic";

/** O modo das unidades por extenso (histórico). */
const ROTULO_MODO = { lista: "escolhidas", cadastro: "de cadastro de cada pessoa" } as const;

type Db = ReturnType<typeof getDb>;

/** As telas marcadas "todas" por extenso (o histórico). */
const textoEscopo = (e: EscopoTelas) => ABAS.filter((a) => e[a.key] === "todas").map((a) => a.label).join(", ") || "nenhuma";

/** O grupo como está (nome, telas, PCAs, pessoas e unidades) — `null` = não existe. */
async function lerGrupo(db: Db, id: number, modulos: Modulo[]) {
  const [l] = await db
    .select({ nome: grupos.nome, abas: grupos.abas, pcas: grupos.pcas, modulos: grupos.modulos, chat: grupos.chat, modoUnidades: grupos.modoUnidades, escopoTelas: grupos.escopoTelas, orcamentos: grupos.orcamentos, fontesAbas: grupos.fontesAbas })
    .from(grupos)
    .where(eq(grupos.id, id))
    .limit(1);
  if (!l) return null;
  let abas: ReturnType<typeof abasConhecidas> = [];
  try {
    abas = abasConhecidas(JSON.parse(l.abas));
  } catch {
    abas = [];
  }
  const mods = lerModulosGrupo(l.modulos);
  // `abas` = as telas que o grupo ABRE hoje (dos módulos; o grupo antigo, das avulsas).
  const g = { nome: l.nome, modulos: mods, abas: telasDoGrupo(modulos, mods, abas), chat: l.chat, modoUnidades: l.modoUnidades, escopoTelas: lerEscopoTelas(l.escopoTelas), pcas: lerPcasGrupo(l.pcas), orcamentos: lerPcasGrupo(l.orcamentos), fontesAbas: lerFontesAbas(l.fontesAbas) };
  const [membros, reps] = await Promise.all([
    db.select({ id: usuarioGrupos.usuarioId }).from(usuarioGrupos).where(eq(usuarioGrupos.grupoId, id)),
    db.select({ id: grupoReparticoes.reparticaoId }).from(grupoReparticoes).where(eq(grupoReparticoes.grupoId, id)),
  ]);
  return { ...g, membros: membros.map((m) => m.id), reparticoes: reps.map((r) => r.id) };
}

/** "+2 −1 pessoas" — o que entrou e o que saiu de uma lista de ids. */
function trocaIds(antes: number[], depois: number[], rotulo: string): string | null {
  const a = new Set(antes);
  const d = new Set(depois);
  const entrou = depois.filter((x) => !a.has(x)).length;
  const saiu = antes.filter((x) => !d.has(x)).length;
  if (!entrou && !saiu) return null;
  return `${rotulo}: ${[entrou ? `+${entrou}` : "", saiu ? `−${saiu}` : ""].filter(Boolean).join(" ")}`;
}

/** As telas por nome, na ordem do menu ("Mesa, PCA"). */
const nomesTelas = (abas: readonly string[]) => ABAS.filter((a) => abas.includes(a.key)).map((a) => a.label).join(", ") || "nenhuma";

/** O IMPACTO de excluir o grupo (a tela confirma com ele antes). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const db = getDb();
  const [g] = await db.select({ nome: grupos.nome }).from(grupos).where(eq(grupos.id, id)).limit(1);
  if (!g) return erro("Grupo não encontrado.", 404);
  const impacto = await impactoDoGrupo(db, id);
  return ok({ nome: g.nome, impacto, texto: textoImpactoGrupo(impacto) });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const corpo = await parseCorpo(grupoPatchSchema, req);
  if ("resp" in corpo) return corpo.resp;
  const { nome, modulos: mods, chat, pcas: pcasGrupo, orcamentos: orcsGrupo, fontesAbas: funcoesPedidas, membros, reparticoes: reps, modoUnidades, escopoTelas: escopoPedido } = corpo.data;
  const db = getDb();
  const modulos = await getModulosFresco();
  const antes = await lerGrupo(db, id, modulos);
  if (!antes) return erro("Grupo não encontrado.", 404);
  const invalido = (mods ? motivoModulosInvalidos(mods, modulos) : null) ?? (await motivoIdsInvalidos(db, corpo.data));
  if (invalido) return erro(invalido, 422);

  // As telas vêm dos módulos (gravadas também em `abas` — o retrato do momento).
  const abas = mods ? telasDosModulos(modulos, mods) : undefined;
  // O escopo por tela guarda só as telas que o grupo ABRE (as de agora ou as novas).
  const escopoTelas = escopoPedido !== undefined ? compactarEscopoTelas(escopoPedido, abas ?? antes.abas) : undefined;
  // As funções desligadas: só as das telas que o grupo abre (as de agora ou as novas); trocar os módulos também as poda.
  const fontesAbas = funcoesPedidas !== undefined || abas ? compactarFontesAbas(funcoesPedidas ?? antes.fontesAbas, abas ?? antes.abas).filter((c) => !(escopoTelas ?? antes.escopoTelas)[c]) : undefined;
  // Tudo num LOTE: nome/módulos/chat/PCAs + pessoas + unidades (um id inválido nunca deixa o grupo pela metade).
  const comandos = [
    db
      .update(grupos)
      .set({
        ...(nome !== undefined ? { nome } : {}),
        ...(mods !== undefined ? { modulos: JSON.stringify(mods), abas: JSON.stringify(abas) } : {}),
        ...(chat !== undefined ? { chat } : {}),
        ...(modoUnidades !== undefined ? { modoUnidades } : {}),
        ...(escopoTelas !== undefined ? { escopoTelas: JSON.stringify(escopoTelas) } : {}),
        ...(pcasGrupo !== undefined ? { pcas: pcasGrupo == null ? null : JSON.stringify(pcasGrupo) } : {}),
        ...(orcsGrupo !== undefined ? { orcamentos: orcsGrupo == null ? null : JSON.stringify(orcsGrupo) } : {}),
        ...(fontesAbas !== undefined ? { fontesAbas: fontesAbas.length ? JSON.stringify(fontesAbas) : null } : {}),
        atualizadoEm: sql`(CURRENT_TIMESTAMP)`,
      })
      .where(eq(grupos.id, id)),
    ...(membros !== undefined ? comandosMembros(db, id, membros) : []),
    ...(reps !== undefined ? comandosUnidades(db, id, reps) : []),
  ];
  await db.batch(comandos as [(typeof comandos)[number], ...(typeof comandos)[number][]]);

  // Os PCAs por nome no histórico ("todos os PCAs" = sem restrição).
  const idsPca = [...new Set([...(antes.pcas ?? []), ...(pcasGrupo ?? [])])];
  const nomesPca = new Map(
    idsPca.length ? (await db.select({ id: pcas.id, nome: pcas.nome }).from(pcas).where(inArray(pcas.id, idsPca))).map((p) => [p.id, p.nome]) : [],
  );
  const idsOrc = [...new Set([...(antes.orcamentos ?? []), ...(orcsGrupo ?? [])])];
  const nomesOrc = new Map(
    idsOrc.length
      ? (await db.select({ id: orcamentos.id, nome: orcamentos.nome, ano: orcamentos.ano }).from(orcamentos).where(inArray(orcamentos.id, idsOrc))).map((o) => [o.id, `${o.nome} ${o.ano}`])
      : [],
  );
  const textoOrcs = (l: number[] | null) => (l == null ? "todos os orçamentos" : l.map((x) => nomesOrc.get(x) ?? `#${x}`).join(", ") || "nenhum orçamento");
  const textoFuncoes = (l: readonly string[]) => l.map((c) => rotuloFonte(c)).join(", ") || "nenhuma";
  const nomesModulos = (l: readonly string[] | null) => (l == null ? "telas avulsas" : l.map((x) => modulos.find((m) => m.id === x)?.nome ?? x).join(", ") || "nenhum");
  const textoPcas = (l: number[] | null) => (l == null ? "todos os PCAs" : l.map((x) => nomesPca.get(x) ?? `#${x}`).join(", ") || "nenhum PCA");
  const mesmaLista = (a: readonly number[] | readonly string[] | null, b: readonly number[] | readonly string[] | null) =>
    a == null || b == null ? a === b : a.length === b.length && [...a].every((x) => (b as readonly (number | string)[]).includes(x));
  const mudou = [
    nome !== undefined && nome !== antes.nome ? `nome: ${antes.nome} → ${nome}` : null,
    mods !== undefined && !mesmaLista(mods, antes.modulos) ? `módulos: ${nomesModulos(antes.modulos)} → ${nomesModulos(mods)}` : null,
    abas !== undefined && !mesmaLista(abas, antes.abas) ? `telas: ${nomesTelas(antes.abas)} → ${nomesTelas(abas)}` : null,
    chat !== undefined && chat !== antes.chat ? `chat ${chat ? "liberado" : "bloqueado"}` : null,
    pcasGrupo !== undefined && !mesmaLista(pcasGrupo, antes.pcas) ? `PCAs: ${textoPcas(antes.pcas)} → ${textoPcas(pcasGrupo)}` : null,
    orcsGrupo !== undefined && !mesmaLista(orcsGrupo, antes.orcamentos) ? `orçamentos: ${textoOrcs(antes.orcamentos)} → ${textoOrcs(orcsGrupo)}` : null,
    fontesAbas !== undefined && !mesmaLista(fontesAbas, antes.fontesAbas) ? `fontes únicas: ${textoFuncoes(antes.fontesAbas)} → ${textoFuncoes(fontesAbas)}` : null,
    membros !== undefined ? trocaIds(antes.membros, membros, "pessoas") : null,
    reps !== undefined ? trocaIds(antes.reparticoes, reps, "unidades") : null,
    modoUnidades !== undefined && modoUnidades !== antes.modoUnidades
      ? `unidades: ${ROTULO_MODO[antes.modoUnidades]} → ${ROTULO_MODO[modoUnidades]}`
      : null,
    escopoTelas !== undefined && textoEscopo(escopoTelas) !== textoEscopo(antes.escopoTelas)
      ? `telas com todas as unidades: ${textoEscopo(antes.escopoTelas)} → ${textoEscopo(escopoTelas)}`
      : null,
  ].filter((x): x is string => !!x);
  await registrarAuditoria({
    usuario: guard.u,
    acao: "editar",
    entidade: "grupo",
    entidadeId: id,
    resumo: `Grupo "${nome ?? antes.nome}"${mudou.length ? `: ${mudou.join("; ")}` : " salvo sem mudanças"}`,
    antes,
    depois: {
      nome: nome ?? antes.nome,
      modulos: mods ?? antes.modulos,
      abas: abas ?? antes.abas,
      chat: chat ?? antes.chat,
      pcas: pcasGrupo === undefined ? antes.pcas : pcasGrupo,
      orcamentos: orcsGrupo === undefined ? antes.orcamentos : orcsGrupo,
      fontesAbas: fontesAbas ?? antes.fontesAbas,
      membros: membros ?? antes.membros,
      reparticoes: reps ?? antes.reparticoes,
      modoUnidades: modoUnidades ?? antes.modoUnidades,
      escopoTelas: escopoTelas ?? antes.escopoTelas,
    },
  });
  return ok();
}

/** Excluir o grupo CASCATEIA: quadros de tarefas (com as tarefas), pastas e modelos do grupo somem junto — sem
 * `?confirmar=1`, responde 409 com o impacto (a tela mostra e pede a confirmação). */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const db = getDb();
  const [g] = await db.select({ nome: grupos.nome }).from(grupos).where(eq(grupos.id, id)).limit(1);
  if (!g) return erro("Grupo não encontrado.", 404);
  const impacto = await impactoDoGrupo(db, id);
  if (apagaConteudo(impacto) && new URL(req.url).searchParams.get("confirmar") !== "1")
    return NextResponse.json({ ok: false, error: `Confirme a exclusão: ${textoImpactoGrupo(impacto)}`, impacto }, { status: 409 });
  await db.delete(grupos).where(eq(grupos.id, id));
  await registrarAuditoria({
    usuario: guard.u,
    acao: "excluir",
    entidade: "grupo",
    entidadeId: id,
    resumo: `Grupo "${g.nome}" excluído — ${textoImpactoGrupo(impacto)}`,
    antes: { nome: g.nome, ...impacto },
  });
  return ok();
}
