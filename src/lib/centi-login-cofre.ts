import { abrirLoginCenti, cifrarLoginCenti, type LoginCenti, mascararUsuario, PROPOSITO_LOGIN_CENTI } from "./centi-login-core.ts";
import {
  comandoApagarLoginCenti,
  comandoAutoLoginCenti,
  comandoGuardarLoginCenti,
  comandoPausarLoginCenti,
  comandoRecifrarLoginCenti,
  comandoUsoLoginCenti,
  consultaLoginCenti,
} from "./centi-login-sql.ts";
import { getDb } from "./db";
import { chaveDoProposito, chaveDosSegredos, temChaveMestra } from "./integracoes-segredos";

/**
 * O LOGIN DA CENTI de cada ADM no BANCO (`centi_logins`) — a ÚNICA fonte (a extensão não guarda a senha). Cifrado com
 * AES-GCM pela chave DERIVADA da mestra para este propósito e com o DONO como dado adicional (`centi-login-core.ts`).
 * A senha em claro só sai para a rota da extensão; a tela recebe só a situação. Só escopo de request.
 */
export type { LoginCenti };

export type SituacaoLoginCenti = {
  tem: boolean;
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

export async function situacaoLoginCenti(usuarioId: number): Promise<SituacaoLoginCenti> {
  const { linha, login } = await abrir(usuarioId);
  return {
    tem: !!login,
    usuario: login ? mascararUsuario(login.usuario) : "",
    auto: linha ? linha.auto === 1 : true,
    atualizadoEm: linha?.atualizadoEm ?? null,
    ultimoUsoEm: linha?.ultimoUsoEm ?? null,
    pausadoEm: login ? (linha?.pausadoEm ?? null) : null,
    motivo: login ? (linha?.motivo ?? null) : null,
  };
}

/** Em claro — SÓ a rota da extensão chama. Com a pausa, a senha não sai (nenhum navegador tenta a recusada). */
export async function lerLoginCenti(usuarioId: number): Promise<{ login: LoginCenti | null; pausadoEm: string | null; motivo: string | null }> {
  const { linha, login } = await abrir(usuarioId);
  if (!login || !linha) return { login: null, pausadoEm: null, motivo: null };
  if (linha.pausadoEm) return { login: null, pausadoEm: linha.pausadoEm, motivo: linha.motivo };
  await comandoUsoLoginCenti(getDb(), usuarioId, new Date().toISOString()).catch(() => null);
  return { login, pausadoEm: null, motivo: null };
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

/** A Centi recusou a senha (a extensão avisa): pausa em todos os navegadores da pessoa. */
export const pausarLoginCenti = (usuarioId: number, motivo: string) => comandoPausarLoginCenti(getDb(), usuarioId, motivo, new Date().toISOString());

export const apagarLoginCenti = (usuarioId: number) => comandoApagarLoginCenti(getDb(), usuarioId);
