import { sha256 } from "./conferencia-cache-core.ts";
import type { BlocoDoc } from "./documento-pdf-core.ts";
import { brl, dataHoraBR, dataIsoBrasilia, num } from "./format.ts";
import { limparTexto } from "./normalize.ts";

/**
 * DECLARAÇÕES DO PCA — núcleo PURO (testado). Uma declaração atesta que itens constam de um PCA, TOTAL ou PARCIALMENTE (12
 * no PCA, 6 declarados): para instruir o início da contratação, um empenho complementar, um aditivo… Cada item é
 * identificado pelo SEQUENCIAL do PCA (estável — segue o item nas regravações) e tem SALDO = a quantidade no PCA menos o já
 * declarado nas declarações não canceladas (o banco barra além dele — gatilho `declaracao_itens_saldo`). O CONTEÚDO é um
 * retrato congelado (o PCA pode mudar depois), selado por SHA-256 e conferível pelo CÓDIGO na página pública.
 */

export const FINALIDADES = [
  { id: "inicio", rotulo: "Início do processo de contratação", frase: "instrução do processo de contratação" },
  { id: "empenho_complementar", rotulo: "Empenho complementar", frase: "emissão de empenho complementar" },
  { id: "aditivo", rotulo: "Aditivo contratual", frase: "formalização de aditivo contratual" },
  { id: "adesao", rotulo: "Adesão a ata de registro de preços", frase: "adesão a ata de registro de preços" },
  { id: "outra", rotulo: "Outra finalidade", frase: "" },
] as const;
export type Finalidade = (typeof FINALIDADES)[number]["id"];
export const ROTULO_FINALIDADE = Object.fromEntries(FINALIDADES.map((f) => [f.id, f.rotulo])) as Record<Finalidade, string>;

export const MAX_ITENS_DECLARACAO = 500;
export const LIMITES_DECLARACAO = { processo: 80, finalidadeTexto: 200, observacao: 1000, motivo: 300 } as const;
/** Folga dos números com casas (ponto flutuante): a MESMA do gatilho do banco. */
const FOLGA = 0.000001;
export const CIDADE_DECLARACAO = "Rio Verde (GO)";

/** Um item do PCA que pode ser declarado (o retrato do item hoje + o já declarado). */
export type ItemDeclaravel = {
  sequencial: number;
  codigo: string | null;
  descricao: string | null;
  unidade: string | null;
  quantidade: number | null;
  valorUnitario: number | null;
  sigla: string | null;
  dfdId: number | null;
  dfdNumero: string | null;
  planejamento: string | null;
  tipoDfd: string | null;
  protocoloNumero: string | null;
  itemNumero: number | null;
  /** O quanto já foi declarado (declarações não canceladas). */
  declarado: number;
};

/** O saldo do item: a quantidade no PCA menos o já declarado (nunca negativo; sem quantidade = 0). */
export function saldoDe(i: Pick<ItemDeclaravel, "quantidade" | "declarado">): number {
  const q = Number(i.quantidade ?? 0);
  if (!(q > 0)) return 0;
  return Math.max(0, Math.round((q - i.declarado) * 1e6) / 1e6);
}

export const totalDaLinha = (q: number, vu: number | null) => Math.round(q * Number(vu ?? 0) * 1e4) / 1e4;

export type LinhaDeclaracao = Omit<ItemDeclaravel, "declarado" | "quantidade" | "dfdId"> & {
  quantidade: number;
  quantidadePca: number;
  valorTotal: number;
  /** A quantidade declarada é MENOR que a do item no PCA. */
  parcial: boolean;
};

export type PedidoItem = { sequencial: number; quantidade: number };

/** Confere o pedido contra os itens do PCA hoje: o item existe, a quantidade é positiva e cabe no saldo. */
export function conferirPedido(pedido: readonly PedidoItem[], itens: readonly ItemDeclaravel[]): { linhas: LinhaDeclaracao[]; erros: string[] } {
  const porSeq = new Map(itens.map((i) => [i.sequencial, i]));
  const vistos = new Set<number>();
  const linhas: LinhaDeclaracao[] = [];
  const erros: string[] = [];
  if (pedido.length === 0) erros.push("Escolha ao menos um item.");
  if (pedido.length > MAX_ITENS_DECLARACAO) erros.push(`No máximo ${MAX_ITENS_DECLARACAO} itens por declaração.`);
  for (const p of pedido) {
    if (vistos.has(p.sequencial)) {
      erros.push(`Item ${p.sequencial}: repetido no pedido.`);
      continue;
    }
    vistos.add(p.sequencial);
    const it = porSeq.get(p.sequencial);
    if (!it) {
      erros.push(`Item ${p.sequencial}: não está (mais) no PCA.`);
      continue;
    }
    const q = Math.round(Number(p.quantidade) * 1e6) / 1e6;
    const qPca = Number(it.quantidade ?? 0);
    if (!(qPca > 0)) {
      erros.push(`Item ${p.sequencial}: sem quantidade no PCA.`);
      continue;
    }
    if (!Number.isFinite(q) || q <= 0) {
      erros.push(`Item ${p.sequencial}: informe uma quantidade maior que zero.`);
      continue;
    }
    const saldo = saldoDe(it);
    if (q > saldo + FOLGA) {
      erros.push(`Item ${p.sequencial}: ${num(q)} passa do saldo (${num(saldo)} de ${num(qPca)}).`);
      continue;
    }
    const { declarado: _d, quantidade: _q, dfdId: _id, ...resto } = it;
    linhas.push({ ...resto, quantidade: q, quantidadePca: qPca, valorTotal: totalDaLinha(q, it.valorUnitario), parcial: q < qPca - FOLGA });
  }
  linhas.sort((a, b) => a.sequencial - b.sequencial);
  return { linhas, erros };
}

export type ConteudoDeclaracao = {
  v: 1;
  pca: { id: number; nome: string; ano: number | null };
  finalidade: Finalidade;
  finalidadeTexto: string | null;
  processo: string | null;
  observacao: string | null;
  linhas: LinhaDeclaracao[];
  totalItens: number;
  valorTotal: number;
  emitente: { nome: string; matricula: string | null; cargo: string | null };
};

export function montarConteudo(d: Omit<ConteudoDeclaracao, "v" | "totalItens" | "valorTotal">): ConteudoDeclaracao {
  const valorTotal = Math.round(d.linhas.reduce((s, l) => s + l.valorTotal, 0) * 1e4) / 1e4;
  return { v: 1, ...d, totalItens: d.linhas.length, valorTotal };
}

/** O texto livre: sem controles/invisíveis, espaços unidos (`limparTexto`), cortado no limite (vazio = null). */
export function limparTextoDeclaracao(s: string | null | undefined, max: number): string | null {
  return limparTexto(s).slice(0, max).trim() || null;
}

/** "007/2026". */
export const rotuloNumero = (numero: number, ano: number) => `${String(numero).padStart(3, "0")}/${ano}`;

/** O SELO do registro: SHA-256 do código, do número, da data e do conteúdo EXATO gravado. */
export const seloDeclaracao = (r: { codigo: string; ano: number; numero: number; emitidoEm: string; conteudo: string }) =>
  sha256(JSON.stringify([r.codigo, r.ano, r.numero, r.emitidoEm, r.conteudo]));

export function lerConteudo(texto: string): ConteudoDeclaracao | null {
  try {
    const c = JSON.parse(texto) as ConteudoDeclaracao;
    return c && c.v === 1 && Array.isArray(c.linhas) ? c : null;
  } catch {
    return null;
  }
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
/** Timestamp do banco → "28 de outubro de 2026" (o dia de Brasília). */
export function dataPorExtenso(ts: string): string {
  const m = dataIsoBrasilia(ts).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${Number(m[3])} de ${MESES[Number(m[2]) - 1]} de ${m[1]}` : ts;
}

const fraseFinalidade = (c: Pick<ConteudoDeclaracao, "finalidade" | "finalidadeTexto">) =>
  c.finalidade === "outra" ? (c.finalidadeTexto ?? "outra finalidade") : (FINALIDADES.find((f) => f.id === c.finalidade)?.frase ?? c.finalidade);

/** O texto da declaração (o mesmo no PDF e na verificação pública). */
export function textoDeclaracao(c: ConteudoDeclaracao): string {
  const pca = `Plano de Contratações Anual (PCA)${c.pca.ano ? ` ${c.pca.ano}` : ""} — "${c.pca.nome}"`;
  const parciais = c.linhas.filter((l) => l.parcial).length;
  const processo = c.processo ? `, no âmbito do processo nº ${c.processo}` : "";
  const parcial = parciais
    ? ` A declaração é PARCIAL para ${parciais === 1 ? "1 item" : `${parciais} itens`}: a quantidade declarada é menor que a prevista no PCA.`
    : "";
  return `Declaro, para os devidos fins, que ${c.totalItens === 1 ? "o item relacionado abaixo consta" : `os ${c.totalItens} itens relacionados abaixo constam`} do ${pca}, nas quantidades e valores unitários indicados, para fins de ${fraseFinalidade(c)}${processo}.${parcial}`;
}

export type RegistroDeclaracao = {
  numero: number;
  ano: number;
  codigo: string;
  selo: string;
  emitidoEm: string;
  urlVerificacao: string;
  cancelada: { em: string; por: string | null; motivo: string | null } | null;
};

/** Os blocos do PDF da declaração (A4 — `documento-pdf-core`). */
export function blocosDeclaracao(c: ConteudoDeclaracao, r: RegistroDeclaracao): BlocoDoc[] {
  const b: BlocoDoc[] = [];
  if (r.cancelada)
    b.push({
      tipo: "nota",
      texto: `DECLARAÇÃO CANCELADA em ${dataHoraBR(r.cancelada.em)}${r.cancelada.por ? ` por ${r.cancelada.por}` : ""}${r.cancelada.motivo ? ` — ${r.cancelada.motivo}` : ""}. Sem validade.`,
      cor: "var(--danger)",
    });
  b.push({ tipo: "titulo", texto: `DECLARAÇÃO Nº ${rotuloNumero(r.numero, r.ano)}` });
  b.push({ tipo: "paragrafo", texto: `Finalidade: ${ROTULO_FINALIDADE[c.finalidade] ?? c.finalidade}${c.finalidade === "outra" && c.finalidadeTexto ? ` — ${c.finalidadeTexto}` : ""}`, cor: "muted" });
  b.push({ tipo: "paragrafo", texto: textoDeclaracao(c) });
  b.push({
    tipo: "destaques",
    itens: [
      { rotulo: "Itens", valor: num(c.totalItens) },
      { rotulo: "Parciais", valor: num(c.linhas.filter((l) => l.parcial).length) },
      { rotulo: "Valor total", valor: brl(c.valorTotal) },
    ],
  });
  b.push({ tipo: "secao", texto: "Itens declarados" });
  b.push({
    tipo: "tabela",
    colunas: [
      { titulo: "Seq.", peso: 0.55, alinhar: "center" },
      { titulo: "DFD / Planej. / Unidade", peso: 1.25, alinhar: "center" },
      { titulo: "Código", peso: 1.3, alinhar: "center" },
      { titulo: "Descrição", peso: 3 },
      { titulo: "Medida", peso: 0.95, alinhar: "center" },
      { titulo: "Qtd. PCA", peso: 0.7, alinhar: "right" },
      { titulo: "Qtd. decl.", peso: 0.8, alinhar: "right" },
      { titulo: "Vlr. unit.", peso: 1.2, alinhar: "right" },
      { titulo: "Vlr. total", peso: 1.45, alinhar: "right" },
    ],
    linhas: [
      ...c.linhas.map((l) => ({
        celulas: [
          String(l.sequencial),
          [l.dfdNumero ? `DFD ${l.dfdNumero}` : "", l.planejamento ? `Planej. ${l.planejamento}` : "", l.sigla ?? ""].filter(Boolean).join(" · ") || "—",
          l.codigo ?? "—",
          l.descricao ?? "—",
          l.unidade ?? "—",
          num(l.quantidadePca),
          `${num(l.quantidade)}${l.parcial ? " (parcial)" : ""}`,
          brl(l.valorUnitario),
          brl(l.valorTotal),
        ],
        cores: [null, null, null, null, null, null, l.parcial ? "var(--warn)" : null, null, null],
      })),
      { celulas: ["", "", "", "TOTAL", "", "", "", "", brl(c.valorTotal)], destaque: true },
    ],
  });
  if (c.processo) b.push({ tipo: "paragrafo", texto: `Processo de referência: ${c.processo}` });
  if (c.observacao) b.push({ tipo: "paragrafo", texto: `Observação: ${c.observacao}` });
  b.push({ tipo: "paragrafo", texto: `${CIDADE_DECLARACAO}, ${dataPorExtenso(r.emitidoEm)}.` });
  b.push({
    tipo: "paragrafo",
    texto: [c.emitente.nome, c.emitente.cargo, c.emitente.matricula ? `Matrícula ${c.emitente.matricula}` : null].filter(Boolean).join(" · "),
  });
  b.push({
    tipo: "quadro",
    titulo: "DECLARAÇÃO ELETRÔNICA — REGISTRO DE AUTENTICIDADE",
    cor: r.cancelada ? "var(--danger)" : "@titulo",
    itens: [
      { rotulo: "Declaração", valor: `Nº ${rotuloNumero(r.numero, r.ano)}` },
      { rotulo: "Emitida por", valor: c.emitente.nome },
      { rotulo: "Data e hora", valor: `${dataHoraBR(r.emitidoEm)} (horário de Brasília)` },
      { rotulo: "Código de verificação", valor: r.codigo },
      { rotulo: "Selo do registro (SHA-256)", valor: r.selo },
    ],
    nota: `Confira a autenticidade em ${r.urlVerificacao}`,
  });
  return b;
}

/** O carimbo de cada página do PDF. */
export function carimboDeclaracao(c: ConteudoDeclaracao, r: RegistroDeclaracao) {
  return {
    titulo: `${r.cancelada ? "CANCELADA · " : ""}DECLARAÇÃO Nº ${rotuloNumero(r.numero, r.ano)} · página {pagina} de {total}`,
    linhas: [`${c.emitente.nome} · ${dataHoraBR(r.emitidoEm)} (Brasília) · código ${r.codigo}`, `Confira em ${r.urlVerificacao}`],
    cor: r.cancelada ? "var(--danger)" : "@titulo",
  };
}
