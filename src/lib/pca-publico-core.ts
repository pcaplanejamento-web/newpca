import type { LinhaHistorico } from "./auditoria-core.ts";
import type { DfdDetalhe, DfdItemRow } from "./dfd.ts";
import type { Solicitante } from "./reparticao-responsaveis.ts";

/**
 * CONSULTA PÚBLICA do PCA — núcleo PURO (sem getDb; testado). Tudo que sai daqui vai a QUALQUER visitante da tela
 * inicial, então é HIGIENIZADO no servidor: nada de CPF/e-CPF, matrícula, e-mail, telefone, assinaturas nem autor do
 * histórico. Do solicitante (o responsável que pediu a consolidação) ficam só nome, função e o ato de nomeação.
 */

/**
 * MÁSCARA de dados pessoais em TEXTO LIVRE (seções do DFD, capa, diff do histórico): CPF/CNPJ, e-mail, telefone e o
 * número após "matrícula" viram "•••". O resto do texto fica intacto.
 */
const MASCARAS: [RegExp, string | ((m: string, ...g: string[]) => string)][] = [
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "•••"],
  [/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, "•••"], // CNPJ
  [/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{3}\.?\*{3}\.?\*{3}-?\d{2}\b|\*{3}\.\d{3}\.\d{3}-\*{2}/g, "•••"], // CPF (e mascarado)
  [/(\bcpf\b\W{0,4})\d{11}\b/gi, (_m, r) => `${r}•••`],
  [/\(?\b\d{2}\)?\s?9?\d{4}-\d{4}\b/g, "•••"], // telefone
  [/(matr[ií]cula\W{0,6}(?:n[ºo°.]?\s*)?)[\d.\-/]+/gi, (_m, r) => `${r}•••`],
];

export function mascararTexto<T extends string | null | undefined>(t: T): T {
  if (!t) return t;
  let s: string = t;
  for (const [re, sub] of MASCARAS) s = s.replace(re, sub as string);
  return s as T;
}

/** Responsável pela solicitação, sem matrícula nem dados da assinatura. */
export type SolicitantePublico = Solicitante;

export function solicitantePublico(s: Solicitante | null): SolicitantePublico | null {
  if (!s) return null;
  return { ...s, matricula: "", assinaturaCodigo: "", assinaturaData: "" };
}

/** O DFD como a consulta o mostra (forma do `DfdVisual` do `DfdView`) — sem dados pessoais nem assinaturas. */
export type DfdConsulta = {
  id: number;
  protocoloId: number | null;
  numero: string;
  planejamento: string | null;
  tipo: string | null;
  objeto: string | null;
  orgaoEntidade: string | null;
  setorRequisitante: string | null;
  responsavel: string | null;
  matricula: null;
  email: null;
  telefone: null;
  anoPca: number | null;
  numeroContrato: string | null;
  numeroAta: string | null;
  numeroLicitacao: string | null;
  valorTotal: number;
  reparticaoCodigo: string | null;
  reparticaoNome: string | null;
  totalItens: number;
  itens: DfdItemRow[];
  secoes: { numero: number; titulo: string; texto: string }[];
  assinaturas: { lista: never[]; solicitante: SolicitantePublico | null; validada: null };
};

/**
 * DFD PÚBLICO: só os itens que CONTAM no PCA (`ativo(itemId)` — o retirado do PCA sai) e os totais deles; sem
 * matrícula/e-mail/telefone e sem assinaturas (fica o solicitante higienizado).
 */
export function dfdPublico(d: DfdDetalhe, solicitante: Solicitante | null, ativo: (itemId: number) => boolean): DfdConsulta {
  const itens = d.itens.filter((it) => ativo(it.id));
  return {
    id: d.id,
    protocoloId: d.protocoloId,
    numero: d.numero,
    planejamento: d.planejamento,
    tipo: d.tipo,
    objeto: d.objeto,
    orgaoEntidade: d.orgaoEntidade,
    setorRequisitante: d.setorRequisitante,
    responsavel: d.responsavel,
    matricula: null,
    email: null,
    telefone: null,
    anoPca: d.anoPca,
    numeroContrato: d.numeroContrato,
    numeroAta: d.numeroAta,
    numeroLicitacao: d.numeroLicitacao,
    valorTotal: itens.reduce((s, it) => s + (it.valorTotal ?? 0), 0),
    reparticaoCodigo: d.reparticaoCodigo,
    reparticaoNome: d.reparticaoNome,
    totalItens: itens.length,
    itens,
    secoes: d.secoes.map((x) => ({ ...x, texto: mascararTexto(x.texto) })),
    assinaturas: { lista: [], solicitante: solicitantePublico(solicitante), validada: null },
  };
}

/** Rótulos/chaves de dado PESSOAL (nunca vão ao público no histórico). */
const SENSIVEL = /cpf|cnpj|e-?mail|telefone|matr[ií]cula|documento|assinatura|usu[aá]rio/i;

/** Tira do JSON legado (`antes`/`depois`) as chaves pessoais. */
function jsonSemSensivel(bruto: string | null): string | null {
  if (!bruto) return bruto;
  const json = mascararTexto(bruto);
  try {
    const o: unknown = JSON.parse(json);
    if (!o || typeof o !== "object" || Array.isArray(o)) return json;
    return JSON.stringify(Object.fromEntries(Object.entries(o as Record<string, unknown>).filter(([k]) => !SENSIVEL.test(k))));
  } catch {
    return null;
  }
}

/** Tira do `detalhe` (formato novo) as assinaturas e os campos pessoais. */
function detalheSemSensivel(bruto: string | null): string | null {
  if (!bruto) return bruto;
  try {
    const d = JSON.parse(mascararTexto(bruto)) as { campos?: { campo: string; rotulo: string }[]; assinaturas?: unknown; [k: string]: unknown };
    const { assinaturas: _a, ...resto } = d;
    return JSON.stringify({ ...resto, campos: (d.campos ?? []).filter((c) => !SENSIVEL.test(c.rotulo) && !SENSIVEL.test(c.campo)) });
  } catch {
    return null;
  }
}

/**
 * HISTÓRICO PÚBLICO: só o que passou por um protocolo INCORPORADO ao PCA (`incorporados`), SEM o autor e sem os dados
 * pessoais/assinaturas do diff.
 */
export function historicoPublico(linhas: LinhaHistorico[], incorporados: Set<number>): LinhaHistorico[] {
  return linhas
    .filter((l) => l.protocoloId != null && incorporados.has(l.protocoloId))
    .map((l) => ({
      ...l,
      usuarioId: null,
      usuarioNome: null,
      resumo: mascararTexto(l.resumo),
      antes: jsonSemSensivel(l.antes),
      depois: jsonSemSensivel(l.depois),
      detalhe: detalheSemSensivel(l.detalhe),
    }));
}
