import { eq } from "drizzle-orm";
import { usuarios } from "../db/schema.ts";
import {
  abrirLoginCenti,
  type CodigoPausa,
  cifrarLoginCenti,
  impressaoDaChave,
  type LoginCenti,
  MOTIVO_PAUSA,
  mascararUsuario,
  PROPOSITO_LOGIN_CENTI,
  podeAutorizarSemSenha,
  type Selado,
  selarParaChave,
} from "./centi-login-core.ts";
import {
  comandoApagarLoginCenti,
  comandoAutoLoginCenti,
  comandoGuardarLoginCenti,
  comandoPausarLoginCenti,
  comandoRecifrarLoginCenti,
  comandoImportarLoginCenti,
  consultaAutorizouNaSessao,
  comandosAutorizarChave,
  comandoTirarChave,
  comandoUsoChave,
  comandoUsoLoginCenti,
  consultaChaveLogin,
  consultaChavesLogin,
  consultaLoginCenti,
} from "./centi-login-sql.ts";
import { SENHA_INUTILIZAVEL } from "./google-oauth-core";
import { verificarSenha } from "./password";
import { getDb } from "./db";
import { chaveDoProposito, chaveDosSegredos, temChaveMestra } from "./integracoes-segredos";

/**
 * O LOGIN DA CENTI de cada ADM no BANCO (`centi_logins`) — a ÚNICA fonte (a extensão não guarda a senha). Cifrado com
 * AES-GCM pela chave DERIVADA da mestra para este propósito e com o DONO como dado adicional (`centi-login-core.ts`).
 * A senha NUNCA sai em claro: só SELADA à chave de um navegador autorizado com a senha do sistema (`centi_login_chaves`).
 * A tela recebe só a situação. Só escopo de request.
 */
export type { LoginCenti };

export type NavegadorAutorizado = { id: number; navegador: string; criadoEm: string; usadoEm: string | null };
export type SituacaoLoginCenti = {
  tem: boolean;
  /** Há um login guardado, mas ele não abre (a chave mestra mudou): salve de novo. */
  ilegivel: boolean;
  /** A conta do sistema (o nome) — a extensão mostra para quem vai o login antigo dela. */
  conta: string;
  /** Este navegador (pela impressão da chave da extensão) está autorizado. */
  autorizada: boolean;
  navegadores: NavegadorAutorizado[];
  usuario: string;
  auto: boolean;
  atualizadoEm: string | null;
  ultimoUsoEm: string | null;
  pausadoEm: string | null;
  motivo: string | null;
};

export const cofreDisponivel = () => temChaveMestra();

async function chaves(): Promise<{ nova: Uint8Array; legada: Uint8Array } | null> {
  const [nova, legada] = await Promise.all([chaveDoProposito(PROPOSITO_LOGIN_CENTI), chaveDosSegredos()]);
  return nova && legada ? { nova, legada } : null;
}

/** Abre a linha (regrava em silêncio o formato antigo no novo). `null` sem linha ou se não abrir. */
async function abrir(usuarioId: number) {
  const db = getDb();
  const [l] = await consultaLoginCenti(db, usuarioId);
  if (!l) return { linha: null, login: null };
  const k = await chaves();
  if (!k) return { linha: l, login: null };
  const a = await abrirLoginCenti(k.nova, k.legada, usuarioId, l.cifrado);
  if (!a) return { linha: l, login: null };
  const auto = a.legado && typeof a.auto === "boolean" ? a.auto : l.auto === 1;
  if (a.legado) await comandoRecifrarLoginCenti(db, usuarioId, await cifrarLoginCenti(k.nova, usuarioId, a), auto).catch(() => null);
  return { linha: { ...l, auto: auto ? 1 : 0 }, login: { usuario: a.usuario, senha: a.senha, auto } as LoginCenti };
}

export async function situacaoLoginCenti(u: { id: number; nome: string }, impressao: string | null = null): Promise<SituacaoLoginCenti> {
  const [{ linha, login }, chavesNav] = await Promise.all([abrir(u.id), consultaChavesLogin(getDb(), u.id)]);
  return {
    tem: !!login,
    ilegivel: !!linha && !login,
    conta: u.nome,
    autorizada: !!impressao && chavesNav.some((c) => c.impressao === impressao),
    navegadores: chavesNav.map((c) => ({ id: c.id, navegador: c.navegador, criadoEm: c.criadoEm, usadoEm: c.usadoEm })),
    usuario: login ? mascararUsuario(login.usuario) : "",
    auto: linha ? linha.auto === 1 : true,
    atualizadoEm: linha?.atualizadoEm ?? null,
    ultimoUsoEm: linha?.ultimoUsoEm ?? null,
    pausadoEm: login ? (linha?.pausadoEm ?? null) : null,
    motivo: login ? (linha?.motivo ?? null) : null,
  };
}

/**
 * A ENTREGA à extensão: o login SELADO à chave do navegador autorizado (`impressao`) — nunca em claro. Sem login, com a
 * pausa ou com o navegador não autorizado, nada da senha sai.
 */
export async function entregarLoginCenti(
  usuarioId: number,
  impressao: string,
): Promise<{ estado: "semLogin" } | { estado: "naoAutorizado" } | { estado: "pausado"; motivo: string | null } | { estado: "ok"; selado: Selado; auto: boolean }> {
  const db = getDb();
  const { linha, login } = await abrir(usuarioId);
  if (!login || !linha) return { estado: "semLogin" };
  const [chave] = await consultaChaveLogin(db, usuarioId, impressao);
  if (!chave) return { estado: "naoAutorizado" };
  if (linha.pausadoEm) return { estado: "pausado", motivo: linha.motivo };
  const selado = await selarParaChave(chave.publica, chave.impressao, JSON.stringify({ usuario: login.usuario, senha: login.senha }));
  const em = new Date().toISOString();
  await db.batch([comandoUsoLoginCenti(db, usuarioId, em), comandoUsoChave(db, chave.id, em)]).catch(() => null);
  return { estado: "ok", selado, auto: login.auto };
}

/**
 * AUTORIZA o navegador (a chave pública da extensão). Sem `senhaSistema`, só uma sessão recém-criada (a pessoa acabou de
 * entrar no sistema neste navegador — `podeAutorizarSemSenha`); com ela, a qualquer hora. `null` = autorizado.
 */
export async function autorizarNavegador(
  usuarioId: number,
  publica: string,
  navegador: string,
  senhaSistema: string | null,
  sessao: { id: number; criadoEm: string | null } | null,
): Promise<{ motivo: string | null; jaAutorizado?: boolean }> {
  const impressao = await impressaoDaChave(publica);
  if (!impressao) return { motivo: "A chave da extensão é inválida — atualize a extensão e tente de novo." };
  const db = getDb();
  if ((await consultaChaveLogin(db, usuarioId, impressao)).length) return { motivo: null, jaAutorizado: true };
  if (senhaSistema === null) {
    const ja = sessao ? (await consultaAutorizouNaSessao(db, usuarioId, sessao.id)).length > 0 : true;
    if (!sessao || !podeAutorizarSemSenha(sessao.criadoEm, Date.now(), ja))
      return { motivo: "Para autorizar este navegador, entre no sistema de novo nele (ou confirme com a senha do sistema)." };
  } else {
    const [p] = await db.select({ hash: usuarios.senhaHash }).from(usuarios).where(eq(usuarios.id, usuarioId)).limit(1);
    if (!p?.hash || p.hash === SENHA_INUTILIZAVEL) return { motivo: "Sua conta não tem senha do sistema — crie uma no Perfil para autorizar navegadores." };
    if (!(await verificarSenha(senhaSistema, p.hash))) return { motivo: "Senha do sistema incorreta." };
  }
  await db.batch([
    ...comandosAutorizarChave(db, {
      usuarioId,
      impressao,
      publica,
      navegador: navegador.slice(0, 80) || "Navegador",
      em: new Date().toISOString(),
      sessaoId: senhaSistema === null ? (sessao?.id ?? null) : null,
    }),
  ]);
  return { motivo: null };
}

export async function tirarNavegador(usuarioId: number, id: number): Promise<boolean> {
  return (await comandoTirarChave(getDb(), usuarioId, id)).length > 0;
}

/** A IMPORTAÇÃO do login da extensão antiga (pedida pela pessoa no popup): só quando não há login — nunca sobrescreve. */
export async function importarLoginCenti(usuarioId: number, l: LoginCenti): Promise<"ok" | "existe" | "semChave"> {
  const k = await chaves();
  if (!k) return "semChave";
  const r = await comandoImportarLoginCenti(getDb(), usuarioId, await cifrarLoginCenti(k.nova, usuarioId, l), l.auto, new Date().toISOString());
  return r.length ? "ok" : "existe";
}

/**
 * Salva: `senha` `null` = mantém a guardada (trocar só o usuário ou o "Entrar sozinho" não exige redigitar). Devolve o
 * motivo da recusa (`null` = gravado). Salvar zera a pausa.
 */
export async function guardarLoginCenti(usuarioId: number, l: { usuario: string | null; senha: string | null; auto: boolean }): Promise<string | null> {
  const k = await chaves();
  if (!k) return "O sistema está sem a chave mestra (INTEGRACOES_CHAVE) para cifrar o login.";
  const db = getDb();
  const em = new Date().toISOString();
  if (l.usuario === null && l.senha === null) {
    const { linha } = await abrir(usuarioId);
    if (!linha) return "Informe o usuário e a senha da Centi.";
    await comandoAutoLoginCenti(db, usuarioId, l.auto, em);
    return null;
  }
  let usuario = l.usuario;
  let senha = l.senha;
  if (usuario === null || senha === null) {
    const { login } = await abrir(usuarioId);
    if (!login) return "Informe o usuário e a senha da Centi.";
    usuario ??= login.usuario;
    senha ??= login.senha;
  }
  await comandoGuardarLoginCenti(db, usuarioId, await cifrarLoginCenti(k.nova, usuarioId, { usuario, senha }), l.auto, em);
  return null;
}

/** A Centi recusou o login ou pediu verificação (a extensão avisa pelo CÓDIGO): pausa em todos os navegadores da pessoa. */
export const pausarLoginCenti = (usuarioId: number, codigo: CodigoPausa) =>
  comandoPausarLoginCenti(getDb(), usuarioId, MOTIVO_PAUSA[codigo], new Date().toISOString());

export const apagarLoginCenti = (usuarioId: number) => comandoApagarLoginCenti(getDb(), usuarioId);
