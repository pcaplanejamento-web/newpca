export type MotivoExclusao = "exclusao" | "reenvio" | "cascata" | "massa" | "edicao" | "desfeita";
export const ROTULO_MOTIVO_EXCLUSAO: Record<MotivoExclusao, string> = {
  exclusao: "Exclusão",
  reenvio: "Fora do reenvio",
  cascata: "Com o protocolo",
  massa: "Remoção em massa",
  edicao: "Removido na edição",
  desfeita: "Gravação desfeita",
};

/**
 * LIXEIRA DA MESA — a leitura PURA dos retratos gravados por `mesa-excluidos-sql.ts` (tolerante: JSON inválido = null).
 */
export type ItemExcluido = {
  id: number | null;
  item: number | null;
  codigo: string | null;
  descricao: string | null;
  unidade: string | null;
  quantidade: number | null;
  valorUnitario: number | null;
  valorTotal: number | null;
  sequencial: number | null;
  pcaSequencial: number | null;
};

export type RetratoDfd = {
  numero: string;
  planejamento: string | null;
  tipo: string | null;
  objeto: string | null;
  orgaoEntidade: string | null;
  setorRequisitante: string | null;
  responsavel: string | null;
  matricula: string | null;
  email: string | null;
  telefone: string | null;
  reparticaoId: number | null;
  anoPca: number | null;
  valorTotal: number | null;
  totalItens: number | null;
  secoes: string | null;
  assinaturas: string | null;
  numeroContrato: string | null;
  numeroAta: string | null;
  numeroLicitacao: string | null;
  itens: ItemExcluido[];
};

export type RetratoProtocolo = {
  numero: string;
  idExterno: string | null;
  data: string | null;
  interessado: string | null;
  assunto: string | null;
  observacao: string | null;
  valorCapa: number | null;
  anoPca: number | null;
  dfds: number;
};

function obj(txt: string | null | undefined): Record<string, unknown> | null {
  if (!txt) return null;
  try {
    const v = JSON.parse(txt);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
const s = (v: unknown) => (typeof v === "string" ? v : v == null ? null : String(v));
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function item(v: unknown): ItemExcluido {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return {
    id: n(o.id),
    item: n(o.item),
    codigo: s(o.codigo),
    descricao: s(o.descricao),
    unidade: s(o.unidade),
    quantidade: n(o.quantidade),
    valorUnitario: n(o.valorUnitario),
    valorTotal: n(o.valorTotal),
    sequencial: n(o.sequencial),
    pcaSequencial: n(o.pcaSequencial),
  };
}

/** O DFD do retrato, com os itens na ordem da tabela do DFD. */
export function lerRetratoDfd(txt: string | null | undefined): RetratoDfd | null {
  const o = obj(txt);
  if (!o || typeof o.numero !== "string") return null;
  const itens = Array.isArray(o.itens) ? o.itens.map(item) : [];
  itens.sort((a, b) => (a.sequencial ?? a.item ?? 0) - (b.sequencial ?? b.item ?? 0));
  return {
    numero: o.numero,
    planejamento: s(o.planejamento),
    tipo: s(o.tipo),
    objeto: s(o.objeto),
    orgaoEntidade: s(o.orgaoEntidade),
    setorRequisitante: s(o.setorRequisitante),
    responsavel: s(o.responsavel),
    matricula: s(o.matricula),
    email: s(o.email),
    telefone: s(o.telefone),
    reparticaoId: n(o.reparticaoId),
    anoPca: n(o.anoPca),
    valorTotal: n(o.valorTotal),
    totalItens: n(o.totalItens),
    secoes: s(o.secoes),
    assinaturas: s(o.assinaturas),
    numeroContrato: s(o.numeroContrato),
    numeroAta: s(o.numeroAta),
    numeroLicitacao: s(o.numeroLicitacao),
    itens,
  };
}

export function lerRetratoProtocolo(txt: string | null | undefined): RetratoProtocolo | null {
  const o = obj(txt);
  if (!o || typeof o.numero !== "string") return null;
  return {
    numero: o.numero,
    idExterno: s(o.idExterno),
    data: s(o.data),
    interessado: s(o.interessado),
    assunto: s(o.assunto),
    observacao: s(o.observacao),
    valorCapa: n(o.valorCapa),
    anoPca: n(o.anoPca),
    dfds: n(o.dfds) ?? 0,
  };
}

/** O item de um retrato de item removido + o DFD de onde saiu. */
export function lerRetratoItem(txt: string | null | undefined): { item: ItemExcluido; dfdNumero: string | null; dfdTipo: string | null } | null {
  const o = obj(txt);
  if (!o) return null;
  return { item: item(o.item), dfdNumero: s(o.dfdNumero), dfdTipo: s(o.dfdTipo) };
}
