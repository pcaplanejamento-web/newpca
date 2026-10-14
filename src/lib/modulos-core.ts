import { ABA_KEYS, ABAS, type AbaKey, abasConhecidas } from "./abas.ts";

/**
 * MÓDULOS (Configurações → Módulos) — núcleo PURO. O ADM agrupa as TELAS em módulos (nome + as telas, na ordem); a
 * navegação mostra uma seção por módulo e o GRUPO libera MÓDULOS (as telas vêm deles — mudar um módulo muda todos os
 * grupos que o usam). Uma tela fica em UM módulo; a tela fora de todos não abre para ninguém além do Administrador.
 * Sem config (ou inválida) = o padrão: um módulo "Módulos" com todas as telas (a navegação de antes).
 */

export type Modulo = { id: string; nome: string; telas: AbaKey[] };

export const MAX_MODULOS = 12;
export const MAX_NOME_MODULO = 40;

export const MODULOS_PADRAO: Modulo[] = [{ id: "modulos", nome: "Módulos", telas: [...ABA_KEYS] }];

const ID_VALIDO = /^[a-z0-9][a-z0-9-]{0,39}$/;

/** "Planejamento e Compras" → "planejamento-e-compras" (o id de um módulo novo). */
export function idDoNome(nome: string, usados: ReadonlySet<string>): string {
  const base =
    nome
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "modulo";
  let id = base;
  for (let n = 2; usados.has(id); n++) id = `${base}-${n}`;
  return id;
}

/** Qualquer valor → a lista válida: ids únicos, nome obrigatório (≤ 40), cada tela em UM módulo (o primeiro vence),
 * até 12 módulos. Nada válido = o padrão. */
export function lerModulos(bruto: unknown): Modulo[] {
  if (!Array.isArray(bruto)) return MODULOS_PADRAO;
  const ids = new Set<string>();
  const usadas = new Set<AbaKey>();
  const out: Modulo[] = [];
  for (const m of bruto) {
    if (out.length >= MAX_MODULOS || !m || typeof m !== "object") continue;
    const { id, nome, telas } = m as Record<string, unknown>;
    const n = typeof nome === "string" ? nome.replace(/\s+/g, " ").trim().slice(0, MAX_NOME_MODULO) : "";
    if (typeof id !== "string" || !ID_VALIDO.test(id) || ids.has(id) || !n) continue;
    ids.add(id);
    const lista = abasConhecidas(telas).filter((t) => !usadas.has(t));
    for (const t of lista) usadas.add(t);
    out.push({ id, nome: n, telas: lista });
  }
  return out.length ? out : MODULOS_PADRAO;
}

/** As telas que nenhum módulo tem (só o Administrador as abre — a tela de Módulos avisa). */
export function telasSemModulo(lista: readonly Modulo[]): AbaKey[] {
  const usadas = new Set(lista.flatMap((m) => m.telas));
  return ABA_KEYS.filter((t) => !usadas.has(t));
}

/** Os ids de módulo gravados no grupo: `null` = grupo antigo (telas avulsas); JSON inválido = nenhum. */
export function lerModulosGrupo(json: string | null | undefined): string[] | null {
  if (json == null) return null;
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string"))] : [];
  } catch {
    return [];
  }
}

/** As TELAS que os módulos liberam (na ordem da navegação; módulo que não existe mais não libera nada). */
export function telasDosModulos(lista: readonly Modulo[], ids: readonly string[]): AbaKey[] {
  const quer = new Set(ids);
  const telas = new Set(lista.filter((m) => quer.has(m.id)).flatMap((m) => m.telas));
  return ABA_KEYS.filter((t) => telas.has(t));
}

/** As telas que o GRUPO abre: pelos módulos dele; o grupo antigo (`modulos` NULL) segue pelas telas avulsas, só as que
 * estão em algum módulo (a tela sem módulo não abre para ninguém além do ADM). */
export function telasDoGrupo(lista: readonly Modulo[], modulos: readonly string[] | null, abasAvulsas: readonly AbaKey[]): AbaKey[] {
  if (modulos) return telasDosModulos(lista, modulos);
  const comModulo = new Set(lista.flatMap((m) => m.telas));
  return abasAvulsas.filter((t) => comModulo.has(t));
}

/** Os módulos que um grupo antigo ganharia sem ABRIR nada a mais: os que têm TODAS as telas entre as avulsas dele. */
export function modulosDasTelas(lista: readonly Modulo[], abas: readonly AbaKey[]): string[] {
  const tem = new Set(abas);
  return lista.filter((m) => m.telas.length > 0 && m.telas.every((t) => tem.has(t))).map((m) => m.id);
}

/** As seções da navegação: um módulo por seção, as telas na ordem do módulo, só as liberadas (`abertas`); seção vazia
 * some. `extras` (o ADM) = as telas sem módulo, numa seção "Outras telas" no fim. */
export function secoesDosModulos(lista: readonly Modulo[], abertas: ReadonlySet<string>, extras = false): { id: string; nome: string; telas: AbaKey[] }[] {
  const out = lista.map((m) => ({ id: m.id, nome: m.nome, telas: m.telas.filter((t) => abertas.has(t)) })).filter((s) => s.telas.length);
  const sobra = extras ? telasSemModulo(lista).filter((t) => abertas.has(t)) : [];
  if (sobra.length) out.push({ id: "_outras", nome: "Outras telas", telas: sobra });
  return out;
}

/** O rótulo de uma tela ("Mesa"). */
export const rotuloAba = (t: AbaKey) => ABAS.find((a) => a.key === t)?.label ?? t;

/** Por que os módulos do grupo não valem (um id que não existe mais) — `null` = ok. A rota recusa (422). */
export function motivoModulosInvalidos(ids: readonly string[], lista: readonly Modulo[]): string | null {
  const existem = new Set(lista.map((m) => m.id));
  const faltam = ids.filter((i) => !existem.has(i));
  return faltam.length ? `Módulo(s) não encontrado(s): ${faltam.join(", ")} — recarregue a tela.` : null;
}
