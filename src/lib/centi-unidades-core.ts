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
  /** As unidades do cadastro que a escolheram — `reparticaoId` é a que a tem INTEIRA; as outras a dividem por ações. */
  escolhidaPor: number[];
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
 * As AÇÕES que a unidade do cadastro pode escolher: SÓ as da unidade orçamentária escolhida por ela (primeiro a unidade,
 * depois as ações) e que nenhuma OUTRA unidade escolheu. Sem unidade orçamentária, nenhuma.
 */
export function opcoesAcoes(lista: readonly AcaoCenti[], reparticaoId: number | null, unidadeId: number | null): { valor: string; rotulo: string; contagem: number }[] {
  if (unidadeId == null) return [];
  return lista
    .filter((a) => a.centiUnidadeId === unidadeId && (a.reparticaoId == null || a.reparticaoId === reparticaoId))
    .map((a) => ({ valor: String(a.id), rotulo: rotuloAcaoCenti(a), contagem: a.registros }))
    .sort((x, y) => x.rotulo.localeCompare(y.rotulo, "pt-BR", { numeric: true }));
}

/** A escolha da unidade do cadastro: a unidade orçamentária e, dela, as ações (vazia = a unidade orçamentária inteira). */
export type EscolhaCenti = { reparticaoId: number; unidadeId: number | null; acoes: readonly number[] };

/**
 * A REGRA do vínculo (a mesma na tela e no servidor — 409/422): as ações só depois da unidade orçamentária e só DELA; uma
 * ação em UMA unidade; a unidade orçamentária INTEIRA (sem ações) em uma unidade só e, nesse caso, ninguém mais a divide;
 * dividida por ações, cada unidade fica com as suas. `outra` = a unidade do cadastro do conflito (o servidor diz o nome);
 * `esperaAcoes` = a escolha está certa, só faltam as ações desta unidade (a tela espera, não grava).
 */
export function motivoVinculoCenti(
  e: EscolhaCenti,
  unidades: readonly Pick<UnidadeCenti, "id" | "escolhidaPor">[],
  acoes: readonly Pick<AcaoCenti, "id" | "centiUnidadeId" | "reparticaoId">[],
): { msg: string; status: 409 | 422; outra?: number; esperaAcoes?: true } | null {
  if (e.unidadeId == null) return e.acoes.length ? { msg: "Escolha primeiro a unidade orçamentária — as ações são dela.", status: 422 } : null;
  const uo = unidades.find((u) => u.id === e.unidadeId);
  if (!uo) return { msg: "Unidade orçamentária não encontrada na Centi — use “Buscar na Centi” na lista.", status: 422 };
  const porId = new Map(acoes.map((a) => [a.id, a]));
  for (const id of e.acoes) {
    const a = porId.get(id);
    if (!a) return { msg: "Ação não encontrada na Centi — use “Buscar na Centi” na lista.", status: 422 };
    if (a.centiUnidadeId !== e.unidadeId) return { msg: "A ação escolhida não é da unidade orçamentária desta unidade.", status: 422 };
    if (a.reparticaoId != null && a.reparticaoId !== e.reparticaoId) return { msg: "Esta ação já está vinculada a outra unidade.", status: 409, outra: a.reparticaoId };
  }
  const outras = uo.escolhidaPor.filter((r) => r !== e.reparticaoId);
  if (!outras.length) return null;
  // As outras que DIVIDEM por ações (têm ação desta unidade orçamentária); as demais a têm INTEIRA.
  const dividem = new Set(acoes.filter((a) => a.centiUnidadeId === e.unidadeId && a.reparticaoId != null).map((a) => a.reparticaoId as number));
  const inteira = outras.find((r) => !dividem.has(r));
  if (inteira != null) return { msg: "Esta unidade orçamentária já está vinculada INTEIRA a outra unidade — para dividi-la, escolha as ações em cada uma.", status: 409, outra: inteira };
  if (!e.acoes.length) return { msg: "Esta unidade orçamentária está dividida por ações com outra unidade — escolha as ações desta unidade.", status: 409, outra: outras[0], esperaAcoes: true };
  return null;
}

/** O texto da unidade da Centi ("FMC · 02.01 - FUNDO …"; sem unidade, só o órgão gestor). */
export function rotuloUnidadeCenti(u: Pick<UnidadeCenti, "orgaoGestor" | "unidade">): string {
  return u.unidade ? `${u.orgaoGestor || "—"} · ${u.unidade}` : u.orgaoGestor || "—";
}

const porTexto = (a: OpcaoCenti, b: OpcaoCenti) => a.rotulo.localeCompare(b.rotulo, "pt-BR", { numeric: true });

/**
 * As UNIDADES ORÇAMENTÁRIAS que a unidade do cadastro pode escolher: as que nenhuma OUTRA unidade tem INTEIRA (a dividida
 * por ações entra, com o aviso — esta unidade fica com as ações dela); com o órgão dela ligado a um órgão gestor, só as
 * desse órgão gestor. A escolhida agora sempre entra. "" = sem vínculo.
 */
export function opcoesUnidadeOrcamentaria(lista: readonly UnidadeCenti[], atual: number | null, gestorDoOrgao: string | null, reparticaoId: number | null): OpcaoCenti[] {
  const r = lista
    .filter((u) => u.id === atual || ((u.reparticaoId == null || u.reparticaoId === reparticaoId) && (!gestorDoOrgao || u.orgaoGestor === gestorDoOrgao)))
    .map((u) => ({ valor: String(u.id), rotulo: `${rotuloUnidadeCenti(u)}${u.id !== atual && u.escolhidaPor.some((r) => r !== reparticaoId) ? " — dividida por ações" : ""}` }))
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
