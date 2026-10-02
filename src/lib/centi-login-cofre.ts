import { decifrarSegredo, cifrarSegredo, temChaveMestra } from "./integracoes-segredos";
import { excluirPreferenciaTabela, listarPreferenciasTabela, salvarPreferenciaTabela } from "./preferencias-tabela";

/**
 * O LOGIN DA CENTI guardado no SISTEMA (opcional — a pessoa marca na extensão): usuário + senha CIFRADOS com a chave mestra
 * do Worker (`INTEGRACOES_CHAVE`), por pessoa, nas preferências dela. Serve só para a extensão voltar a ter o login
 * depois de reinstalada; a senha só sai para a ORIGEM da própria extensão (a rota confere). Só escopo de request.
 */
const CHAVE = "cofre:centi-login";
export type LoginCenti = { usuario: string; senha: string; auto: boolean };

export const cofreDisponivel = () => temChaveMestra();

export async function situacaoLoginCenti(usuarioId: number): Promise<{ tem: boolean; atualizadoEm: string | null }> {
  const v = (await listarPreferenciasTabela(usuarioId, CHAVE))[CHAVE] as { dados?: unknown; em?: unknown } | undefined;
  return { tem: typeof v?.dados === "string", atualizadoEm: typeof v?.em === "string" ? v.em : null };
}

export async function lerLoginCenti(usuarioId: number): Promise<LoginCenti | null> {
  const v = (await listarPreferenciasTabela(usuarioId, CHAVE))[CHAVE] as { dados?: unknown } | undefined;
  if (typeof v?.dados !== "string") return null;
  const claro = await decifrarSegredo(v.dados);
  if (!claro) return null;
  try {
    const j = JSON.parse(claro) as Partial<LoginCenti>;
    return typeof j.usuario === "string" && typeof j.senha === "string" ? { usuario: j.usuario, senha: j.senha, auto: j.auto !== false } : null;
  } catch {
    return null;
  }
}

export async function guardarLoginCenti(usuarioId: number, l: LoginCenti): Promise<void> {
  await salvarPreferenciaTabela(usuarioId, CHAVE, { dados: await cifrarSegredo(JSON.stringify(l)), em: new Date().toISOString() });
}

export const apagarLoginCenti = (usuarioId: number) => excluirPreferenciaTabela(usuarioId, CHAVE);
