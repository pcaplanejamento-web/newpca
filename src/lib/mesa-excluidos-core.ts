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

// ---------------------------------------------------------------- EXCLUSÕES ANTIGAS (antes da lixeira)
/** Uma linha da auditoria de exclusão (as anteriores à lixeira não têm retrato — só o que o histórico guardou). */
export type LinhaAuditoriaExclusao = {
  id: number;
  entidade: string;
  entidadeId: number | null;
  resumo: string | null;
  antes: string | null;
  detalhe: string | null;
  origem: string | null;
  protocoloId: number | null;
  usuarioId: number | null;
  usuarioNome: string | null;
  criadoEm: string | null;
};
/** O que o histórico permite saber de cada exclusão antiga. */
export type ExcluidoAntigo = {
  chave: string;
  tipo: "protocolo" | "dfd" | "item";
  alvoId: number | null;
  numero: string | null;
  planejamento: string | null;
  protocoloId: number | null;
  dfdId: number | null;
  valor: number | null;
  motivo: string;
  resumo: string | null;
  excluidoPor: number | null;
  excluidoNome: string | null;
  excluidoEm: string | null;
  item: { item: number | null; codigo: string | null; descricao: string | null; campos: { rotulo: string; antes: string }[] } | null;
};

const json = (t: string | null): Record<string, unknown> | null => {
  if (!t) return null;
  try {
    const o = JSON.parse(t);
    return o && typeof o === "object" ? (o as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

/** Converte UMA linha da auditoria nas exclusões antigas que ela registra (o item removido em massa ou no "Salvar"
 * vira uma por item; o DFD/protocolo excluído, uma). O que não é exclusão devolve []. */
export function excluidosDaAuditoria(l: LinhaAuditoriaExclusao): ExcluidoAntigo[] {
  const base = {
    protocoloId: l.protocoloId,
    excluidoPor: l.usuarioId,
    excluidoNome: l.usuarioNome,
    excluidoEm: l.criadoEm,
    resumo: l.resumo,
  };
  const det = json(l.detalhe);
  const alvo = (det?.alvo ?? null) as { numero?: string; planejamento?: string | null } | null;
  if (l.entidade === "protocolo") {
    const m = /Protocolo\s+(\S+)\s+exclu/i.exec(l.resumo ?? "");
    return [{ ...base, chave: `a${l.id}`, tipo: "protocolo", alvoId: l.entidadeId, numero: m?.[1] ?? null, planejamento: null, dfdId: null, valor: null, motivo: "exclusao", item: null }];
  }
  if (l.entidade !== "dfd") return [];
  const itens = Array.isArray(det?.itens) ? (det.itens as Record<string, unknown>[]) : [];
  const removidos = itens.filter((i) => i?.tipo === "removido");
  const ehExclusaoDfd = l.origem === "exclusao" || l.origem === "reenvio" || (l.origem == null && /^DFD .* exclu[ií]do/i.test(l.resumo ?? ""));
  if (ehExclusaoDfd && !/desfeita/i.test(l.resumo ?? "")) {
    const a = json(l.antes);
    const valor = typeof a?.valorTotal === "number" ? a.valorTotal : null;
    return [
      {
        ...base,
        chave: `a${l.id}`,
        tipo: "dfd",
        alvoId: l.entidadeId,
        numero: alvo?.numero ?? (typeof a?.numero === "string" ? a.numero : null),
        planejamento: alvo?.planejamento ?? null,
        dfdId: l.entidadeId,
        valor,
        motivo: l.origem === "reenvio" ? "reenvio" : "exclusao",
        item: null,
      },
    ];
  }
  return removidos.map((i, k) => {
    const campos = (Array.isArray(i.campos) ? (i.campos as { rotulo?: string; antes?: string }[]) : [])
      .filter((c) => c && typeof c.rotulo === "string")
      .map((c) => ({ rotulo: String(c.rotulo), antes: String(c.antes ?? "") }));
    return {
      ...base,
      chave: `a${l.id}-${k}`,
      tipo: "item" as const,
      alvoId: null,
      numero: i.item == null ? null : String(i.item),
      planejamento: alvo?.planejamento ?? null,
      dfdId: l.entidadeId,
      valor: null,
      motivo: l.origem === "massa" ? "massa" : "edicao",
      item: { item: typeof i.item === "number" ? i.item : null, codigo: (i.codigo as string) ?? null, descricao: (i.descricao as string) ?? null, campos },
    };
  });
}

/** O PCA em que o protocolo estava, pelo último registro de envio/incorporação/devolução (`null` = Mesa do sistema). */
export function pcaPeloHistorico(resumo: string | null, pcaId: number | null): number | null {
  if (!resumo || pcaId == null) return null;
  return /devolvido/i.test(resumo) ? null : pcaId;
}
