import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { aparelhosConta, usuarios } from "@/db/schema";
import {
  COOKIE_APARELHO,
  type ConfigAcessoConta,
  fimDaTrava,
  hashDoAparelho,
  idAparelhoValido,
  limiteEfetivo,
  repeteAoEntrar,
  type SituacaoNovoAparelho,
  situacaoNovoAparelho,
} from "./acesso-conta-core";
import { getAcessoConta } from "./acesso-conta";
import { comandosLigarConhecido, comandosNomearAparelho, comandosTrocarAparelho, consultaAparelhos } from "./aparelhos-sql";
import type { UsuarioSessao } from "./auth";
import { sessaoAtualId } from "./auth";
import { getDb } from "./db";
import { toHex } from "./password";
import { resumoNavegador } from "./seguranca-core";

// APARELHOS DA CONTA no banco — a situação da pessoa e o nomear/trocar (os comandos com a trava no SQL: aparelhos-sql.ts).

export type AparelhoLista = Awaited<ReturnType<typeof listarAparelhos>>[number];

export const listarAparelhos = (usuarioId: number) => consultaAparelhos(getDb(), usuarioId);

/** O cookie do aparelho deste navegador (criado aqui quando falta — só numa ROTA, nunca numa página). */
export async function cookieDoAparelho(criar: boolean): Promise<string | null> {
  const jar = await cookies();
  const atual = jar.get(COOKIE_APARELHO)?.value;
  if (idAparelhoValido(atual)) return atual;
  if (!criar) return null;
  const id = toHex(crypto.getRandomValues(new Uint8Array(16)));
  jar.set(COOKIE_APARELHO, id, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 2 * 365 * 86_400 });
  return id;
}

export async function contaDe(usuarioId: number): Promise<{ limite: number | null; trocaAte: string | null }> {
  const [c] = await getDb().select({ limite: aparelhosConta.limite, trocaAte: aparelhosConta.trocaAte }).from(aparelhosConta).where(eq(aparelhosConta.usuarioId, usuarioId)).limit(1);
  return { limite: c?.limite ?? null, trocaAte: c?.trocaAte ?? null };
}

export type EstadoAparelhos = {
  lista: AparelhoLista[];
  limite: number;
  limiteProprio: number | null;
  trocaAte: string | null;
  /** O aparelho deste navegador já nomeado (o id; null = novo). */
  conhecido: number | null;
  situacao: SituacaoNovoAparelho;
  sugestao: string;
  repetir: boolean;
  /** Os dias sem troca depois de trocar (0 = sem trava). */
  trocaDias: number;
};

/** Tudo o que a tela de NOMEAR precisa: os aparelhos, o limite, a trava e este aparelho. */
export async function estadoAparelhos(u: UsuarioSessao, userAgent: string | null, cfg?: ConfigAcessoConta): Promise<EstadoAparelhos> {
  const c = cfg ?? (await getAcessoConta());
  const [lista, conta, idCookie] = await Promise.all([listarAparelhos(u.id), contaDe(u.id), cookieDoAparelho(false)]);
  const hash = idCookie ? await hashDoAparelho(idCookie) : null;
  const conhecido = hash ? ((await getDb().query.aparelhos.findFirst({ where: (a, { and, eq: e }) => and(e(a.usuarioId, u.id), e(a.hash, hash)), columns: { id: true } }))?.id ?? null) : null;
  const limite = limiteEfetivo(c, u.papel.id, conta.limite);
  const repetir = repeteAoEntrar(c, u);
  return {
    lista,
    limite,
    limiteProprio: conta.limite,
    trocaAte: conta.trocaAte,
    conhecido,
    situacao: situacaoNovoAparelho({ total: lista.length, limite, trocaAte: conta.trocaAte, agoraMs: Date.now(), semTrava: repetir }),
    sugestao: resumoNavegador(userAgent),
    repetir,
    trocaDias: repetir ? 0 : c.trocaDias,
  };
}

export type ResultadoNomear = { ok: true; aparelhoId: number } | { ok: false; status: number; error: string; situacao?: SituacaoNovoAparelho };

/**
 * NOMEAR o aparelho desta sessão. Conhecido = só liga (e renomeia). Novo: com vaga entra; lotado pede `removerIds`
 * (a TROCA atômica, que inicia a trava); em trava, recusado.
 */
export async function nomearAparelhoDaSessao(
  u: UsuarioSessao,
  req: Request,
  nome: string,
  removerIds: number[],
): Promise<ResultadoNomear> {
  const cfg = await getAcessoConta();
  const sessaoId = await sessaoAtualId();
  if (!sessaoId) return { ok: false, status: 401, error: "Sessão encerrada — entre de novo." };
  const idCookie = await cookieDoAparelho(true);
  const hash = await hashDoAparelho(idCookie as string);
  const db = getDb();
  const em = new Date().toISOString();
  const estado = await estadoAparelhos(u, req.headers.get("user-agent"), cfg);
  const proprio = estado.lista.find((a) => a.id === estado.conhecido);
  if (estado.conhecido && proprio) {
    await db.batch(comandosLigarConhecido(db, u.id, hash, sessaoId, nome, em));
    return { ok: true, aparelhoId: proprio.id };
  }
  const novo = { usuarioId: u.id, hash, nome, navegador: resumoNavegador(req.headers.get("user-agent")), ip: req.headers.get("cf-connecting-ip") ?? "", em, teste: cfg.modo === "teste", limite: estado.limite };
  const s = estado.situacao;
  if (s.tipo === "trava") return { ok: false, status: 409, error: "Troca de aparelho bloqueada até a data indicada.", situacao: s };
  if (s.tipo === "livre") {
    const [ins] = await db.batch(comandosNomearAparelho(db, novo, sessaoId));
    if (ins[0]) return { ok: true, aparelhoId: ins[0].id };
    return { ok: false, status: 409, error: "O limite de aparelhos foi atingido agora — escolha um para trocar.", situacao: { tipo: "lotado" } };
  }
  // Lotado: a troca precisa retirar o suficiente para abrir UMA vaga.
  const ids = [...new Set(removerIds)].filter((id) => estado.lista.some((a) => a.id === id));
  if (!ids.length || estado.lista.length - ids.length >= estado.limite)
    return { ok: false, status: 422, error: `Escolha ${Math.max(1, estado.lista.length - estado.limite + 1)} aparelho(s) para retirar.`, situacao: s };
  const trava = estado.repetir ? null : fimDaTrava(Date.now(), cfg.trocaDias);
  const r = await db.batch(comandosTrocarAparelho(db, novo, sessaoId, ids, trava));
  const ins = r[2];
  if (ins[0]) return { ok: true, aparelhoId: ins[0].id };
  return { ok: false, status: 409, error: "Não foi possível trocar o aparelho agora — recarregue e tente de novo." };
}

/** O nome da pessoa e o e-mail (para avisos). */
export async function quem(usuarioId: number) {
  const [p] = await getDb().select({ nome: usuarios.nome, email: usuarios.email }).from(usuarios).where(eq(usuarios.id, usuarioId)).limit(1);
  return p ?? null;
}
