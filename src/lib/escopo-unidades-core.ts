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
export type FiltroLista = { tipo: "todas" } | { tipo: "unidade"; id: number; codigo: string } | { tipo: "nenhuma" };

export const FILTRO_TODAS: FiltroLista = Object.freeze({ tipo: "todas" });
export const FILTRO_NENHUMA: FiltroLista = Object.freeze({ tipo: "nenhuma" });

/**
 * O que as LISTAS mostram: a unidade ATIVA do cabeçalho — a "Geral" = todas as que a pessoa acessa; sem unidade ativa,
 * nada (o ADM, que acessa todas, vê todas).
 */
export function filtroDeLista(admin: boolean, ativa: UnidadeRef | null): FiltroLista {
  if (!ativa) return admin ? FILTRO_TODAS : FILTRO_NENHUMA;
  if (ehCodigoGeral(ativa.codigo)) return FILTRO_TODAS;
  return { tipo: "unidade", id: ativa.id, codigo: ativa.codigo };
}

/** O id para as consultas que filtram por UMA unidade: `null` = todas; `false` = nenhuma (a lista é vazia). */
export function idDoFiltro(f: FiltroLista): number | null | false {
  return f.tipo === "todas" ? null : f.tipo === "nenhuma" ? false : f.id;
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
