import { cookies } from "next/headers";
import { listarPcas, type PcaResumo } from "./dfd";

/**
 * PCA do CABEÇALHO — o filtro GLOBAL escolhido no head (cookie `pca_filtro`, como a unidade e o grupo ativos): a Mesa
 * (protocolos, DFDs, itens e o Dashboard), os cards do módulo PCA e o Orçamento mostram só o PCA escolhido. Sem escolha
 * (ou o PCA saiu do cadastro) = TODOS os PCAs. O protocolo/DFD guarda o ANO do PCA (`ano_pca`), então o filtro casa pelo
 * ano e só entram os PCAs cadastrados COM ano.
 */
const COOKIE_PCA = "pca_filtro";

export type PcaDoFiltro = { id: number; nome: string; ano: number };

/** Os PCAs do seletor do cabeçalho: os cadastrados com ano, na ordem de `listarPcas` (o ativo primeiro). `pcas` evita
 * reler o cadastro quando o chamador já o tem. */
export async function pcasDoFiltro(pcas?: PcaResumo[]): Promise<PcaDoFiltro[]> {
  return (pcas ?? (await listarPcas())).flatMap((p) => (p.ano != null ? [{ id: p.id, nome: p.nome, ano: p.ano }] : []));
}

/** O PCA escolhido no cabeçalho (`null` = todos os PCAs). */
export async function getPcaFiltro(lista?: PcaDoFiltro[]): Promise<PcaDoFiltro | null> {
  const id = Number((await cookies()).get(COOKIE_PCA)?.value);
  if (!Number.isInteger(id) || id <= 0) return null;
  return (lista ?? (await pcasDoFiltro())).find((p) => p.id === id) ?? null;
}

/** Grava (ou limpa — `null` = todos os PCAs) o PCA do cabeçalho. */
export async function definirPcaFiltro(id: number | null): Promise<void> {
  const jar = await cookies();
  if (id == null) {
    jar.delete(COOKIE_PCA);
    return;
  }
  jar.set(COOKIE_PCA, String(id), { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 30 * 86_400 });
}
