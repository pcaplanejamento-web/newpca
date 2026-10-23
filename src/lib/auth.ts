import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { cache } from "react";
import {
  aparelhosValemPara,
  COOKIE_APARELHO,
  estadoTermo,
  hashDoAparelho,
  idAparelhoValido,
  type PendenciaAcesso,
  regrasValemPara,
  repeteAoEntrar,
  SEM_PENDENCIA,
} from "./acesso-conta-core";
import { getAcessoConta } from "./acesso-conta";
import { COOKIE_CONTAS, lerContas, MAX_CONTAS, textoContas } from "./contas-core";
import { getDb } from "./db";
import { type Capacidades, coerceCapacidades } from "./papeis-core";
import { type DetalhesPapel, detalhesDoJson } from "./papeis-detalhes-core";
import { hashSenha, sha256Hex, toHex, verificarSenha } from "./password";
import { urlFoto } from "./pessoa";
import { getConfigSeguranca } from "./seguranca";
import { renovarAtividade, sessaoInativa } from "./seguranca-core";

import { papeis, sessoes, usuarios } from "@/db/schema";

/**
 * Autenticação própria e enxuta, 100% Web Crypto (compatível com Cloudflare
 * Workers). Criptografia de senha/token fica em `./password`; aqui tratamos
 * sessão no D1 (guardando apenas o hash do token) e cookie httpOnly + Secure.
 */

const COOKIE = "pca_session";
const SESSAO_DIAS = 7;

export { hashSenha, verificarSenha };

export type UsuarioSessao = {
  id: number;
  email: string;
  nome: string;
  /** Apelido (perfil) — o nome de exibição no sistema (`nomeExibicao`). */
  apelido: string | null;
  matricula: string | null;
  /** URL da foto (rota com cache — `urlFoto`), nunca o data-URL: a sessão é lida em TODA requisição. */
  foto: string | null;
  status: "ativo" | "pendente" | "inativo";
  /** O papel Administrador (regra firme: vê e faz tudo, inclusive a Administração). */
  admin: boolean;
  /** O PAPEL da pessoa: o que ela faz em cada tela (as telas vêm do grupo — `acesso.ts`). */
  papel: PapelSessao;
  /** O ADM exigiu uma SENHA NOVA: o painel leva a pessoa a `/nova-senha` antes de qualquer tela. */
  trocarSenha: boolean;
  /** TERMO DE USO + APARELHOS: o que a sessão precisa resolver antes de usar o sistema (sem as regras valendo = nada). */
  pendencia: PendenciaAcesso;
};

/** O papel da sessão: as AÇÕES por tela (`capacidades`) e os DETALHES — o controle fino dentro delas (colunas das Mesas,
 * Responsável, linhas, histórico, edições — `papeis-detalhes-core.ts`; o Administrador os ignora). */
export type PapelSessao = { id: number | null; nome: string; chave: string | null; capacidades: Capacidades; detalhes: DetalhesPapel };

// ---------------------------------------------------------------------------
// sessões
// ---------------------------------------------------------------------------
export async function criarSessao(usuarioId: number): Promise<string> {
  const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await sha256Hex(token);
  const expiraEm = new Date(Date.now() + SESSAO_DIAS * 86_400_000).toISOString();
  await getDb().insert(sessoes).values({ tokenHash, usuarioId, expiraEm });
  return token;
}

const OPCOES_COOKIE = { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: SESSAO_DIAS * 86_400 } as const;
/** O contexto do cabeçalho (grupo, unidade, PCA) é de UMA pessoa — sai quando a conta muda. */
const COOKIES_CONTEXTO = ["pca_grupo", "pca_reparticao", "pca_filtro"];

type Jar = Awaited<ReturnType<typeof cookies>>;

function gravarContas(jar: Jar, tokens: readonly string[]) {
  const v = textoContas(tokens);
  if (v) jar.set(COOKIE_CONTAS, v, OPCOES_COOKIE);
  else jar.delete(COOKIE_CONTAS);
}

/** As sessões VÁLIDAS dos tokens (não vencidas, pessoa ATIVA, dentro do limite de inatividade do ADM), com a pessoa. */
async function sessoesValidas(tokens: readonly string[]) {
  const unicos = [...new Set(tokens)].slice(0, MAX_CONTAS + 2);
  if (unicos.length === 0) return [];
  const hashes = await Promise.all(unicos.map((t) => sha256Hex(t)));
  const [linhas, cfg] = await Promise.all([
    getDb()
      .select({ ...colunasSessao, tokenHash: sessoes.tokenHash, sessaoId: sessoes.id, vistoEm: sessoes.vistoEm, criadoEmSessao: sessoes.criadoEm })
      .from(sessoes)
      .innerJoin(usuarios, eq(sessoes.usuarioId, usuarios.id))
      .leftJoin(papeis, eq(papeis.id, papelDoUsuarioSql))
      .where(and(inArray(sessoes.tokenHash, hashes), gt(sessoes.expiraEm, new Date().toISOString()))),
    getConfigSeguranca(),
  ]);
  const agora = Date.now();
  return unicos.flatMap((token, i) => {
    const l = linhas.find((x) => x.tokenHash === hashes[i]);
    if (!l || l.status !== "ativo" || sessaoInativa(l.vistoEm ?? l.criadoEmSessao, agora, cfg.inatividadeMin)) return [];
    const { tokenHash: _h, sessaoId, vistoEm: _v, criadoEmSessao: _c, ...row } = l;
    return [{ token, sessaoId, pessoa: sessaoDaLinha(row) }];
  });
}

async function apagarSessoes(ids: number[]) {
  if (ids.length) await getDb().delete(sessoes).where(inArray(sessoes.id, ids)).catch(() => {});
}

/**
 * Põe a sessão nova no cookie. Se o navegador já tinha a sessão VÁLIDA de OUTRA pessoa (o "Adicionar conta"), ela é
 * GUARDADA em `pca_contas` para a troca rápida; a da MESMA pessoa (entrou de novo) é encerrada — nunca duas sessões
 * guardadas da mesma conta. Trocou a pessoa = o contexto do cabeçalho (grupo/unidade/PCA) sai.
 */
export async function definirCookieSessao(token: string): Promise<void> {
  const jar = await cookies();
  const antigo = jar.get(COOKIE)?.value;
  const contas = lerContas(jar.get(COOKIE_CONTAS)?.value);
  jar.set(COOKIE, token, OPCOES_COOKIE);
  const outros = [...(antigo && antigo !== token ? [antigo] : []), ...contas.filter((t) => t !== token)];
  if (outros.length === 0) return;
  const validas = await sessoesValidas([token, ...outros]);
  const nova = validas.find((v) => v.token === token)?.pessoa.id ?? null;
  const vistos = new Set<number>(nova == null ? [] : [nova]);
  const lista: string[] = [];
  const apagar: number[] = [];
  for (const t of outros) {
    const v = validas.find((x) => x.token === t);
    if (!v) continue;
    if (vistos.has(v.pessoa.id) || lista.length >= MAX_CONTAS) apagar.push(v.sessaoId);
    else {
      vistos.add(v.pessoa.id);
      lista.push(t);
    }
  }
  gravarContas(jar, lista);
  const pessoaAntiga = validas.find((x) => x.token === antigo)?.pessoa.id;
  if (antigo && pessoaAntiga !== nova) for (const c of COOKIES_CONTEXTO) jar.delete(c);
  await apagarSessoes(apagar);
}

/** As OUTRAS contas guardadas neste navegador (só as de sessão ainda válida — as vencidas saem do cookie). Rota. */
export async function contasDoAparelho(atual: number): Promise<UsuarioSessao[]> {
  const jar = await cookies();
  const tokens = lerContas(jar.get(COOKIE_CONTAS)?.value);
  if (tokens.length === 0) return [];
  const validas = (await sessoesValidas(tokens)).filter((v) => v.pessoa.id !== atual);
  if (validas.length !== tokens.length) gravarContas(jar, validas.map((v) => v.token));
  return validas.map((v) => v.pessoa);
}

/** Troca para uma conta GUARDADA: ela vira a ativa e a atual vai para a lista. `null` = não está guardada (ou venceu). */
export async function trocarConta(usuarioId: number): Promise<UsuarioSessao | null> {
  const jar = await cookies();
  const atual = jar.get(COOKIE)?.value;
  const contas = lerContas(jar.get(COOKIE_CONTAS)?.value);
  const validas = await sessoesValidas([...(atual ? [atual] : []), ...contas]);
  const alvo = validas.find((v) => v.token !== atual && v.pessoa.id === usuarioId);
  if (!alvo) return null;
  jar.set(COOKIE, alvo.token, OPCOES_COOKIE);
  gravarContas(
    jar,
    validas.filter((v) => v.token !== alvo.token && v.pessoa.id !== usuarioId).map((v) => v.token),
  );
  for (const c of COOKIES_CONTEXTO) jar.delete(c);
  return alvo.pessoa;
}

/** O id da sessão ATUAL (pelo cookie) — trocar a senha encerra as OUTRAS sessões e mantém esta. */
export async function sessaoAtualId(): Promise<number | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const [r] = await getDb().select({ id: sessoes.id }).from(sessoes).where(eq(sessoes.tokenHash, await sha256Hex(token))).limit(1);
  return r?.id ?? null;
}

/** Sai da conta ATUAL. Com outra conta guardada neste navegador, ela vira a ativa (devolve a pessoa). */
export async function encerrarSessaoAtual(): Promise<UsuarioSessao | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await getDb().delete(sessoes).where(eq(sessoes.tokenHash, await sha256Hex(token)));
  jar.delete(COOKIE);
  for (const c of COOKIES_CONTEXTO) jar.delete(c);
  const contas = lerContas(jar.get(COOKIE_CONTAS)?.value);
  if (contas.length === 0) return null;
  const [prox, ...resto] = await sessoesValidas(contas);
  if (!prox) {
    jar.delete(COOKIE_CONTAS);
    return null;
  }
  jar.set(COOKIE, prox.token, OPCOES_COOKIE);
  gravarContas(jar, resto.map((v) => v.token));
  return prox.pessoa;
}

/** Sai de TODAS as contas deste navegador (a ativa e as guardadas). */
export async function encerrarTodasSessoes(): Promise<void> {
  const jar = await cookies();
  const tokens = [jar.get(COOKIE)?.value, ...lerContas(jar.get(COOKIE_CONTAS)?.value)].filter((t): t is string => !!t);
  const hashes = await Promise.all(tokens.map((t) => sha256Hex(t)));
  if (hashes.length) await getDb().delete(sessoes).where(inArray(sessoes.tokenHash, hashes));
  for (const c of [COOKIE, COOKIE_CONTAS, ...COOKIES_CONTEXTO]) jar.delete(c);
}

/** O papel da pessoa: o `papel_id`; sem ele (legado), o papel do sistema de mesma chave que o `role`. */
export const papelDoUsuarioSql = sql`COALESCE(${usuarios.papelId}, (SELECT p2.id FROM ${papeis} AS p2 WHERE p2.chave = ${usuarios.role}))`;

/** O papel lido do banco → o da sessão (capacidades e detalhes normalizados; sem papel = nenhuma tela; JSON inválido = o
 * padrão dos detalhes, sem restrições). */
export function papelDaLinha(p: {
  id: number | null;
  nome: string | null;
  chave: string | null;
  capacidades: string | null;
  detalhes?: string | null;
}): PapelSessao {
  let caps: Capacidades = {};
  try {
    caps = coerceCapacidades(JSON.parse(p.capacidades ?? "{}"));
  } catch {
    caps = {};
  }
  return { id: p.id, nome: p.nome ?? "Sem papel", chave: p.chave, capacidades: caps, detalhes: detalhesDoJson(p.detalhes) };
}

/** As colunas da SESSÃO (com o papel) — `getUsuarioAtual` e quem monta a pessoa sem cookie (cron, feed .ics). Use com
 * `.leftJoin(papeis, eq(papeis.id, papelDoUsuarioSql))`. */
export const colunasSessao = {
  id: usuarios.id,
  email: usuarios.email,
  nome: usuarios.nome,
  apelido: usuarios.apelido,
  matricula: usuarios.matricula,
  // A FOTO não é lida aqui (pode ter centenas de KB): só se existe + a versão da URL com cache.
  temFoto: sql<number>`(${usuarios.foto} IS NOT NULL AND ${usuarios.foto} <> '')`,
  versao: usuarios.atualizadoEm,
  status: usuarios.status,
  papelId: papeis.id,
  papelNome: papeis.nome,
  papelChave: papeis.chave,
  papelCapacidades: papeis.capacidades,
  papelDetalhes: papeis.detalhes,
  trocarSenha: usuarios.trocarSenha,
};

type LinhaSessao = {
  id: number;
  email: string;
  nome: string;
  apelido: string | null;
  matricula: string | null;
  temFoto: number;
  versao: string | null;
  status: "ativo" | "pendente" | "inativo";
  papelId: number | null;
  papelNome: string | null;
  papelChave: string | null;
  papelCapacidades: string | null;
  papelDetalhes: string | null;
  trocarSenha: boolean;
};

/** A linha de `colunasSessao` → a pessoa da sessão. */
export function sessaoDaLinha(row: LinhaSessao): UsuarioSessao {
  const { temFoto, versao, papelId, papelNome, papelChave, papelCapacidades, papelDetalhes, ...u } = row;
  const papel = papelDaLinha({ id: papelId, nome: papelNome, chave: papelChave, capacidades: papelCapacidades, detalhes: papelDetalhes });
  return { ...u, apelido: u.apelido ?? null, foto: urlFoto(u.id, !!temFoto, versao), admin: papel.chave === "admin", papel, pendencia: SEM_PENDENCIA };
}

/**
 * Usuário logado (ou null). Só retorna se a sessão é válida e o usuário ativo. Lê o PAPEL junto (uma consulta) e é
 * memorizado POR REQUISIÇÃO (`cache` do React): layout, página e rotas chamam à vontade.
 */
export const getUsuarioAtual = cache(async (): Promise<UsuarioSessao | null> => {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const idAp = jar.get(COOKIE_APARELHO)?.value;
  const hashAp = idAparelhoValido(idAp) ? await hashDoAparelho(idAp) : "";
  const [[linha], cfg, cfgConta] = await Promise.all([
    getDb()
    .select({
      ...colunasSessao,
      sessaoId: sessoes.id,
      vistoEm: sessoes.vistoEm,
      criadoEmSessao: sessoes.criadoEm,
      aparelhoSessao: sessoes.aparelhoId,
      // O aparelho deste navegador já nomeado pela pessoa (pelo cookie) e o MENOR prazo de termo pendente — na MESMA consulta.
      aparelhoConhecido: sql<number | null>`(SELECT ap.id FROM aparelhos AS ap WHERE ap.usuario_id = ${usuarios.id} AND ap.hash = ${hashAp})`,
      termoPrazo: sql<string | null>`(SELECT MIN(tp.prazo) FROM termos_pendencias AS tp WHERE tp.usuario_id = ${usuarios.id})`,
    })
    .from(sessoes)
    .innerJoin(usuarios, eq(sessoes.usuarioId, usuarios.id))
    .leftJoin(papeis, eq(papeis.id, papelDoUsuarioSql))
    .where(
      and(
        eq(sessoes.tokenHash, tokenHash),
        gt(sessoes.expiraEm, new Date().toISOString()),
      ),
    )
    .limit(1),
    getConfigSeguranca(),
    getAcessoConta(),
  ]);
  if (linha?.status !== "ativo") return null;
  const { sessaoId, vistoEm, criadoEmSessao, aparelhoSessao, aparelhoConhecido, termoPrazo, ...row } = linha;
  // INATIVIDADE (Configurações → Segurança): parada além do limite = encerrada. A atividade é gravada no máximo a cada
  // poucos minutos (best-effort — nunca derruba a requisição).
  const agora = Date.now();
  const visto = vistoEm ?? criadoEmSessao;
  if (sessaoInativa(visto, agora, cfg.inatividadeMin)) {
    await getDb().delete(sessoes).where(eq(sessoes.id, sessaoId)).catch(() => {});
    return null;
  }
  if (renovarAtividade(visto, agora, cfg.inatividadeMin)) {
    const db = getDb();
    const iso = new Date(agora).toISOString();
    // A atividade da sessão e o ÚLTIMO ACESSO da pessoa (o histórico de acesso) no mesmo lote.
    await db
      .batch([db.update(sessoes).set({ vistoEm: iso }).where(eq(sessoes.id, sessaoId)), db.update(usuarios).set({ ultimoAcessoEm: iso }).where(eq(usuarios.id, row.id))])
      .catch(() => {});
  }
  const pessoa = sessaoDaLinha(row);
  const quem = { id: pessoa.id, admin: pessoa.admin };
  if (!regrasValemPara(cfgConta, quem)) return pessoa;
  // O aparelho: a sessão já ligada vale; a NÃO ligada de um aparelho conhecido é ligada agora (best-effort) — menos no teste
  // com "repetir a cada login", em que cada sessão nova nomeia (ou escolhe) o aparelho de novo.
  let aparelhoId = aparelhoSessao ?? null;
  if (aparelhoId == null && aparelhoConhecido != null && !repeteAoEntrar(cfgConta, quem)) {
    aparelhoId = aparelhoConhecido;
    await getDb().update(sessoes).set({ aparelhoId }).where(eq(sessoes.id, sessaoId)).catch(() => {});
  }
  const nomearAparelho = aparelhosValemPara(cfgConta, quem) && aparelhoId == null;
  return { ...pessoa, pendencia: { nomearAparelho, termo: estadoTermo(termoPrazo), aparelhoId } };
});

/** Quantos usuários existem (para o bootstrap do primeiro admin). */
export async function contarUsuarios(): Promise<number> {
  const [r] = await getDb()
    .select({ n: sql<number>`COUNT(*)` })
    .from(usuarios);
  return Number(r?.n ?? 0);
}
