/**
 * UNIDADES DA CENTI × CADASTRO (puro, testado — `tests/centi-unidades.test.ts`). Cada par "Órgão gestor" + "Unidade
 * orçamentária" que as APIs da Centi devolvem é registrado (`centi_unidades`); o VÍNCULO é escolhido no cadastro de Órgãos
 * e Unidades: a UNIDADE escolhe a sua unidade orçamentária e o ÓRGÃO, o seu órgão gestor — cada um no máximo uma vez.
 * Só os registros vinculados são gravados (a unidade escolhida; senão o órgão do órgão gestor).
 */

/** Uma unidade da Centi como o cadastro a vê (o vínculo calculado e quantos empenhos gravados ela tem). */
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

/** Uma opção do dropdown do cadastro (o valor guardado e o texto). */
export type OpcaoCenti = { valor: string; rotulo: string };

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

/** As AÇÕES distintas de uma página lida (`[órgão gestor, unidade, ação, registros]`; o vazio vira ""). */
export function acoesDasLinhas(linhas: readonly { orgaoGestor: string; unidadeOrcamentaria: string | null; acao: string | null }[]): [string, string, string, number][] {
  const m = new Map<string, [string, string, string, number]>();
  for (const l of linhas) {
    const t: [string, string, string] = [l.orgaoGestor ?? "", l.unidadeOrcamentaria ?? "", l.acao ?? ""];
    const k = t.join("\u0000");
    const atual = m.get(k);
    if (atual) atual[3]++;
    else m.set(k, [...t, 1]);
  }
  return [...m.values()];
}

/**
 * O que está VINCULADO ao cadastro, para decidir NA LEITURA o que entra no banco: os órgãos gestores escolhidos por um
 * órgão, as unidades orçamentárias com vínculo (`gestor\0unidade`) e as ações escolhidas por uma unidade
 * (`gestor\0unidade\0ação`).
 */
export type MapaVinculo = { gestores: ReadonlySet<string>; unidades: ReadonlySet<string>; acoes: ReadonlySet<string> };

/** O registro tem vínculo (a ação › a unidade orçamentária › o órgão gestor)? Sem vínculo, NADA dele é gravado. */
export function linhaVinculada(m: MapaVinculo, l: { orgaoGestor: string; unidadeOrcamentaria: string | null; acao: string | null }): boolean {
  const og = l.orgaoGestor ?? "";
  const un = l.unidadeOrcamentaria ?? "";
  return m.gestores.has(og) || m.unidades.has(`${og}\u0000${un}`) || m.acoes.has(`${og}\u0000${un}\u0000${l.acao ?? ""}`);
}

/** Uma AÇÃO da Centi como o cadastro a vê (a unidade orçamentária dela e a unidade do cadastro escolhida). */
export type AcaoCenti = { id: number; centiUnidadeId: number; orgaoGestor: string; unidade: string; acao: string; reparticaoId: number | null; registros: number; ultimoAno: number | null };

/** O texto de uma ação como a Centi o traz (sem ação, "(sem ação)"). */
export function rotuloAcaoCenti(a: Pick<AcaoCenti, "acao">): string {
  return a.acao || "(sem ação)";
}

/**
 * As AÇÕES que a unidade do cadastro pode escolher: as que nenhuma OUTRA unidade escolheu; com o órgão dela ligado a um
 * órgão gestor, só as desse órgão gestor. As escolhidas agora sempre entram. Agrupadas pela unidade orçamentária.
 */
export function opcoesAcoes(lista: readonly AcaoCenti[], reparticaoId: number | null, gestorDoOrgao: string | null): { valor: string; rotulo: string; grupo: string; contagem: number }[] {
  return lista
    .filter((a) => a.reparticaoId === reparticaoId || (a.reparticaoId == null && (!gestorDoOrgao || a.orgaoGestor === gestorDoOrgao)))
    .map((a) => ({ valor: String(a.id), rotulo: rotuloAcaoCenti(a), grupo: rotuloUnidadeCenti(a), contagem: a.registros }))
    .sort((x, y) => x.grupo.localeCompare(y.grupo, "pt-BR", { numeric: true }) || x.rotulo.localeCompare(y.rotulo, "pt-BR", { numeric: true }));
}

/** O texto da unidade da Centi ("FMC · 02.01 - FUNDO …"; sem unidade, só o órgão gestor). */
export function rotuloUnidadeCenti(u: Pick<UnidadeCenti, "orgaoGestor" | "unidade">): string {
  return u.unidade ? `${u.orgaoGestor || "—"} · ${u.unidade}` : u.orgaoGestor || "—";
}

const porTexto = (a: OpcaoCenti, b: OpcaoCenti) => a.rotulo.localeCompare(b.rotulo, "pt-BR", { numeric: true });

/**
 * As UNIDADES ORÇAMENTÁRIAS que a unidade do cadastro pode escolher: as que nenhuma OUTRA unidade escolheu; com o órgão
 * dela ligado a um órgão gestor, só as desse órgão gestor. A escolhida agora sempre entra. "" = sem vínculo.
 */
export function opcoesUnidadeOrcamentaria(lista: readonly UnidadeCenti[], atual: number | null, gestorDoOrgao: string | null, reparticaoId: number | null): OpcaoCenti[] {
  const r = lista
    .filter((u) => u.id === atual || ((u.reparticaoId == null || u.reparticaoId === reparticaoId) && (!gestorDoOrgao || u.orgaoGestor === gestorDoOrgao)))
    .map((u) => ({ valor: String(u.id), rotulo: rotuloUnidadeCenti(u) }))
    .sort(porTexto);
  return [{ valor: "", rotulo: "Sem vínculo" }, ...r];
}

/** Os ÓRGÃOS GESTORES que o órgão do cadastro pode escolher: os que nenhum OUTRO órgão escolheu (o atual sempre entra). */
export function opcoesOrgaoGestor(lista: readonly UnidadeCenti[], tomados: readonly (string | null)[], atual: string | null): OpcaoCenti[] {
  const ocupados = new Set(tomados.filter((g): g is string => !!g && g !== atual));
  const gestores = [...new Set(lista.map((u) => u.orgaoGestor))].filter((g) => g && (g === atual || !ocupados.has(g)));
  if (atual && !gestores.includes(atual)) gestores.push(atual);
  return [{ valor: "", rotulo: "Sem vínculo" }, ...gestores.map((g) => ({ valor: g, rotulo: g })).sort(porTexto)];
}
