import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import { papeis, sessoes, usuarios } from "../db/schema.ts";

/**
 * PAPÉIS — os comandos de gravação como BUILDERS do Drizzle (sem getDb: testados pelo driver D1 REAL sobre `node:sqlite`,
 * inclusive dentro de `db.batch`). As travas ficam NO PRÓPRIO comando (um UPDATE/INSERT atômico no D1), não numa leitura
 * anterior — duas telas de ADM ao mesmo tempo nunca deixam o sistema sem Administrador, e dois primeiros cadastros
 * simultâneos nunca viram dois Administradores.
 *
 * `usuarios.role` é gravado junto como ESPELHO do papel (admin | gestor | membro): os leitores antigos seguem certos.
 */
type Db = DrizzleD1Database<typeof schema>;

/** A pessoa (`u`, a linha de `usuarios` do comando) é Administrador? O papel manda; sem papel, o `role`. */
const ehAdminSql = sql`(COALESCE((SELECT ${papeis.chave} FROM ${papeis} WHERE ${papeis.id} = ${usuarios.papelId}), CASE WHEN ${usuarios.papelId} IS NULL THEN ${usuarios.role} END) = 'admin')`;

/** Sobra outro Administrador ATIVO além de `usuarioId`? */
const outroAdminAtivo = (usuarioId: number) =>
  sql`EXISTS (SELECT 1 FROM ${usuarios} AS o WHERE o.id <> ${usuarioId} AND o.status = 'ativo' AND COALESCE((SELECT p.chave FROM ${papeis} AS p WHERE p.id = o.papel_id), CASE WHEN o.papel_id IS NULL THEN o.role END) = 'admin')`;

/** O `role` espelho do papel `papelId` (em SQL, lido do próprio papel). */
const roleDoPapel = (papelId: number) =>
  sql`COALESCE((SELECT CASE ${papeis.chave} WHEN 'admin' THEN 'admin' WHEN 'gestor' THEN 'gestor' ELSE 'membro' END FROM ${papeis} WHERE ${papeis.id} = ${papelId}), 'membro')`;

/** O papel PADRÃO dos novos cadastros (nunca o Administrador). */
const papelPadraoSql = sql`(SELECT ${papeis.id} FROM ${papeis} WHERE ${papeis.padraoCadastro} = 1 AND (${papeis.chave} IS NULL OR ${papeis.chave} <> 'admin') ORDER BY ${papeis.ordem}, ${papeis.id} LIMIT 1)`;
const rolePadraoSql = sql`COALESCE((SELECT CASE ${papeis.chave} WHEN 'gestor' THEN 'gestor' ELSE 'membro' END FROM ${papeis} WHERE ${papeis.padraoCadastro} = 1 AND (${papeis.chave} IS NULL OR ${papeis.chave} <> 'admin') ORDER BY ${papeis.ordem}, ${papeis.id} LIMIT 1), 'membro')`;

export type DadosCadastro = {
  nome: string;
  email: string;
  senhaHash: string;
  matricula: string | null;
  cargo: string | null;
  reparticaoId: number | null;
  telefone: string | null;
  telefoneWhatsapp: boolean;
};

/**
 * 1º cadastro do sistema: vira Administrador ATIVO — SÓ se a tabela ainda estiver vazia (INSERT … SELECT … WHERE NOT
 * EXISTS, atômico). Devolve a linha criada; nenhuma = outra pessoa foi a primeira (a tela pede o código do e-mail).
 */
export function comandoCadastroPrimeiro(db: Db, d: DadosCadastro) {
  // As chaves na MESMA ordem das colunas da tabela (exigência do insert…select do Drizzle).
  const linha = db
    .select({
      id: sql<number>`NULL`.as("id"),
      email: sql<string>`${d.email}`.as("email"),
      nome: sql<string>`${d.nome}`.as("nome"),
      senhaHash: sql<string>`${d.senhaHash}`.as("senha_hash"),
      matricula: sql<string | null>`${d.matricula}`.as("matricula"),
      cargo: sql<string | null>`${d.cargo}`.as("cargo"),
      foto: sql<string | null>`NULL`.as("foto"),
      apelido: sql<string | null>`NULL`.as("apelido"),
      role: sql<"admin">`'admin'`.as("role"),
      status: sql<"ativo">`'ativo'`.as("status"),
      responsavelPadraoId: sql<number | null>`NULL`.as("responsavel_padrao_id"),
      mesaResponsavel: sql<null>`NULL`.as("mesa_responsavel"),
      googleSub: sql<string | null>`NULL`.as("google_sub"),
      googleEmail: sql<string | null>`NULL`.as("google_email"),
      reparticaoId: sql<number | null>`${d.reparticaoId}`.as("reparticao_id"),
      emailVerificadoEm: sql<string | null>`NULL`.as("email_verificado_em"),
      papelId: papeis.id,
      criadoEm: sql<string>`CURRENT_TIMESTAMP`.as("criado_em"),
      atualizadoEm: sql<string>`CURRENT_TIMESTAMP`.as("atualizado_em"),
      telefone: sql<string | null>`${d.telefone}`.as("telefone"),
      telefoneWhatsapp: sql<boolean>`${d.telefoneWhatsapp ? 1 : 0}`.as("telefone_whatsapp"),
      dadosValidadosEm: sql<string | null>`NULL`.as("dados_validados_em"),
      dadosValidadosPor: sql<string | null>`NULL`.as("dados_validados_por"),
      trocarSenha: sql<boolean>`0`.as("trocar_senha"),
      arquivadoEm: sql<string | null>`NULL`.as("arquivado_em"),
      arquivadoPor: sql<string | null>`NULL`.as("arquivado_por"),
    })
    .from(papeis)
    .where(and(eq(papeis.chave, "admin"), sql`NOT EXISTS (SELECT 1 FROM ${usuarios})`));
  return db.insert(usuarios).select(linha).returning({ id: usuarios.id, role: usuarios.role, status: usuarios.status });
}

/** Os demais cadastros (e-mail já confirmado pelo código): o papel PADRÃO, pendentes de aprovação. */
export function comandoCadastroPendente(db: Db, d: DadosCadastro) {
  return db
    .insert(usuarios)
    .values({
      ...d,
      role: rolePadraoSql,
      status: "pendente",
      papelId: papelPadraoSql,
      emailVerificadoEm: sql`(CURRENT_TIMESTAMP)`,
    })
    .returning({ id: usuarios.id, role: usuarios.role, status: usuarios.status });
}

/**
 * Troca o PAPEL (e o `role` espelho) — recusada NO COMANDO quando tiraria o último Administrador ATIVO (quem é ADM só
 * deixa de ser se sobrar outro ADM ativo). Devolve as linhas alteradas: nenhuma = recusado (ou papel/pessoa inexistente).
 */
export function comandoTrocarPapel(db: Db, usuarioId: number, papelId: number) {
  const novoEhAdmin = sql`(SELECT ${papeis.chave} FROM ${papeis} WHERE ${papeis.id} = ${papelId}) = 'admin'`;
  return db
    .update(usuarios)
    .set({ papelId, role: roleDoPapel(papelId), atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
    .where(
      and(
        eq(usuarios.id, usuarioId),
        sql`EXISTS (SELECT 1 FROM ${papeis} WHERE ${papeis.id} = ${papelId})`,
        sql`(${novoEhAdmin} OR NOT ${ehAdminSql} OR ${outroAdminAtivo(usuarioId)})`,
      ),
    )
    .returning({ id: usuarios.id });
}

/**
 * Troca o STATUS — tirar um Administrador de "ativo" só se sobrar outro ADM ativo (trava no comando). Devolve as linhas
 * alteradas: nenhuma = recusado (ou pessoa inexistente).
 */
export function comandoTrocarStatus(db: Db, usuarioId: number, status: "ativo" | "pendente" | "inativo") {
  return db
    .update(usuarios)
    .set({ status, atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
    .where(and(eq(usuarios.id, usuarioId), status === "ativo" ? undefined : sql`(NOT ${ehAdminSql} OR ${outroAdminAtivo(usuarioId)})`))
    .returning({ id: usuarios.id });
}

/** Encerra as sessões de quem NÃO está ativo (depois de desativar, no mesmo lote: se a troca foi recusada, nada sai) —
 * reativar a pessoa nunca ressuscita uma sessão antiga. */
export function comandoEncerrarSessoesSeInativo(db: Db, usuarioId: number) {
  return db
    .delete(sessoes)
    .where(and(eq(sessoes.usuarioId, usuarioId), sql`(SELECT ${usuarios.status} FROM ${usuarios} WHERE ${usuarios.id} = ${usuarioId}) <> 'ativo'`));
}

/**
 * ARQUIVA a pessoa (o "Excluir" da tela): inativa, carimba quem/quando e TUDO fica (grupos, papel, foto, responsabilidades)
 * para restaurar — o último Administrador ATIVO nunca (trava no comando). Nenhuma linha = recusado (ou já arquivada).
 * As sessões saem no mesmo lote (`comandoEncerrarSessoesSeInativo`).
 */
export function comandoArquivarUsuario(db: Db, usuarioId: number, por: string) {
  return db
    .update(usuarios)
    .set({ status: "inativo", arquivadoEm: sql`(CURRENT_TIMESTAMP)`, arquivadoPor: por, atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
    .where(and(eq(usuarios.id, usuarioId), isNull(usuarios.arquivadoEm), sql`(NOT ${ehAdminSql} OR ${outroAdminAtivo(usuarioId)})`))
    .returning({ id: usuarios.id });
}

/** RESTAURA a pessoa arquivada: volta ATIVA, com os grupos, o papel e tudo o que tinha. Nenhuma linha = não estava arquivada. */
export function comandoRestaurarUsuario(db: Db, usuarioId: number) {
  return db
    .update(usuarios)
    .set({ status: "ativo", arquivadoEm: null, arquivadoPor: null, atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
    .where(and(eq(usuarios.id, usuarioId), isNotNull(usuarios.arquivadoEm)))
    .returning({ id: usuarios.id });
}

/** Exclui a pessoa DE VEZ (o pendente recusado ou o arquivado) — o último Administrador ATIVO nunca (trava no comando). */
export function comandoExcluirUsuario(db: Db, usuarioId: number) {
  return db
    .delete(usuarios)
    .where(and(eq(usuarios.id, usuarioId), sql`(NOT ${ehAdminSql} OR ${outroAdminAtivo(usuarioId)})`))
    .returning({ id: usuarios.id });
}

/** O papel do sistema de uma chave (id), para quem ainda fala em `role`. */
export function consultaPapelDaChave(db: Db, chave: "admin" | "gestor" | "membro") {
  return db.select({ id: papeis.id }).from(papeis).where(eq(papeis.chave, chave)).limit(1);
}

// ---------------------------------------------------------------------------------------------------------------
// O CADASTRO dos papéis (Configurações → Papéis — só o ADM). As travas no próprio comando: o Administrador (fixo) nunca
// é alterado nem excluído; há sempre UM papel padrão dos novos cadastros (marcar um desmarca o outro no mesmo comando);
// o papel em uso (ou do sistema, ou o padrão) não se exclui.
// ---------------------------------------------------------------------------------------------------------------

/** `capacidades` e `detalhes` = o JSON já normalizado (os detalhes COMPACTOS — `compactarDetalhes`; ausente = `{}`). */
export type DadosPapel = { nome: string; descricao: string | null; capacidades: string; detalhes?: string; padraoCadastro: boolean };

/** Cria o papel no FIM da ordem; `padraoCadastro` = passa a ser o padrão (o anterior deixa de ser, no mesmo lote). */
export function comandosCriarPapel(db: Db, d: DadosPapel) {
  const criar = db
    .insert(papeis)
    .values({
      nome: d.nome,
      descricao: d.descricao,
      capacidades: d.capacidades,
      detalhes: d.detalhes ?? "{}",
      padraoCadastro: d.padraoCadastro,
      ordem: sql`(SELECT COALESCE(MAX(${papeis.ordem}), 0) + 1 FROM ${papeis})`,
    })
    .returning({ id: papeis.id });
  // O nome é único (índice): o papel novo é o único com ele — os demais deixam de ser o padrão.
  const soEste = db.update(papeis).set({ padraoCadastro: false }).where(and(eq(papeis.padraoCadastro, true), sql`${papeis.nome} <> ${d.nome}`));
  return d.padraoCadastro ? ([criar, soEste] as const) : ([criar] as const);
}

/** Altera o papel (nunca o Administrador). Devolve as linhas alteradas: nenhuma = inexistente ou o Administrador. */
export function comandoAtualizarPapel(db: Db, id: number, d: Partial<Omit<DadosPapel, "padraoCadastro">>) {
  return db
    .update(papeis)
    .set({ ...d, atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
    .where(and(eq(papeis.id, id), sql`(${papeis.chave} IS NULL OR ${papeis.chave} <> 'admin')`))
    .returning({ id: papeis.id });
}

/** Marca o papel como o PADRÃO dos novos cadastros e desmarca o anterior — num comando só (nunca o Administrador). */
export function comandoMarcarPadrao(db: Db, id: number) {
  return db
    .update(papeis)
    .set({ padraoCadastro: sql`(${papeis.id} = ${id})` })
    .where(
      and(
        sql`(${papeis.padraoCadastro} = 1 OR ${papeis.id} = ${id})`,
        sql`EXISTS (SELECT 1 FROM ${papeis} AS p WHERE p.id = ${id} AND (p.chave IS NULL OR p.chave <> 'admin'))`,
      ),
    )
    .returning({ id: papeis.id, padrao: papeis.padraoCadastro });
}

/** Exclui o papel — só o criado pelo ADM, que não é o padrão e que NINGUÉM tem (conferido no comando). Nenhuma linha =
 * recusado (a rota diz o motivo). */
export function comandoExcluirPapel(db: Db, id: number) {
  return db
    .delete(papeis)
    .where(
      and(
        eq(papeis.id, id),
        sql`${papeis.chave} IS NULL`,
        eq(papeis.padraoCadastro, false),
        sql`NOT EXISTS (SELECT 1 FROM ${usuarios} WHERE ${usuarios.papelId} = ${id})`,
      ),
    )
    .returning({ id: papeis.id });
}
