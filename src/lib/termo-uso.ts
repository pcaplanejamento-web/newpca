import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { papeis, reparticoes, termosAceites, termosEmissoes, termosPendencias, termosUso, usuarioGrupos, usuarios } from "@/db/schema";
import { aceiteDeTeste, type ConfigAcessoConta, pessoasDasRegras } from "./acesso-conta-core";
import { getAcessoConta } from "./acesso-conta";
import { getAparencia } from "./aparencia";
import { getDb } from "./db";
import { NOME_SISTEMA_PADRAO } from "./email-core";
import { getIntegracoes } from "./integracoes";
import { googleConfigurado, resendConfigurado } from "./integracoes-core";
import { SENHA_INUTILIZAVEL } from "./google-oauth-core";
import { getConfigChat, getConfigPresenca } from "./presenca";
import { getConfigProtecao } from "./protecao";
import { resumoNavegador } from "./seguranca-core";
import { getConfigSeguranca } from "./seguranca";
import {
  assinaturaClausulas,
  type Clausula,
  clausulasAutomaticas,
  codigoDeBytes,
  codigoNormal,
  type ContextoClausulas,
  type DadosAceite,
  hashTexto,
  modeloTermo,
  montarTermo,
  NOME_TERMO,
  seloAceite,
} from "./termo-uso-core";
import { comandoPendencias, comandoPublicar, comandosAceitar, consultaTermoVigente, type PublicoTermo } from "./termos-sql";

// TERMO DE USO no banco — rascunho, publicação (congelada), pendências, aceite e verificação.

export type TermoUso = typeof termosUso.$inferSelect;

export async function nomeDoSistema(): Promise<string> {
  try {
    return (await getAparencia()).identidade?.nome?.trim() || NOME_SISTEMA_PADRAO;
  } catch {
    return NOME_SISTEMA_PADRAO;
  }
}

/** O contexto das cláusulas automáticas — as configurações REAIS de agora. */
export async function contextoClausulas(cfg?: ConfigAcessoConta): Promise<ContextoClausulas> {
  const [nomeSistema, acesso, seg, prot, pres, chat, integ] = await Promise.all([
    nomeDoSistema(),
    cfg ?? getAcessoConta(),
    getConfigSeguranca(),
    getConfigProtecao(),
    getConfigPresenca(),
    getConfigChat(),
    getIntegracoes(),
  ]);
  return {
    nomeSistema,
    acesso,
    inatividadeMin: seg.inatividadeMin,
    protecao: { ligada: prot.selecao || prot.print || prot.foco || prot.marca, copia: prot.selecao, impressao: prot.print, ocultar: prot.foco, marcaDagua: prot.marca },
    presenca: pres.ativo,
    chat: !!chat && pres.ativo && (chat.grupo || chat.privado),
    email: resendConfigurado(integ),
    google: googleConfigurado(integ),
  };
}

export async function termoVigente(): Promise<TermoUso | null> {
  const [t] = await consultaTermoVigente(getDb());
  return t ?? null;
}

export async function termoPorId(id: number): Promise<TermoUso | null> {
  const [t] = await getDb().select().from(termosUso).where(eq(termosUso.id, id)).limit(1);
  return t ?? null;
}

/** As versões (a mais nova primeiro), com quantos aceitaram (oficial) e quantos devem. */
export async function listarVersoes() {
  return getDb()
    .select({
      id: termosUso.id,
      versao: termosUso.versao,
      estado: termosUso.estado,
      publicadoEm: termosUso.publicadoEm,
      publicadoPor: termosUso.publicadoPor,
      hash: termosUso.hash,
      aceites: sql<number>`(SELECT COUNT(*) FROM termos_aceites AS ta WHERE ta.termo_id = ${termosUso.id} AND ta.teste = 0)`,
      aceitesTeste: sql<number>`(SELECT COUNT(*) FROM termos_aceites AS ta WHERE ta.termo_id = ${termosUso.id} AND ta.teste = 1)`,
      pendentes: sql<number>`(SELECT COUNT(*) FROM termos_pendencias AS tp WHERE tp.termo_id = ${termosUso.id})`,
    })
    .from(termosUso)
    .orderBy(desc(termosUso.versao));
}

/** O rascunho (o da próxima versão); sem nenhum, o MODELO pronto para o ADM adaptar (ainda não gravado). */
export async function rascunho(): Promise<{ id: number | null; versao: number; textoAdm: string }> {
  const db = getDb();
  const [r] = await db.select().from(termosUso).where(eq(termosUso.estado, "rascunho")).limit(1);
  if (r) return { id: r.id, versao: r.versao, textoAdm: r.textoAdm };
  const [ultimo] = await db.select().from(termosUso).orderBy(desc(termosUso.versao)).limit(1);
  return {
    id: null,
    versao: (ultimo?.versao ?? 0) + 1,
    textoAdm: ultimo?.textoAdm ?? modeloTermo(await nomeDoSistema()),
  };
}

export async function salvarRascunho(d: { textoAdm: string }): Promise<number> {
  const db = getDb();
  const atual = await rascunho();
  const agora = new Date().toISOString();
  if (atual.id) {
    await db.update(termosUso).set({ textoAdm: d.textoAdm, atualizadoEm: agora }).where(eq(termosUso.id, atual.id));
    return atual.id;
  }
  const [n] = await db.insert(termosUso).values({ versao: atual.versao, titulo: NOME_TERMO, textoAdm: d.textoAdm, estado: "rascunho" }).returning({ id: termosUso.id });
  return n.id;
}

/** A prévia do texto final (o rascunho + as cláusulas de AGORA). */
export async function previaDoTermo(d: { textoAdm: string; versao: number }): Promise<{ texto: string; clausulas: Clausula[] }> {
  const clausulas = clausulasAutomaticas(await contextoClausulas());
  return { texto: montarTermo({ ...d, publicadoEm: new Date().toISOString(), clausulas }), clausulas };
}

/** As cláusulas da versão vigente estão DIFERENTES das de agora (o ADM mudou uma configuração)? */
export async function termoDesatualizado(t: TermoUso | null): Promise<boolean> {
  if (!t?.clausulasAuto) return false;
  try {
    const gravadas = JSON.parse(t.clausulasAuto) as Clausula[];
    return (await assinaturaClausulas(gravadas)) !== (await assinaturaClausulas(clausulasAutomaticas(await contextoClausulas())));
  } catch {
    return false;
  }
}

export type PublicoEscolha = { tipo: "todos" } | { tipo: "papeis"; ids: number[] } | { tipo: "grupos"; ids: number[] } | { tipo: "pessoas"; ids: number[] };

/** O público → as pessoas (no TESTE, só os testadores; DESLIGADO, ninguém). */
async function idsDoPublico(p: PublicoEscolha, cfg: ConfigAcessoConta): Promise<PublicoTermo | null> {
  if (cfg.modo === "desligado") return null;
  const db = getDb();
  let ids: number[] | null = null;
  if (p.tipo === "papeis" && p.ids.length) ids = (await db.select({ id: usuarios.id }).from(usuarios).where(inArray(usuarios.papelId, p.ids))).map((r) => r.id);
  else if (p.tipo === "grupos" && p.ids.length) ids = (await db.select({ id: usuarioGrupos.usuarioId }).from(usuarioGrupos).where(inArray(usuarioGrupos.grupoId, p.ids))).map((r) => r.id);
  else if (p.tipo === "pessoas") ids = p.ids;
  else if (p.tipo !== "todos") ids = [];
  // O público ∩ as pessoas a quem as regras valem (teste = os testadores; ativo com escolhidos = os escolhidos).
  const valem = pessoasDasRegras(cfg);
  if (valem) return { ids: (ids ?? valem).filter((i) => valem.includes(i)) };
  return ids ? { ids } : { todos: true };
}

/** PUBLICA o rascunho: congela o texto final + o hash e cria as pendências do público (o sistema só abre com o aceite). */
export async function publicarTermo(por: string, publico: PublicoEscolha): Promise<TermoUso | null> {
  const r = await rascunho();
  if (!r.id) return null;
  const agora = new Date();
  const em = agora.toISOString();
  const clausulas = clausulasAutomaticas(await contextoClausulas());
  const textoFinal = montarTermo({ versao: r.versao, publicadoEm: em, textoAdm: r.textoAdm, clausulas });
  const hash = await hashTexto(textoFinal);
  const db = getDb();
  const [feito] = await db.batch([comandoPublicar(db, r.id, { textoFinal, hash, clausulas: JSON.stringify(clausulas), em, por })]);
  if (!feito.length) return null;
  await exigirAceite(r.id, publico);
  return termoPorId(r.id);
}

/** Exige a versão (de novo) do público — quem já aceitou oficialmente fica de fora; vale no próximo pedido (bloqueia). */
export async function exigirAceite(termoId: number, publico: PublicoEscolha, cfg?: ConfigAcessoConta): Promise<void> {
  const alvo = await idsDoPublico(publico, cfg ?? (await getAcessoConta({ fresco: true })));
  if (!alvo || ("ids" in alvo && !alvo.ids.length)) return;
  await comandoPendencias(getDb(), termoId, alvo, new Date().toISOString()).run();
}

/** O RETRATO da pessoa no momento do aceite. */
export async function retratoDaPessoa(usuarioId: number) {
  const [p] = await getDb()
    .select({
      nome: usuarios.nome,
      matricula: usuarios.matricula,
      cargo: usuarios.cargo,
      email: usuarios.email,
      unidadeSigla: reparticoes.codigo,
      unidadeNome: reparticoes.nome,
      papel: papeis.nome,
    })
    .from(usuarios)
    .leftJoin(reparticoes, eq(reparticoes.id, usuarios.reparticaoId))
    .leftJoin(papeis, eq(papeis.id, usuarios.papelId))
    .where(eq(usuarios.id, usuarioId))
    .limit(1);
  if (!p) return null;
  return {
    nome: p.nome,
    matricula: p.matricula ?? "",
    cargo: p.cargo ?? "",
    email: p.email,
    unidade: [p.unidadeSigla, p.unidadeNome].filter(Boolean).join(" — "),
  };
}

export type Assinante = { usuarioId: number; ip: string; userAgent: string | null; aparelhoId: number | null; aparelhoNome: string; metodo: "senha" | "codigo" | "sessao" };

/** ACEITA a versão: o retrato + o código de verificação + o SELO — gravados num lote (tira a pendência). */
export async function aceitarTermo(t: TermoUso, a: Assinante, cfg?: ConfigAcessoConta): Promise<{ id: number; codigo: string } | null> {
  if (t.estado !== "publicado" || !t.hash) return null;
  const pessoa = await retratoDaPessoa(a.usuarioId);
  if (!pessoa) return null;
  const teste = aceiteDeTeste(cfg ?? (await getAcessoConta()));
  const codigo = codigoDeBytes(crypto.getRandomValues(new Uint8Array(16)));
  const dados: DadosAceite = {
    codigo,
    versao: t.versao,
    hash: t.hash,
    usuarioId: a.usuarioId,
    ...pessoa,
    ip: a.ip,
    navegador: resumoNavegador(a.userAgent),
    aparelho: a.aparelhoNome,
    metodo: a.metodo,
    em: new Date().toISOString(),
    teste,
  };
  const selo = await seloAceite(dados);
  const db = getDb();
  const [, ins] = await db.batch(
    comandosAceitar(db, {
      usuarioId: a.usuarioId,
      termoId: t.id,
      versao: t.versao,
      hash: t.hash,
      nome: dados.nome,
      matricula: dados.matricula,
      cargo: dados.cargo,
      unidade: dados.unidade,
      email: dados.email,
      ip: dados.ip,
      navegador: dados.navegador,
      aparelhoId: a.aparelhoId,
      aparelhoNome: dados.aparelho,
      metodo: dados.metodo,
      codigo,
      selo,
      em: dados.em,
      teste,
    }),
  );
  if (ins[0]) return { id: ins[0].id, codigo };
  // Já aceito (outra aba, o cadastro, dois cliques): a pendência saiu no mesmo lote — vale o aceite que existe.
  const [ja] = await db
    .select({ id: termosAceites.id, codigo: termosAceites.codigo })
    .from(termosAceites)
    .where(and(eq(termosAceites.usuarioId, a.usuarioId), eq(termosAceites.termoId, t.id)))
    .limit(1);
  return ja ?? null;
}

/** O nome ATUAL do aparelho do aceite (renomear acompanha); sem aparelho ligado, o gravado no aceite. */
const nomeAparelhoAtual = sql<string>`COALESCE((SELECT ap.nome FROM aparelhos AS ap WHERE ap.id = ${termosAceites.aparelhoId}), ${termosAceites.aparelhoNome})`;

/** Liga ao aparelho recém-nomeado os aceites da pessoa feitos sem aparelho (o do cadastro). O selo não usa o id. */
export async function ligarAceitesAoAparelho(usuarioId: number, aparelhoId: number) {
  await getDb()
    .update(termosAceites)
    .set({ aparelhoId })
    .where(and(eq(termosAceites.usuarioId, usuarioId), isNull(termosAceites.aparelhoId)));
}

/** A pendência MAIS URGENTE da pessoa (o termo que ela tem de ler agora). */
export async function pendenciaDe(usuarioId: number): Promise<{ termo: TermoUso; prazo: string } | null> {
  const [p] = await getDb()
    .select({ termoId: termosPendencias.termoId, prazo: termosPendencias.prazo })
    .from(termosPendencias)
    .innerJoin(termosUso, eq(termosUso.id, termosPendencias.termoId))
    .where(and(eq(termosPendencias.usuarioId, usuarioId), eq(termosUso.estado, "publicado")))
    .orderBy(termosPendencias.prazo)
    .limit(1);
  if (!p) return null;
  const termo = await termoPorId(p.termoId);
  return termo ? { termo, prazo: p.prazo } : null;
}

export type AceiteRegistro = typeof termosAceites.$inferSelect;

/** Os aceites da pessoa (o mais recente primeiro). */
export async function aceitesDe(usuarioId: number) {
  return getDb()
    .select({ id: termosAceites.id, versao: termosAceites.versao, em: termosAceites.em, metodo: termosAceites.metodo, codigo: termosAceites.codigo, teste: termosAceites.teste, aparelhoNome: nomeAparelhoAtual })
    .from(termosAceites)
    .where(eq(termosAceites.usuarioId, usuarioId))
    .orderBy(desc(termosAceites.em));
}

export async function aceitePorId(id: number): Promise<AceiteRegistro | null> {
  const [a] = await getDb().select().from(termosAceites).where(eq(termosAceites.id, id)).limit(1);
  return a ?? null;
}

export async function aceitePorCodigo(codigo: string): Promise<AceiteRegistro | null> {
  const [a] = await getDb().select().from(termosAceites).where(eq(termosAceites.codigo, codigo)).limit(1);
  return a ?? null;
}

export const dadosDoRegistro = (a: AceiteRegistro): DadosAceite => ({
  codigo: a.codigo,
  versao: a.versao,
  hash: a.hash,
  usuarioId: a.usuarioId,
  nome: a.nome,
  matricula: a.matricula,
  cargo: a.cargo,
  unidade: a.unidade,
  email: a.email,
  ip: a.ip,
  navegador: a.navegador,
  aparelho: a.aparelhoNome,
  metodo: a.metodo,
  em: a.em,
  teste: a.teste,
});

/** O registro confere com o selo (nada foi alterado depois)? */
export async function seloConfere(a: AceiteRegistro): Promise<boolean> {
  // O usuário excluído (`usuario_id` nulo) quebraria o selo: confere com o id original não é possível — vale o restante.
  if (a.usuarioId == null) return true;
  return (await seloAceite(dadosDoRegistro(a))) === a.selo;
}

/** Os aceites e as pendências de uma versão — a tabela do ADM. */
export async function situacaoDaVersao(termoId: number) {
  const db = getDb();
  const [aceites, pendentes] = await Promise.all([
    db
      .select({ id: termosAceites.id, usuarioId: termosAceites.usuarioId, nome: sql<string>`COALESCE(${usuarios.nome}, ${termosAceites.nome})`, matricula: sql<string>`COALESCE(${usuarios.matricula}, ${termosAceites.matricula})`, unidade: sql<string>`COALESCE((SELECT r.codigo || ' — ' || r.nome FROM reparticoes AS r WHERE r.id = ${usuarios.reparticaoId}), ${termosAceites.unidade})`, em: termosAceites.em, metodo: termosAceites.metodo, ip: termosAceites.ip, aparelho: nomeAparelhoAtual, teste: termosAceites.teste, codigo: termosAceites.codigo })
      .from(termosAceites)
      .leftJoin(usuarios, eq(usuarios.id, termosAceites.usuarioId))
      .where(eq(termosAceites.termoId, termoId))
      .orderBy(desc(termosAceites.em)),
    db
      .select({ usuarioId: termosPendencias.usuarioId, nome: usuarios.nome, matricula: usuarios.matricula, prazo: termosPendencias.prazo })
      .from(termosPendencias)
      .innerJoin(usuarios, eq(usuarios.id, termosPendencias.usuarioId))
      .where(eq(termosPendencias.termoId, termoId))
      .orderBy(usuarios.nome),
  ]);
  const emissoes = aceites.length
    ? await db
        .select({ id: termosEmissoes.id, aceiteId: termosEmissoes.aceiteId, nome: termosEmissoes.nome, ip: termosEmissoes.ip, modo: termosEmissoes.modo, em: termosEmissoes.em })
        .from(termosEmissoes)
        .innerJoin(termosAceites, eq(termosAceites.id, termosEmissoes.aceiteId))
        .where(eq(termosAceites.termoId, termoId))
        .orderBy(desc(termosEmissoes.em))
        .limit(2000)
    : [];
  return { aceites, pendentes, emissoes };
}

/** A ADESÃO à versão vigente: cada pessoa ativa a quem as regras valem — aceitou (quando), aparelhos nomeados, pendente. */
export async function adesaoAoTermo(cfg: ConfigAcessoConta) {
  const db = getDb();
  const vigente = await termoVigente();
  const v = vigente?.id ?? 0;
  const alvo = pessoasDasRegras(cfg);
  const pessoas = await db
    .select({
      id: usuarios.id,
      nome: usuarios.nome,
      matricula: usuarios.matricula,
      email: usuarios.email,
      aceitoEm: sql<string | null>`(SELECT ta.em FROM termos_aceites ta WHERE ta.usuario_id = usuarios.id AND ta.termo_id = ${v})`,
      teste: sql<number | null>`(SELECT ta.teste FROM termos_aceites ta WHERE ta.usuario_id = usuarios.id AND ta.termo_id = ${v})`,
      aparelhos: sql<number>`(SELECT COUNT(*) FROM aparelhos ap WHERE ap.usuario_id = usuarios.id)`,
      nomesAparelhos: sql<string | null>`(SELECT group_concat(ap.nome, ' · ') FROM aparelhos ap WHERE ap.usuario_id = usuarios.id)`,
      aparelhoEm: sql<string | null>`(SELECT MAX(ap.criado_em) FROM aparelhos ap WHERE ap.usuario_id = usuarios.id)`,
      pendente: sql<number>`EXISTS (SELECT 1 FROM termos_pendencias tp WHERE tp.usuario_id = usuarios.id AND tp.termo_id = ${v})`,
    })
    .from(usuarios)
    .where(alvo ? and(eq(usuarios.status, "ativo"), sql`usuarios.id IN (SELECT value FROM json_each(${JSON.stringify(alvo)}))`) : eq(usuarios.status, "ativo"))
    .orderBy(usuarios.nome);
  return {
    vigente: vigente ? { id: vigente.id, versao: vigente.versao, publicadoEm: vigente.publicadoEm } : null,
    pessoas: pessoas.map((p) => ({ ...p, teste: !!p.teste, pendente: !!p.pendente, aparelhos: Number(p.aparelhos) || 0 })),
  };
}

/** O cadastro com o aceite do termo: a versão e o hash conferem com o vigente? (o termo trocou entre ler e confirmar) */
export async function termoDoCadastro(versao: number | undefined, hash: string | undefined): Promise<{ termo: TermoUso | null; mudou: boolean }> {
  const t = await termoVigente();
  if (!t) return { termo: null, mudou: false };
  return { termo: t, mudou: versao !== t.versao || hash !== t.hash };
}


/** Os dados do BANNER de aceite da pessoa (o termo pendente mais urgente + como ela confirma a identidade). */
export async function dadosDoAceite(u: { id: number; email: string; admin?: boolean }): Promise<import("@/components/AceiteTermo").DadosAceiteTermo | null> {
  const p = await pendenciaDe(u.id);
  if (!p?.termo.textoFinal || !p.termo.hash) return null;
  const [integ, sistema, cfg, [conta]] = await Promise.all([
    getIntegracoes(),
    nomeDoSistema(),
    getAcessoConta(),
    getDb().select({ senhaHash: usuarios.senhaHash }).from(usuarios).where(eq(usuarios.id, u.id)).limit(1),
  ]);
  return {
    termo: { id: p.termo.id, versao: p.termo.versao, texto: p.termo.textoFinal, hash: p.termo.hash, publicadoEm: p.termo.publicadoEm },
    metodos: { senha: !!conta?.senhaHash && conta.senhaHash !== SENHA_INUTILIZAVEL, codigo: resendConfigurado(integ) },
    email: u.email,
    sistema,
    fecharEmS: cfg.fecharAceiteS,
    telaAceito: cfg.telaAceito,
    baixar: cfg.baixarComprovante || !!u.admin,
  };
}

/**
 * A conta que passa a ENTRAR (criada, aprovada, reativada, restaurada) depois da publicação recebe a pendência da versão
 * vigente — sem isso ela entraria sem aceitar. No teste, só os testadores. Best-effort: nunca derruba a gravação da conta.
 */
export async function exigirDaConta(usuarioId: number): Promise<void> {
  try {
    const cfg = await getAcessoConta({ fresco: true });
    const valem = pessoasDasRegras(cfg);
    if (valem && !valem.includes(usuarioId)) return;
    const [t] = await consultaTermoVigente(getDb());
    if (!t) return;
    await comandoPendencias(getDb(), t.id, { ids: [usuarioId] }, new Date().toISOString()).run();
  } catch {
    // A sessão confere de novo na próxima publicação/troca de modo.
  }
}

export type ResultadoArquivoTermo = "original" | "alterado" | "registro-alterado" | "nao-encontrado";

/** Confere o ARQUIVO do comprovante: refaz o PDF do registro e compara o SHA-256 (o mesmo na verificação pública e na interna). */
export async function conferirArquivoTermo(codigoBruto: string, hash: string, origem: string): Promise<ResultadoArquivoTermo> {
  const codigo = codigoNormal(codigoBruto);
  const a = codigo ? await aceitePorCodigo(codigo) : null;
  if (!a) return "nao-encontrado";
  if (!(await seloConfere(a))) return "registro-alterado";
  const t = await termoPorId(a.termoId);
  if (!t?.textoFinal) return "nao-encontrado";
  const { pdfDoComprovante, sha256Arquivo } = await import("./comprovante-termo-pdf");
  const original = await sha256Arquivo(await pdfDoComprovante(a, { textoFinal: t.textoFinal, publicadoEm: t.publicadoEm }, origem));
  return original === hash ? "original" : "alterado";
}
