/**
 * UNIDADES DA CENTI × CADASTRO (puro, testado — `tests/centi-unidades.test.ts`). Cada par "Órgão gestor" + "Unidade
 * orçamentária" que as APIs da Centi devolvem é registrado e o ADM o VINCULA a um ÓRGÃO cadastrado (e, se quiser, a UMA
 * UNIDADE dele). Só os registros de unidade vinculada são gravados — o banco fica só com o que o sistema usa.
 */

/** Uma unidade da Centi como a tela a vê (com quantos registros gravados ela tem). */
export type UnidadeCenti = {
  id: number;
  orgaoGestor: string;
  unidade: string;
  orgaoId: number | null;
  reparticaoId: number | null;
  /** Os registros vistos na última leitura que a trouxe. */
  registros: number;
  ultimoAno: number | null;
  vistoEm: string;
  vinculadoEm: string | null;
  vinculadoPor: string | null;
  /** Os empenhos GRAVADOS dela (só existem com o vínculo). */
  gravados: number;
};

/** O vínculo pedido: um órgão do cadastro e, opcional, uma unidade DELE; `null` = sem vínculo. */
export type Vinculo = { orgaoId: number; reparticaoId: number | null } | null;

/** O cadastro com que o vínculo é conferido (os órgãos e as unidades visíveis em Órgãos e Unidades). */
export type CadastroVinculo = {
  orgaos: readonly { id: number; sigla: string }[];
  unidades: readonly { id: number; orgaoId: number | null }[];
};

/** Os PARES distintos de uma página lida, com quantos registros cada um trouxe (o vazio vira ""). */
export function paresDasLinhas(linhas: readonly { orgaoGestor: string; unidadeOrcamentaria: string | null }[]): [string, string, number][] {
  const m = new Map<string, [string, string, number]>();
  for (const l of linhas) {
    const og = l.orgaoGestor ?? "";
    const un = l.unidadeOrcamentaria ?? "";
    const k = `${og}\u0000${un}`;
    const atual = m.get(k);
    if (atual) atual[2]++;
    else m.set(k, [og, un, 1]);
  }
  return [...m.values()];
}

/** O valor do seletor: "" (sem vínculo), "o:<órgão>" (o órgão inteiro) ou "u:<unidade>". */
export function valorVinculo(v: { orgaoId: number | null; reparticaoId: number | null }): string {
  if (v.reparticaoId != null) return `u:${v.reparticaoId}`;
  if (v.orgaoId != null) return `o:${v.orgaoId}`;
  return "";
}

/** O seletor → o vínculo (a unidade traz o órgão dela); `undefined` = valor inválido ou fora do cadastro. */
export function lerValorVinculo(valor: string, cadastro: CadastroVinculo): Vinculo | undefined {
  if (valor === "") return null;
  const m = /^([ou]):(\d+)$/.exec(valor);
  if (!m) return undefined;
  const id = Number(m[2]);
  if (m[1] === "o") return cadastro.orgaos.some((o) => o.id === id) ? { orgaoId: id, reparticaoId: null } : undefined;
  const u = cadastro.unidades.find((x) => x.id === id);
  return u?.orgaoId != null && cadastro.orgaos.some((o) => o.id === u.orgaoId) ? { orgaoId: u.orgaoId, reparticaoId: id } : undefined;
}

/** O pedido vale? A unidade tem de ser DO órgão informado e os dois têm de estar no cadastro visível. */
export function motivoVinculoInvalido(v: Vinculo, cadastro: CadastroVinculo): string | null {
  if (v === null) return null;
  if (!cadastro.orgaos.some((o) => o.id === v.orgaoId)) return "Órgão fora do cadastro (ou oculto).";
  if (v.reparticaoId == null) return null;
  const u = cadastro.unidades.find((x) => x.id === v.reparticaoId);
  if (!u) return "Unidade fora do cadastro (ou oculta).";
  if (u.orgaoId !== v.orgaoId) return "A unidade não pertence ao órgão informado.";
  return null;
}

/** A sigla sem caixa, acento, espaço e pontuação ("F.M.S" = "fms"). */
export function chaveSigla(s: string | null | undefined): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/** As SUGESTÕES: a unidade sem vínculo cujo "Órgão gestor" é a sigla de UM órgão do cadastro (dois ou mais = nenhuma). */
export function sugestoesPorSigla(lista: readonly UnidadeCenti[], cadastro: CadastroVinculo): { id: number; orgaoId: number }[] {
  const porSigla = new Map<string, number[]>();
  for (const o of cadastro.orgaos) {
    const k = chaveSigla(o.sigla);
    if (k) porSigla.set(k, [...(porSigla.get(k) ?? []), o.id]);
  }
  const r: { id: number; orgaoId: number }[] = [];
  for (const u of lista) {
    if (u.orgaoId != null) continue;
    const ids = porSigla.get(chaveSigla(u.orgaoGestor));
    if (ids?.length === 1) r.push({ id: u.id, orgaoId: ids[0] });
  }
  return r;
}

/** O pedido muda algo na unidade? (o mesmo vínculo = nada a fazer) */
export function mudaVinculo(u: Pick<UnidadeCenti, "orgaoId" | "reparticaoId">, v: Vinculo): boolean {
  return (v?.orgaoId ?? null) !== u.orgaoId || (v?.reparticaoId ?? null) !== u.reparticaoId;
}

/** O texto da unidade da Centi ("FMC · 02.01 - FUNDO …"; sem unidade, só o órgão gestor). */
export function rotuloUnidadeCenti(u: Pick<UnidadeCenti, "orgaoGestor" | "unidade">): string {
  return u.unidade ? `${u.orgaoGestor || "—"} · ${u.unidade}` : u.orgaoGestor || "—";
}
