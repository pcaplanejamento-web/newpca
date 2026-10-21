/**
 * ESCOPO DE UNIDADES — de quais unidades a pessoa vê e altera os dados. Módulo PURO (cliente e servidor; testado).
 *
 * Três estados (antes "sem unidade" virava `null` = sem filtro, e quem não tinha grupo via a Mesa inteira):
 * - `todas`: o ADM (regra firme) ou um grupo que concede a unidade virtual "Geral" (código GERAL = todas);
 * - `unidades`: só as unidades listadas;
 * - `nenhuma`: sem grupo, ou grupo sem unidade — não vê dado nenhum.
 */

/** Código da unidade VIRTUAL "Geral" = todas as unidades (concedida por grupo; nunca editada). */
export const CODIGO_GERAL = "GERAL";

export function ehCodigoGeral(codigo: string | null | undefined): boolean {
  return (codigo ?? "").trim().toUpperCase() === CODIGO_GERAL;
}

export type UnidadeRef = { id: number; codigo: string };

/** De onde vêm as unidades de um GRUPO: as escolhidas pelo ADM (padrão) ou a unidade de cadastro de cada membro. */
export const MODOS_UNIDADES = ["lista", "cadastro"] as const;
export type ModoUnidades = (typeof MODOS_UNIDADES)[number];

export function lerModoUnidades(v: unknown): ModoUnidades {
  return v === "cadastro" ? "cadastro" : "lista";
}

/** As unidades EFETIVAS de um membro: no modo `cadastro`, as unidades de cadastro dele — a principal e as adicionais,
 * sem repetir (sem nenhuma, nada — e a "Geral" nunca vale); no modo `lista`, as do grupo. */
export function unidadesDoMembro<T extends UnidadeRef>(modo: ModoUnidades, doGrupo: readonly T[], cadastro: T | readonly T[] | null): T[] {
  if (modo !== "cadastro") return [...doGrupo];
  const lista = cadastro == null ? [] : Array.isArray(cadastro) ? cadastro : [cadastro as T];
  const vistos = new Set<number>();
  return lista.filter((r) => !ehCodigoGeral(r.codigo) && !vistos.has(r.id) && vistos.add(r.id));
}

/**
 * ESCOPO POR TELA (modo `cadastro`): em cada tela do grupo, só as unidades de cadastro da pessoa (padrão) ou TODAS as
 * unidades. Gravado como `{tela: "todas"}` — só o que difere do padrão.
 */
export const ESCOPOS_TELA = ["cadastro", "todas"] as const;
export type EscopoTela = (typeof ESCOPOS_TELA)[number];
export type EscopoTelas = Readonly<Record<string, "todas">>;

/** Lê o JSON gravado (texto ou objeto): só as chaves com "todas" ficam; qualquer outra coisa = vazio (= de cadastro). */
export function lerEscopoTelas(v: unknown): EscopoTelas {
  let o: unknown = v;
  if (typeof v === "string") {
    try {
      o = JSON.parse(v);
    } catch {
      return {};
    }
  }
  if (!o || typeof o !== "object" || Array.isArray(o)) return {};
  const r: Record<string, "todas"> = {};
  for (const [k, val] of Object.entries(o)) if (val === "todas" && /^[a-z]{1,30}$/.test(k)) r[k] = "todas";
  return r;
}

/** Só as telas que o grupo ABRE (uma tela que saiu do grupo não guarda escolha) — o que vai ao banco. */
export function compactarEscopoTelas(e: EscopoTelas, telas: readonly string[]): EscopoTelas {
  const r: Record<string, "todas"> = {};
  for (const t of telas) if (e[t] === "todas") r[t] = "todas";
  return r;
}

/** Nesta tela o membro vê TODAS as unidades? Só no modo `cadastro`, com a tela marcada "todas". Sem tela = não. */
export function telaVeTodas(modo: ModoUnidades | undefined, e: EscopoTelas, tela: string | null | undefined): boolean {
  return modo === "cadastro" && !!tela && e[tela] === "todas";
}

/** As telas marcadas "todas" (para o cabeçalho trocar a lista ao entrar nelas). Fora do modo `cadastro`, nenhuma. */
export function telasComTodas(modo: ModoUnidades | undefined, e: EscopoTelas): string[] {
  return modo === "cadastro" ? Object.keys(e).filter((k) => e[k] === "todas") : [];
}

/** Rotas do painel → a TELA (a chave de `ABAS`). A Mesa do PCA (`/painel/mesa?pca=`) segue a Mesa. */
const ROTAS_TELA: readonly [string, string][] = [
  ["/painel/mesa", "dfd"],
  ["/painel/dfds", "dfd"],
  ["/painel/pca", "pca"],
  ["/painel/catalogo", "catalogo"],
  ["/painel/orcamento", "orcamento"],
  ["/painel/tarefas", "tarefas"],
  ["/painel/calendario", "calendario"],
  ["/painel/verificacao", "verificacao"],
  ["/painel/documentos", "documentos"],
];
export function telaDaRota(pathname: string | null | undefined): string | null {
  const p = pathname ?? "";
  return ROTAS_TELA.find(([r]) => p === r || p.startsWith(`${r}/`))?.[1] ?? null;
}

export type EscopoUnidades = { tipo: "todas" } | { tipo: "unidades"; ids: readonly number[] } | { tipo: "nenhuma" };

export const ESCOPO_TODAS: EscopoUnidades = Object.freeze({ tipo: "todas" });
export const ESCOPO_NENHUMA: EscopoUnidades = Object.freeze({ tipo: "nenhuma" });

/** O que a pessoa ACESSA (detalhe e escrita): ADM = todas; a "Geral" entre as do grupo = todas; sem unidade = nenhuma. */
export function escopoDeAcesso(admin: boolean, lista: readonly UnidadeRef[]): EscopoUnidades {
  if (admin || lista.some((r) => ehCodigoGeral(r.codigo))) return ESCOPO_TODAS;
  if (lista.length === 0) return ESCOPO_NENHUMA;
  return { tipo: "unidades", ids: [...new Set(lista.map((r) => r.id))] };
}

/** O filtro das LISTAS (a unidade ATIVA do cabeçalho): todas · uma unidade · nenhuma (a consulta nem roda). */
export type FiltroLista =
  | { tipo: "todas" }
  | { tipo: "unidade"; id: number; codigo: string }
  | { tipo: "unidades"; ids: number[] }
  | { tipo: "nenhuma" };

/** O filtro por unidade das consultas: um id · VÁRIOS (a "Geral" das minhas unidades) · `null` = todas · `false` = nenhuma. */
export type FiltroId = number | readonly number[] | null | false;

/** A "Geral" VIRTUAL: quem vê mais de uma unidade (sem a "Geral" real) ganha a opção que SOMA as suas — o id 0 nunca
 * existe no banco e o código não é "GERAL" (não dá acesso a todas). */
export const ID_MINHAS_UNIDADES = 0;
export const CODIGO_MINHAS_UNIDADES = "Todas as minhas";

/** A lista do seletor do cabeçalho: com 2+ unidades e sem a "Geral" real, a virtual vem PRIMEIRO (e é a padrão). */
export function listaComGeral<T extends UnidadeRef & { nome: string }>(admin: boolean, lista: readonly T[]): T[] {
  if (admin || lista.length < 2 || lista.some((r) => ehCodigoGeral(r.codigo))) return [...lista];
  return [{ id: ID_MINHAS_UNIDADES, codigo: CODIGO_MINHAS_UNIDADES, nome: `Geral — soma das minhas ${lista.length} unidades` } as T, ...lista];
}

/** A unidade é a "Geral" (a real ou a virtual das minhas unidades)? — o cabeçalho e as telas a tratam como "todas". */
export function ehGeral(r: UnidadeRef | null | undefined): boolean {
  return !!r && (r.id === ID_MINHAS_UNIDADES || ehCodigoGeral(r.codigo));
}

export const FILTRO_TODAS: FiltroLista = Object.freeze({ tipo: "todas" });
export const FILTRO_NENHUMA: FiltroLista = Object.freeze({ tipo: "nenhuma" });

/**
 * O que as LISTAS mostram: a unidade ATIVA do cabeçalho — a "Geral" = todas as que a pessoa acessa; sem unidade ativa,
 * nada (o ADM, que acessa todas, vê todas).
 */
export function filtroDeLista(admin: boolean, ativa: UnidadeRef | null, lista: readonly UnidadeRef[] = []): FiltroLista {
  if (!ativa) return admin ? FILTRO_TODAS : FILTRO_NENHUMA;
  if (ehCodigoGeral(ativa.codigo)) return FILTRO_TODAS;
  if (ativa.id === ID_MINHAS_UNIDADES) {
    const ids = [...new Set(lista.filter((r) => r.id !== ID_MINHAS_UNIDADES).map((r) => r.id))];
    return ids.length === 0 ? FILTRO_NENHUMA : ids.length === 1 ? { tipo: "unidade", id: ids[0], codigo: "" } : { tipo: "unidades", ids };
  }
  return { tipo: "unidade", id: ativa.id, codigo: ativa.codigo };
}

/** O id para as consultas que filtram por UMA unidade: `null` = todas; `false` = nenhuma (a lista é vazia). */
export function idDoFiltro(f: FiltroLista): FiltroId {
  return f.tipo === "todas" ? null : f.tipo === "nenhuma" ? false : f.tipo === "unidades" ? f.ids : f.id;
}

/** O registro (pela unidade) passa no filtro? (`null` = todas; `false` = nenhuma). */
export function passaFiltroId(f: FiltroId, reparticaoId: number | null | undefined): boolean {
  if (f === null) return true;
  if (f === false || reparticaoId == null) return false;
  return typeof f === "number" ? f === reparticaoId : f.includes(reparticaoId);
}

/** Texto estável do filtro (chave de memória). */
export function chaveFiltroId(f: FiltroId): string {
  return f === null ? "todas" : f === false ? "nenhuma" : typeof f === "number" ? String(f) : [...f].sort((a, b) => a - b).join(",");
}

/**
 * O registro está no escopo? O registro SEM unidade (`null`) fica com quem tem alguma unidade (como sempre foi); no
 * escopo "nenhuma", nada.
 */
export function unidadeNoEscopo(escopo: EscopoUnidades, reparticaoId: number | null | undefined): boolean {
  if (escopo.tipo === "todas") return true;
  if (escopo.tipo === "nenhuma") return false;
  return reparticaoId == null || escopo.ids.includes(reparticaoId);
}
