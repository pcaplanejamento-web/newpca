import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { usuarioGrupos, usuarios } from "@/db/schema";
import { getDb } from "./db";
import { type Pessoa, urlFoto } from "./pessoa";
import { lotesDeIds } from "./reparticoes";

/**
 * PESSOAS da plataforma para a gestão do protocolo na Mesa (nada sensível: id, nome, apelido e a URL da
 * foto): as PESSOAS DO GRUPO ativo — as únicas que podem ser designadas RESPONSÁVEL (célula, edição em
 * massa, perfil) — e o diretório de exibição (foto + apelido) de quem aparece nas colunas Responsável/
 * Distribuição. Também a preferência de cada um: o RESPONSÁVEL PADRÃO escolhido ao protocolar.
 */

// Colunas de exibição: a FOTO não é lida (só se existe + a versão para a URL com cache).
const colunasPessoa = {
  id: usuarios.id,
  nome: usuarios.nome,
  apelido: usuarios.apelido,
  temFoto: sql<number>`(${usuarios.foto} IS NOT NULL AND ${usuarios.foto} <> '')`,
  versao: usuarios.atualizadoEm,
};
type LinhaPessoa = { id: number; nome: string; apelido: string | null; temFoto: number; versao: string | null };
const paraPessoa = (r: LinhaPessoa): Pessoa => ({ id: r.id, nome: r.nome, apelido: r.apelido ?? null, foto: urlFoto(r.id, !!r.temFoto, r.versao) });
const porNome = (a: Pessoa, b: Pessoa) => a.nome.localeCompare(b.nome, "pt-BR");

/**
 * PESSOAS DO GRUPO: os usuários ATIVOS do grupo ATIVO de quem está na tela (as únicas designáveis como
 * responsável — regra do usuário, vale também para o admin que está num grupo). Sem grupo ativo (ex.: admin
 * sem grupo) ⇒ todos os ativos.
 */
export async function listarPessoasDoGrupo(grupoId: number | null): Promise<Pessoa[]> {
  const db = getDb();
  const rows =
    grupoId == null
      ? await db.select(colunasPessoa).from(usuarios).where(eq(usuarios.status, "ativo")).orderBy(asc(usuarios.nome))
      : await db
          .select(colunasPessoa)
          .from(usuarioGrupos)
          .innerJoin(usuarios, eq(usuarioGrupos.usuarioId, usuarios.id))
          .where(and(eq(usuarioGrupos.grupoId, grupoId), eq(usuarios.status, "ativo")))
          .orderBy(asc(usuarios.nome));
  return rows.map(paraPessoa);
}

/** Pessoas pelos ids (QUALQUER status) — o diretório de exibição (foto + apelido) das colunas. */
export async function pessoasPorIds(ids: (number | null | undefined)[]): Promise<Pessoa[]> {
  const uniq = [...new Set(ids.filter((n): n is number => Number.isInteger(n) && (n as number) > 0))];
  if (uniq.length === 0) return [];
  const db = getDb();
  const lotes = await Promise.all(lotesDeIds(uniq).map((l) => db.select(colunasPessoa).from(usuarios).where(inArray(usuarios.id, l))));
  return lotes.flat().map(paraPessoa).sort(porNome);
}

/** A pessoa pode ser RESPONSÁVEL no grupo: ATIVA e membro do grupo (sem grupo ⇒ basta estar ativa). */
export async function pessoaDoGrupo(id: number, grupoId: number | null): Promise<boolean> {
  const db = getDb();
  const [r] =
    grupoId == null
      ? await db
          .select({ id: usuarios.id })
          .from(usuarios)
          .where(and(eq(usuarios.id, id), eq(usuarios.status, "ativo")))
          .limit(1)
      : await db
          .select({ id: usuarios.id })
          .from(usuarioGrupos)
          .innerJoin(usuarios, eq(usuarioGrupos.usuarioId, usuarios.id))
          .where(and(eq(usuarioGrupos.grupoId, grupoId), eq(usuarios.id, id), eq(usuarios.status, "ativo")))
          .limit(1);
  return !!r;
}

/** Responsável padrão do usuário (ou `null`) — só se ainda for uma pessoa DO GRUPO (ativa e membro). */
export async function responsavelPadraoDe(usuarioId: number, grupoId: number | null): Promise<number | null> {
  const [r] = await getDb().select({ id: usuarios.responsavelPadraoId }).from(usuarios).where(eq(usuarios.id, usuarioId)).limit(1);
  const alvo = r?.id ?? null;
  return alvo != null && (await pessoaDoGrupo(alvo, grupoId)) ? alvo : null;
}

/** O responsável padrão GRAVADO (sem conferir o grupo) — o valor atual do seletor do Perfil. */
export async function responsavelPadraoGravado(usuarioId: number): Promise<number | null> {
  const [r] = await getDb().select({ id: usuarios.responsavelPadraoId }).from(usuarios).where(eq(usuarios.id, usuarioId)).limit(1);
  return r?.id ?? null;
}

export async function definirResponsavelPadrao(usuarioId: number, alvo: number | null): Promise<void> {
  await getDb().update(usuarios).set({ responsavelPadraoId: alvo }).where(eq(usuarios.id, usuarioId));
}
