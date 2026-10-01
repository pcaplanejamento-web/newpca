import type { DfdDetalhe, DfdNaLista, ItemDfdRow } from "./dfd.ts";
import type { AtividadeTupla } from "./mesa-metricas.ts";
import type { VisaoMesa } from "./mesa-visao-core.ts";
import type { ProtocoloDetalhe, ProtocoloResumo } from "./protocolo.ts";

/**
 * REDAÇÃO da Mesa por requisição — o que o PAPEL não vê não sai do servidor. Módulo PURO (testado): roda DEPOIS dos
 * carregamentos memorizados (`memoPorVersao` — o valor é COMPARTILHADO entre as pessoas), então NUNCA muda o que recebe:
 * copia só o que tira (copy-on-write) e, sem nada a tirar, devolve a MESMA referência.
 *
 * Campo oculto = chave AUSENTE no JSON (nunca `null`, que é "sem responsável"): a tela lê `pode.vis`, nunca deduz a regra
 * da ausência do campo.
 */

/** As LINHAS da pessoa ("só os meus"): os ids dos protocolos e dos DFDs dela — `null` = todas. */
export type LinhasMeus = { protocolos: ReadonlySet<number>; dfds: ReadonlySet<number> } | null;

type PessoasProtocolo = "responsavelId" | "responsavelNome" | "distribuidorId" | "distribuidorNome";
/** O protocolo como a Mesa o recebe: Responsável e Distribuição podem não vir (o papel não os vê). */
export type ProtocoloNaMesa = Omit<ProtocoloResumo, PessoasProtocolo> & Partial<Pick<ProtocoloResumo, PessoasProtocolo>>;
/** Os campos do DFD que as LISTAS da Mesa nunca usam (o documento aberto no banner os traz) — a lista do banco
 * (`DfdNaLista`) já vem sem eles; a redação os tira também de um resumo completo, por garantia. */
type SoDoDocumento = "responsavel" | "objeto" | "setorRequisitante";
/** O DFD como as listas da Mesa o recebem (`DfdNaLista`): o Responsável do protocolo pode não vir. */
export type DfdNaMesa = Omit<DfdNaLista, "protocoloResponsavelId"> & Partial<Pick<DfdNaLista, "protocoloResponsavelId">>;

/** Tira as `chaves` de uma cópia (a mesma referência quando nenhuma está presente). */
function sem<T extends object, K extends string>(o: T, chaves: readonly K[]): T {
  if (!chaves.some((k) => k in o)) return o;
  const c = { ...o } as Record<string, unknown>;
  for (const k of chaves) delete c[k];
  return c as T;
}

/** As chaves de PESSOAS que o papel não vê no protocolo (e no Responsável que os DFDs herdam). */
export function chavesPessoasOcultas(vis: VisaoMesa): PessoasProtocolo[] {
  return [
    ...(vis.responsavel.ver ? [] : (["responsavelId", "responsavelNome"] as const)),
    ...(vis.distribuicao ? [] : (["distribuidorId", "distribuidorNome"] as const)),
  ];
}

/** O protocolo sem o que o papel não vê. */
export function redigirProtocolo<T extends ProtocoloResumo>(p: T, vis: VisaoMesa): T {
  return sem(p, chavesPessoasOcultas(vis));
}

/** As LISTAS de protocolos da Mesa: só as linhas da pessoa, sem o que o papel não vê. */
export function redigirProtocolos(lista: readonly ProtocoloResumo[], vis: VisaoMesa, meus: LinhasMeus): ProtocoloNaMesa[] {
  const chaves = chavesPessoasOcultas(vis);
  const linhas = meus ? lista.filter((p) => meus.protocolos.has(p.id)) : lista;
  return chaves.length ? linhas.map((p) => sem(p, chaves)) : (linhas as ProtocoloNaMesa[]);
}

const CHAVES_SO_DOCUMENTO: readonly SoDoDocumento[] = ["responsavel", "objeto", "setorRequisitante"];

/** As chaves que o DFD de uma LISTA não leva: as do documento (nunca usadas na lista) + o Responsável que o papel não vê. */
function chavesDfdLista(vis: VisaoMesa): string[] {
  return [...CHAVES_SO_DOCUMENTO, ...(vis.responsavel.ver ? [] : ["protocoloResponsavelId"])];
}

/** As LISTAS de DFDs da Mesa: só as linhas da pessoa, sem o que as listas não usam e o que o papel não vê. */
export function redigirDfds(lista: readonly DfdNaLista[], vis: VisaoMesa, meus: LinhasMeus): DfdNaMesa[] {
  const chaves = chavesDfdLista(vis);
  const linhas = meus ? lista.filter((d) => meus.dfds.has(d.id)) : lista;
  return linhas.map((d) => sem(d, chaves));
}

/** Os ITENS da Mesa: só os dos DFDs das linhas da pessoa. */
export function redigirItens<T extends Pick<ItemDfdRow, "dfdId">>(itens: T[], meus: LinhasMeus): T[] {
  return meus ? itens.filter((it) => meus.dfds.has(it.dfdId)) : itens;
}

/** O DFD COMPLETO de um banner (o documento): só o Responsável do protocolo, se o papel não o vê. */
export function redigirDfdDetalhe<T extends Pick<DfdDetalhe, "protocoloResponsavelId">>(d: T, vis: VisaoMesa): T {
  return vis.responsavel.ver ? d : sem(d, ["protocoloResponsavelId"]);
}

/** O protocolo de um banner (com os resumos dos DFDs dele). */
export function redigirProtocoloDetalhe(p: ProtocoloDetalhe, vis: VisaoMesa): ProtocoloDetalhe {
  const chaves = chavesPessoasOcultas(vis);
  if (!chaves.length) return p;
  return { ...sem(p, chaves), dfds: p.dfds.map((d) => redigirDfdDetalhe(d, vis)) };
}

/**
 * O HISTÓRICO DE EXECUÇÃO do Dashboard (as tuplas [protocolo, pessoa, dia, tipo, n]): só os protocolos legíveis e — sem
 * o DESEMPENHO POR PESSOA — só as correções (reenvios), SEM a pessoa, somadas por protocolo e dia (as ações são por quem
 * as fez: sem pessoa não há o que mostrar).
 */
export function redigirExecucao(tuplas: readonly AtividadeTupla[], vis: VisaoMesa, legivel: (protocoloId: number) => boolean): AtividadeTupla[] {
  const visiveis = tuplas.filter((t) => legivel(t[0]));
  if (vis.desempenho) return visiveis;
  const soma = new Map<string, AtividadeTupla>();
  for (const [protocoloId, , dia, tipo, n] of visiveis) {
    if (tipo !== "reenvio") continue;
    const k = `${protocoloId}|${dia}`;
    const atual = soma.get(k);
    soma.set(k, [protocoloId, null, dia, "reenvio", (atual?.[4] ?? 0) + n]);
  }
  return [...soma.values()];
}
