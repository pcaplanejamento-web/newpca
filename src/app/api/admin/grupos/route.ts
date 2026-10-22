import { asc, desc, eq } from "drizzle-orm";
import { grupoReparticoes, grupos, orcamentos, pcas, reparticoes, usuarioGrupos, usuarioReparticoes, usuarios } from "@/db/schema";
import { compactarEscopoTelas, compactarFontesAbas, lerEscopoTelas, lerFontesAbas } from "@/lib/escopo-unidades-core";
import { abasConhecidas } from "@/lib/abas";
import { getModulosFresco } from "@/lib/modulos";
import { lerModulosGrupo, motivoModulosInvalidos, telasDoGrupo, telasDosModulos } from "@/lib/modulos-core";
import { lerPcasGrupo } from "@/lib/acesso";
import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { getDb } from "@/lib/db";
import { erro, ok, parseCorpo } from "@/lib/http";
import { comandosMembros, comandosUnidades, motivoIdsInvalidos } from "@/lib/rbac-sql";
import { grupoCreateSchema } from "@/lib/rbac-validation";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;
  const db = getDb();
  const [lista, listaPcas, listaOrcs, users, reps, vincUsu, vincRep, modulos, extras] = await Promise.all([
    db.select({ id: grupos.id, nome: grupos.nome, abas: grupos.abas, pcas: grupos.pcas, modulos: grupos.modulos, chat: grupos.chat, modoUnidades: grupos.modoUnidades, escopoTelas: grupos.escopoTelas, orcamentos: grupos.orcamentos, fontesAbas: grupos.fontesAbas }).from(grupos).orderBy(grupos.nome),
    // Os PCAs que o grupo pode escolher (o mais recente primeiro).
    db.select({ id: pcas.id, nome: pcas.nome, ano: pcas.ano }).from(pcas).orderBy(desc(pcas.ano), desc(pcas.id)),
    db.select({ id: orcamentos.id, nome: orcamentos.nome, ano: orcamentos.ano }).from(orcamentos).orderBy(desc(orcamentos.ano), desc(orcamentos.id)),
    // Status: a tela marca quem está pendente/inativo (não conta como acesso ativo).
    db
      .select({ id: usuarios.id, nome: usuarios.nome, email: usuarios.email, status: usuarios.status, reparticaoId: usuarios.reparticaoId })
      .from(usuarios).orderBy(usuarios.nome),
    // Oculta: a unidade não aparece nos documentos novos (o selo avisa); a "Geral" (código GERAL) = todas as unidades.
    db
      .select({ id: reparticoes.id, codigo: reparticoes.codigo, nome: reparticoes.nome, oculto: reparticoes.oculto })
      .from(reparticoes)
      .orderBy(asc(reparticoes.ordem), asc(reparticoes.id)),
    db.select({ grupoId: usuarioGrupos.grupoId, usuarioId: usuarioGrupos.usuarioId }).from(usuarioGrupos),
    db.select({ grupoId: grupoReparticoes.grupoId, reparticaoId: grupoReparticoes.reparticaoId }).from(grupoReparticoes),
    getModulosFresco(),
    // As unidades ADICIONAIS de cada pessoa (a tela avisa quem do grupo "de cadastro" não tem nenhuma).
    db.select({ usuarioId: usuarioReparticoes.usuarioId, reparticaoId: usuarioReparticoes.reparticaoId }).from(usuarioReparticoes),
  ]);
  const membrosPorGrupo = new Map<number, number[]>();
  for (const v of vincUsu) {
    const arr = membrosPorGrupo.get(v.grupoId) ?? [];
    arr.push(v.usuarioId);
    membrosPorGrupo.set(v.grupoId, arr);
  }
  const repsPorGrupo = new Map<number, number[]>();
  for (const v of vincRep) {
    const arr = repsPorGrupo.get(v.grupoId) ?? [];
    arr.push(v.reparticaoId);
    repsPorGrupo.set(v.grupoId, arr);
  }
  return ok({
    grupos: lista.map((g) => {
      const avulsas = lerAbasGrupo(g.abas);
      const mods = lerModulosGrupo(g.modulos);
      return {
      id: g.id,
      nome: g.nome,
      /** `null` = grupo antigo (telas avulsas em `avulsas`, até o ADM escolher os módulos). */
      modulos: mods,
      avulsas,
      /** As telas que o grupo ABRE hoje (dos módulos). */
      abas: telasDoGrupo(modulos, mods, avulsas),
      chat: g.chat,
      modoUnidades: g.modoUnidades,
      escopoTelas: lerEscopoTelas(g.escopoTelas),
      pcas: lerPcasGrupo(g.pcas),
      orcamentos: lerPcasGrupo(g.orcamentos),
      fontesAbas: lerFontesAbas(g.fontesAbas),
      membros: membrosPorGrupo.get(g.id) ?? [],
      reparticoes: repsPorGrupo.get(g.id) ?? [],
      };
    }),
    modulos,
    pcas: listaPcas,
    orcamentos: listaOrcs,
    usuarios: users.map((u) => ({ ...u, outras: extras.filter((e) => e.usuarioId === u.id).map((e) => e.reparticaoId) })),
    reparticoes: reps,
  });
}

/** As telas gravadas no grupo (as chaves antigas `dashboard`/`protocolos` saem na leitura). */
function lerAbasGrupo(json: string) {
  try {
    return abasConhecidas(JSON.parse(json));
  } catch {
    return [];
  }
}

export async function POST(req: Request) {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;
  const corpo = await parseCorpo(grupoCreateSchema, req);
  if ("resp" in corpo) return corpo.resp;
  const { nome, modulos: mods, chat, pcas: pcasGrupo, orcamentos: orcsGrupo, fontesAbas: funcoesPedidas, membros, reparticoes: reps, modoUnidades, escopoTelas: escopoPedido } = corpo.data;
  const db = getDb();
  const modulos = await getModulosFresco();
  const invalido = motivoModulosInvalidos(mods, modulos) ?? (await motivoIdsInvalidos(db, corpo.data));
  if (invalido) return erro(invalido, 422);
  const abas = telasDosModulos(modulos, mods);
  const escopoTelas = compactarEscopoTelas(escopoPedido, abas);
  const fontesAbas = compactarFontesAbas(funcoesPedidas, abas).filter((c) => !escopoTelas[c]);
  const [row] = await db
    .insert(grupos)
    .values({ nome, modulos: JSON.stringify(mods), abas: JSON.stringify(abas), chat, modoUnidades, escopoTelas: JSON.stringify(escopoTelas), pcas: pcasGrupo == null ? null : JSON.stringify(pcasGrupo), orcamentos: orcsGrupo == null ? null : JSON.stringify(orcsGrupo), fontesAbas: fontesAbas.length ? JSON.stringify(fontesAbas) : null })
    .returning({ id: grupos.id });
  const grupoId = row.id;
  // Pessoas + unidades num LOTE (tudo ou nada); se falhar, o grupo recém-criado sai (nada fica pela metade).
  const comandos = [...comandosMembros(db, grupoId, membros), ...comandosUnidades(db, grupoId, reps)];
  try {
    await db.batch(comandos as [(typeof comandos)[number], ...(typeof comandos)[number][]]);
  } catch (e) {
    await db.delete(grupos).where(eq(grupos.id, grupoId));
    console.error("Falha ao gravar o grupo:", e);
    return erro("Não foi possível gravar as pessoas e unidades do grupo — nada foi criado. Tente de novo.", 500);
  }
  await registrarAuditoria({
    usuario: guard.u,
    acao: "criar",
    entidade: "grupo",
    entidadeId: grupoId,
    resumo: `Grupo "${nome}" criado (${mods.length} módulo(s), ${abas.length} tela(s), chat ${chat ? "liberado" : "bloqueado"}, ${pcasGrupo == null ? "todos os PCAs" : `${pcasGrupo.length} PCA(s)`}, ${orcsGrupo == null ? "todos os orçamentos" : `${orcsGrupo.length} orçamento(s)`}, ${fontesAbas.length} aba(s) em fonte única, ${membros.length} pessoa(s), ${modoUnidades === "cadastro" ? "unidade de cadastro de cada pessoa" : `${reps.length} unidade(s)`})`,
    depois: { nome, modulos: mods, abas, chat, pcas: pcasGrupo, orcamentos: orcsGrupo, fontesAbas, membros, reparticoes: reps, modoUnidades, escopoTelas },
  });
  return ok({ id: grupoId });
}
