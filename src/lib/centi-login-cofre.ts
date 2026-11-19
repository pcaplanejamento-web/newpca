import {
  abrirLoginCenti,
  type CodigoPausa,
  cifrarLoginCenti,
  impressaoDaChave,
  type LoginCenti,
  MOTIVO_PAUSA,
  mascararUsuario,
  PROPOSITO_LOGIN_CENTI,
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
  comandoUsoLoginCenti,
  consultaLoginCenti,
} from "./centi-login-sql.ts";
import { getDb } from "./db";
import { chaveDoProposito, chaveDosSegredos, temChaveMestra } from "./integracoes-segredos";

/**
 * O LOGIN DA CENTI de cada ADM no BANCO (`centi_logins`) — a ÚNICA fonte (a extensão não guarda a senha). Cifrado com
 * AES-GCM pela chave DERIVADA da mestra para este propósito e com o DONO como dado adicional (`centi-login-core.ts`).
 * Estar logado como ADM basta: a extensão do navegador em que a pessoa está logada recebe o login — e a senha NUNCA sai
 * em claro: vai SELADA à chave pública que a extensão manda no pedido. A tela recebe só a situação. Só escopo de request.
 */
export type { LoginCenti };

export type SituacaoLoginCenti = {
  tem: boolean;
  /** Há um login guardado, mas ele não abre (a chave mestra mudou): salve de novo. */
  ilegivel: boolean;
  /** A conta do sistema (o nome) — a extensão mostra para quem vai o login antigo dela. */
  conta: string;
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

export async function situacaoLoginCenti(u: { id: number; nome: string }): Promise<SituacaoLoginCenti> {
  const { linha, login } = await abrir(u.id);
  return {
    tem: !!login,
    ilegivel: !!linha && !login,
    conta: u.nome,
    usuario: login ? mascararUsuario(login.usuario) : "",
    auto: linha ? linha.auto === 1 : true,
    atualizadoEm: linha?.atualizadoEm ?? null,
    ultimoUsoEm: linha?.ultimoUsoEm ?? null,
    pausadoEm: login ? (linha?.pausadoEm ?? null) : null,
    motivo: login ? (linha?.motivo ?? null) : null,
  };
}

/**
 * A ENTREGA à extensão: o login SELADO à chave pública que ela mandou (`publica`, P-256 crua em base64) — nunca em claro.
 * Sem login ou com a pausa, nada da senha sai. `chaveInvalida` = a chave não é uma P-256 válida.
 */
export async function entregarLoginCenti(
  usuarioId: number,
  publica: string,
): Promise<{ estado: "semLogin" } | { estado: "chaveInvalida" } | { estado: "pausado"; motivo: string | null } | { estado: "ok"; selado: Selado; auto: boolean }> {
  const { linha, login } = await abrir(usuarioId);
  if (!login || !linha) return { estado: "semLogin" };
  if (linha.pausadoEm) return { estado: "pausado", motivo: linha.motivo };
  const impressao = await impressaoDaChave(publica);
  if (!impressao) return { estado: "chaveInvalida" };
  const selado = await selarParaChave(publica, impressao, JSON.stringify({ usuario: login.usuario, senha: login.senha }));
  await comandoUsoLoginCenti(getDb(), usuarioId, new Date().toISOString()).catch(() => null);
  return { estado: "ok", selado, auto: login.auto };
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
