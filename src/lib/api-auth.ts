import { NextResponse } from "next/server";
import { type Acesso, getAcesso, motivoNoQuadro, motivoRecusa, podePca } from "./acesso";
import { getUsuarioAtual, type UsuarioSessao } from "./auth";
import type { AcaoPapel, Tela } from "./papeis-core";

/** Exige usuário autenticado. Retorna { u } ou { erro } (resposta 401). */
export async function exigirUsuario(): Promise<
  { u: UsuarioSessao } | { erro: NextResponse }
> {
  const u = await getUsuarioAtual();
  if (!u)
    return { erro: NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 }) };
  return { u };
}

/** Exige o papel ADMINISTRADOR (a Administração: usuários, grupos, permissões, papéis e configurações). */
export async function exigirAdmin(): Promise<
  { u: UsuarioSessao } | { erro: NextResponse }
> {
  const r = await exigirUsuario();
  if ("erro" in r) return r;
  if (!r.u.admin)
    return { erro: NextResponse.json({ ok: false, error: "Somente o Administrador pode fazer isto." }, { status: 403 }) };
  return r;
}

export type Guarda = { u: UsuarioSessao; acesso: Acesso };

const naoAutenticado = () => ({ erro: NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 }) });

/** Exige a sessão e devolve também o ACESSO (para as rotas que conferem a tela pelo RECURSO — `recusa`). */
export async function exigirSessao(): Promise<Guarda | { erro: NextResponse }> {
  const acesso = await getAcesso();
  if (!acesso) return naoAutenticado();
  return { u: acesso.u, acesso };
}

/** A recusa (403) quando a AÇÃO não é permitida na tela — no grupo ativo ou, com `grupoId`, no grupo do recurso.
 * `null` = pode. A mensagem diz o motivo: a tela fechada (grupo/papel) ou a ação que o papel não permite. */
export function recusa(acesso: Acesso, tela: Tela, acao: AcaoPapel, grupoId?: number | null): NextResponse | null {
  const error = motivoRecusa(acesso, tela, acao, grupoId);
  return error ? NextResponse.json({ ok: false, error }, { status: 403 }) : null;
}

/** A recusa (403) nas TAREFAS de um quadro — pelo papel no GRUPO DO QUADRO (`podeNoQuadro`); `pelaAgenda` = a tela
 * Calendário também vale (a tarefa e os eventos). `null` = pode. */
export function recusaNoQuadro(acesso: Acesso, q: { grupoId: number }, acao: AcaoPapel, pelaAgenda = false): NextResponse | null {
  const error = motivoNoQuadro(acesso, q.grupoId, acao, pelaAgenda);
  return error ? NextResponse.json({ ok: false, error }, { status: 403 }) : null;
}

/** A recusa (403) quando o PCA não está entre os do GRUPO ATIVO (Grupos → PCAs do grupo); `null` = pode. O ADM, todos. */
export async function recusaPca(pcaId: number): Promise<NextResponse | null> {
  return podePca(await getAcesso(), pcaId)
    ? null
    : NextResponse.json({ ok: false, error: "Este PCA não está entre os do seu grupo — peça acesso ao administrador." }, { status: 403 });
}

/** Exige a AÇÃO numa das telas (no grupo ativo) — várias telas = basta uma permitir. */
export async function exigirAcesso(telas: Tela | readonly Tela[], acao: AcaoPapel): Promise<Guarda | { erro: NextResponse }> {
  const g = await exigirSessao();
  if ("erro" in g) return g;
  const lista: readonly Tela[] = typeof telas === "string" ? [telas] : telas;
  let primeira: NextResponse | null = null;
  for (const t of lista) {
    const r = recusa(g.acesso, t, acao);
    if (!r) return g;
    primeira ??= r;
  }
  return { erro: primeira ?? NextResponse.json({ ok: false, error: "Sem permissão." }, { status: 403 }) };
}

export const intId = (v: string) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};
