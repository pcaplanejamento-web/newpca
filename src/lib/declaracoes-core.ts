import { sha256 } from "./conferencia-cache-core.ts";
import type { BlocoDoc } from "./documento-pdf-core.ts";
import { PALETA_PADRAO, type PaletaPdf } from "./exportar-pdf-core.ts";
import { brl, dataHoraBR, dataIsoBrasilia, num } from "./format.ts";
import { limparTexto } from "./normalize.ts";
import { textoSimples } from "./texto-formatado.ts";

/**
 * DECLARAÇÕES DO PCA — núcleo PURO (testado). Uma declaração atesta que itens constam de um PCA, TOTAL ou PARCIALMENTE (12
 * no PCA, 6 declarados): para instruir o início da contratação, um empenho complementar, um aditivo… Cada item é
 * identificado pelo SEQUENCIAL do PCA (estável — segue o item nas regravações) e tem SALDO = a quantidade no PCA menos o já
 * declarado nas declarações não canceladas (o banco barra além dele — gatilho `declaracao_itens_saldo`). O CONTEÚDO é um
 * retrato congelado (o PCA pode mudar depois), selado por SHA-256 e conferível pelo CÓDIGO na página pública. Até EXPORTAR o
 * PDF, a declaração pode ser EDITADA (o retrato e o selo são refeitos); exportada, fica travada (gatilho do banco).
 */

/** Quem EMITE declarações num PCA (Configuração do PCA): todos (o papel decide) · só os Administradores · ninguém. */
export const MODOS_DECLARACOES = ["todos", "adm", "desligado"] as const;
export type ModoDeclaracoes = (typeof MODOS_DECLARACOES)[number];
export const ROTULO_MODO_DECLARACOES: Record<ModoDeclaracoes, string> = {
  todos: "Todos com permissão",
  adm: "Só os Administradores",
  desligado: "Desligado",
};
export const coerceModoDeclaracoes = (v: unknown): ModoDeclaracoes => (MODOS_DECLARACOES.includes(v as ModoDeclaracoes) ? (v as ModoDeclaracoes) : "todos");

/**
 * O que a pessoa faz nas declarações do PCA pelo MODO (o papel ainda decide cada ação): `total` = como o papel manda ·
 * `leitura` = consulta, baixa e cancela as emitidas, sem emitir (o ADM com o modo desligado) · `nenhum` = a aba some.
 */
export function acessoDeclaracoes(modo: ModoDeclaracoes, admin: boolean): "total" | "leitura" | "nenhum" {
  if (modo === "todos") return "total";
  if (!admin) return "nenhum";
  return modo === "adm" ? "total" : "leitura";
}

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
export const LIMITES_DECLARACAO = { processo: 80, finalidadeTexto: 200, observacao: 4000, motivo: 300, protocoloCenti: 20 } as const;
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
  /** O já declarado por OUTRAS declarações na data da emissão (as emitidas antes da v1.251.0 não têm). */
  quantidadeAntes?: number;
  valorTotal: number;
  /** A quantidade declarada é MENOR que a do item no PCA. */
  parcial: boolean;
};

/** O que sobra do item no PCA depois desta declaração (na data da emissão) — `null` quando o retrato não tem o já declarado. */
export function remanescente(l: Pick<LinhaDeclaracao, "quantidadePca" | "quantidade" | "quantidadeAntes">): number | null {
  if (l.quantidadeAntes == null) return null;
  return Math.max(0, Math.round((l.quantidadePca - l.quantidadeAntes - l.quantidade) * 1e6) / 1e6);
}

/**
 * O PROTOCOLO da Centi a que a declaração é vinculada: "156844" ou "156844/2026" (espaços e zeros à esquerda saem). Fora
 * desse formato = `null`.
 */
export function lerProtocoloCenti(s: string | null | undefined): string | null {
  const m = String(s ?? "").match(/^\s*0*(\d{1,12})\s*(?:\/\s*(\d{4}))?\s*$/);
  if (!m || Number(m[1]) === 0) return null;
  return m[2] ? `${m[1]}/${m[2]}` : m[1];
}

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
    linhas.push({
      ...resto,
      quantidade: q,
      quantidadePca: qPca,
      quantidadeAntes: Math.round(it.declarado * 1e6) / 1e6,
      valorTotal: totalDaLinha(q, it.valorUnitario),
      parcial: q < qPca - FOLGA,
    });
  }
  linhas.sort((a, b) => a.sequencial - b.sequencial);
  return { linhas, erros };
}

export type ConteudoDeclaracao = {
  v: 1;
  pca: { id: number; nome: string; ano: number | null };
  finalidade: Finalidade;
  finalidadeTexto: string | null;
  /** O protocolo da Centi a que a declaração é vinculada (as emitidas antes da v1.251.0 não têm). */
  protocoloCenti?: string | null;
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

/**
 * A OBSERVAÇÃO é texto FORMATADO (o `EditorRico`): guarda as quebras de linha e a marcação; cada linha limpa
 * (`limparTexto` — controles/invisíveis), 3+ quebras viram 2 e corta no limite (vazio = null).
 */
export function limparObservacao(s: string | null | undefined): string | null {
  const t = String(s ?? "")
    .split(/\r\n?|\n/)
    .map((l) => limparTexto(l))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return t.slice(0, LIMITES_DECLARACAO.observacao).trim() || null;
}

/**
 * Os itens do PCA para EDITAR uma declaração: o "já declarado" de cada item SEM o que a própria declaração declara (senão o
 * saldo dela mesma a impediria de manter a quantidade). O banco faz a mesma conta (apaga os itens dela antes de regravar).
 */
export function itensParaEdicao(itens: readonly ItemDeclaravel[], linhas: readonly Pick<LinhaDeclaracao, "sequencial" | "quantidade">[]): ItemDeclaravel[] {
  const proprio = new Map(linhas.map((l) => [l.sequencial, l.quantidade]));
  return itens.map((i) => (proprio.has(i.sequencial) ? { ...i, declarado: Math.max(0, Math.round((i.declarado - (proprio.get(i.sequencial) ?? 0)) * 1e6) / 1e6) } : i));
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
  const protocolo = c.protocoloCenti ? `, vinculada ao protocolo nº ${c.protocoloCenti} do sistema Centi` : "";
  const processo = c.processo ? `, no âmbito do processo ou empenho nº ${c.processo}` : "";
  const parcial = parciais
    ? ` A declaração é PARCIAL para ${parciais === 1 ? "1 item" : `${parciais} itens`}: a quantidade declarada é menor que a prevista no PCA.`
    : "";
  return `Declaro, para os devidos fins, que ${c.totalItens === 1 ? "o item relacionado abaixo consta" : `os ${c.totalItens} itens relacionados abaixo constam`} do ${pca}, nas quantidades e valores unitários indicados, para fins de ${fraseFinalidade(c)}${protocolo}${processo}.${parcial}`;
}

export type RegistroDeclaracao = {
  numero: number;
  ano: number;
  codigo: string;
  selo: string;
  emitidoEm: string;
  urlVerificacao: string;
  cancelada: { em: string; por: string | null; motivo: string | null } | null;
  /** Ainda NÃO exportada: o PDF é uma PRÉVIA (sai marcado, sem validade). */
  previa: boolean;
};

/**
 * As cores do documento oficial: SÓBRIAS — texto quase preto, títulos e molduras em grafite, cabeçalho da tabela e zebra em
 * cinza claro (nada colorido; o timbre da Prefeitura é a única cor da folha).
 */
export const PALETA_DECLARACAO: PaletaPdf = {
  ...PALETA_PADRAO,
  texto: "#1a1a1a",
  muted: "#555555",
  titulo: "#1a1a1a",
  cabecalhoFundo: "#ececec",
  cabecalhoTexto: "#1a1a1a",
  destaque: "#f4f4f4",
  zebra: "#f8f8f8",
  borda: "#bdbdbd",
};
/** A cor das molduras (aviso, assinatura e carimbo) — o grafite; a cancelada, o vermelho. */
const COR_MOLDURA = "#4a4a4a";

/** O título do PCA no documento: "PLANO DE CONTRATAÇÕES ANUAL – PCA 2026". */
const tituloPca = (c: ConteudoDeclaracao) => `PLANO DE CONTRATAÇÕES ANUAL – PCA${c.pca.ano ? ` ${c.pca.ano}` : ""}`;
const ou = (v: string | null | undefined) => (v && v.trim() ? v : "—");
const rotuloItens = (n: number) => (n === 1 ? "1 item" : `${num(n)} itens`);

/**
 * Os blocos do PDF da declaração (A4 com o TIMBRE da Prefeitura — `documento-pdf-core`), no padrão dos documentos
 * oficiais: título centralizado, texto justificado, 1 · a identificação, 2 · os itens (a origem de cada um: DFD,
 * planejamento, protocolo e unidade), 3 · as quantidades e 4 · os valores (previsto no PCA, já declarado, desta declaração e o
 * que sobra), local e data, quem emitiu e o registro da assinatura. Os títulos das colunas por extenso. A PRÉVIA (antes de
 * exportar) e a CANCELADA saem com o aviso no topo.
 */
export function blocosDeclaracao(c: ConteudoDeclaracao, r: RegistroDeclaracao): BlocoDoc[] {
  const b: BlocoDoc[] = [];
  if (r.cancelada)
    b.push({
      tipo: "nota",
      texto: `DECLARAÇÃO CANCELADA em ${dataHoraBR(r.cancelada.em)}${r.cancelada.por ? ` por ${r.cancelada.por}` : ""}${r.cancelada.motivo ? ` — ${r.cancelada.motivo}` : ""}. Sem validade.`,
      cor: "var(--danger)",
    });
  else if (r.previa)
    b.push({ tipo: "nota", texto: "PRÉVIA — esta declaração ainda não foi exportada e não tem validade. Ao exportar o PDF, ela deixa de ser editável.", cor: COR_MOLDURA });
  b.push({ tipo: "titulo", texto: `DECLARAÇÃO Nº ${rotuloNumero(r.numero, r.ano)}`, alinhar: "centro" });
  b.push({ tipo: "paragrafo", texto: `DECLARAÇÃO DE ITENS DO ${tituloPca(c)}`, alinhar: "centro", negrito: true });
  b.push({ tipo: "paragrafo", texto: textoDeclaracao(c), alinhar: "justificado" });

  const parciais = c.linhas.filter((l) => l.parcial).length;
  b.push({ tipo: "secao", texto: "1. Identificação" });
  b.push({
    tipo: "tabela",
    colunas: [
      { titulo: "Dado", peso: 1.6 },
      { titulo: "Informação", peso: 3.4 },
    ],
    linhas: [
      ["Plano de Contratações Anual", `${c.pca.ano ? `PCA ${c.pca.ano} — ` : ""}${c.pca.nome}`],
      ["Finalidade", c.finalidade === "outra" ? ou(c.finalidadeTexto) : (ROTULO_FINALIDADE[c.finalidade] ?? c.finalidade)],
      ["Protocolo vinculado (Centi)", ou(c.protocoloCenti)],
      ["Processo ou empenho de referência", ou(c.processo)],
      ["Itens declarados", `${rotuloItens(c.totalItens)}${parciais ? ` (${parciais === 1 ? "1 parcial" : `${num(parciais)} parciais`})` : ""}`],
      ["Valor total declarado", brl(c.valorTotal)],
      ["Data da emissão", `${dataHoraBR(r.emitidoEm)} (horário de Brasília)`],
    ].map(([k, v]) => ({ celulas: [k, v], negritos: [true, false] })),
  });

  b.push({ tipo: "secao", texto: "2. Itens declarados" });
  b.push({
    tipo: "tabela",
    colunas: [
      { titulo: "Item", peso: 0.6, alinhar: "center" },
      { titulo: "Código", peso: 1.1, alinhar: "center" },
      { titulo: "Descrição", peso: 3.4, alinhar: "center" },
      { titulo: "Medida", peso: 1, alinhar: "center" },
      { titulo: "DFD", peso: 0.9, alinhar: "center" },
      { titulo: "Planejamento", peso: 1.1, alinhar: "center" },
      { titulo: "Protocolo", peso: 1.2, alinhar: "center" },
      { titulo: "Unidade", peso: 1, alinhar: "center" },
    ],
    linhas: c.linhas.map((l) => ({
      celulas: [
        String(l.sequencial),
        ou(l.codigo),
        ou(l.descricao),
        ou(l.unidade),
        l.dfdNumero ? `${l.dfdNumero}${l.itemNumero != null ? ` · item ${l.itemNumero}` : ""}` : "—",
        ou(l.planejamento),
        ou(l.protocoloNumero),
        ou(l.sigla),
      ],
    })),
  });

  const restos = c.linhas.map(remanescente);
  const semRestos = restos.some((q) => q == null);
  b.push({ tipo: "secao", texto: "3. Quantidades" });
  b.push({
    tipo: "tabela",
    colunas: [
      { titulo: "Item", peso: 0.8, alinhar: "center" },
      { titulo: "Medida", peso: 1.3, alinhar: "center" },
      { titulo: "No PCA", peso: 1.2, alinhar: "center" },
      { titulo: "Já declarada", peso: 1.2, alinhar: "center" },
      { titulo: "Declarada", peso: 1.3, alinhar: "center" },
      { titulo: "Saldo", peso: 1.2, alinhar: "center" },
    ],
    linhas: c.linhas.map((l, i) => ({
      celulas: [
        String(l.sequencial),
        ou(l.unidade),
        num(l.quantidadePca),
        l.quantidadeAntes == null ? "—" : num(l.quantidadeAntes),
        `${num(l.quantidade)}${l.parcial ? " (parcial)" : ""}`,
        restos[i] == null ? "—" : num(restos[i]),
      ],
    })),
  });

  b.push({ tipo: "secao", texto: "4. Valores" });
  const somaPrevisto = c.linhas.reduce((s, l) => s + totalDaLinha(l.quantidadePca, l.valorUnitario), 0);
  const somaResto = restos.reduce<number>((s, q, i) => s + totalDaLinha(q ?? 0, c.linhas[i].valorUnitario), 0);
  b.push({
    tipo: "tabela",
    colunas: [
      { titulo: "Item", peso: 0.8, alinhar: "center" },
      { titulo: "Unitário", peso: 1.3, alinhar: "center" },
      { titulo: "No PCA", peso: 1.45, alinhar: "center" },
      { titulo: "Declarado", peso: 1.45, alinhar: "center" },
      { titulo: "Saldo", peso: 1.45, alinhar: "center" },
    ],
    linhas: [
      ...c.linhas.map((l, i) => ({
        celulas: [
          String(l.sequencial),
          brl(l.valorUnitario),
          brl(totalDaLinha(l.quantidadePca, l.valorUnitario)),
          brl(l.valorTotal),
          restos[i] == null ? "—" : brl(totalDaLinha(restos[i] ?? 0, l.valorUnitario)),
        ],
      })),
      { celulas: ["TOTAL", "", brl(somaPrevisto), brl(c.valorTotal), semRestos ? "—" : brl(somaResto)], destaque: true },
    ],
  });
  b.push({
    tipo: "paragrafo",
    texto: `Item = o número do item no PCA. Saldo = quantidade no PCA − já declarada (em outras declarações) − declarada nesta, apurado na data da emissão (declarações canceladas não contam); o valor do saldo é o saldo × o valor unitário. Valores em reais (R$).${semRestos ? " Esta declaração foi emitida antes do registro do já declarado: o saldo não consta." : ""}`,
    cor: "muted",
    alinhar: "justificado",
  });

  const obs = textoSimples(c.observacao)
    .split(/\n+/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (obs.length) {
    b.push({ tipo: "secao", texto: "5. Observação" });
    for (const t of obs) b.push({ tipo: "paragrafo", texto: t, alinhar: "justificado" });
  }
  b.push({
    tipo: "paragrafo",
    texto: `As informações apresentadas destinam-se à comprovação da previsão dos itens no ${tituloPca(c).replace("PLANO DE CONTRATAÇÕES ANUAL", "Plano de Contratações Anual")}, nos termos do artigo 12 da Lei nº 14.133/2021.`,
    alinhar: "justificado",
  });
  b.push({ tipo: "paragrafo", texto: `${CIDADE_DECLARACAO}, ${dataPorExtenso(r.emitidoEm)}.`, alinhar: "centro" });
  b.push({ tipo: "paragrafo", texto: c.emitente.nome, alinhar: "centro", negrito: true });
  const funcao = [c.emitente.cargo, c.emitente.matricula ? `Matrícula ${c.emitente.matricula}` : null].filter(Boolean).join(" · ");
  if (funcao) b.push({ tipo: "paragrafo", texto: funcao, alinhar: "centro", cor: "muted" });
  b.push({ tipo: "paragrafo", texto: "Assinado e datado digitalmente.", alinhar: "centro", negrito: true });
  b.push({
    tipo: "quadro",
    titulo: "DECLARAÇÃO ELETRÔNICA — REGISTRO DE AUTENTICIDADE",
    cor: r.cancelada ? "var(--danger)" : COR_MOLDURA,
    itens: [
      { rotulo: "Declaração", valor: `Nº ${rotuloNumero(r.numero, r.ano)} — ${ROTULO_FINALIDADE[c.finalidade] ?? c.finalidade}` },
      ...(c.protocoloCenti ? [{ rotulo: "Protocolo vinculado", valor: `${c.protocoloCenti} (Centi)` }] : []),
      { rotulo: "Emitida por", valor: c.emitente.nome },
      { rotulo: "Data e hora", valor: `${dataHoraBR(r.emitidoEm)} (horário de Brasília)` },
      { rotulo: "Código de verificação", valor: r.codigo },
      { rotulo: "Selo do registro (SHA-256)", valor: r.selo },
    ],
    nota: `Confira a autenticidade em ${r.urlVerificacao}`,
  });
  return b;
}

/** O carimbo das páginas do PDF (a da assinatura não o leva — a assinatura ocupa o lugar dele). */
export function carimboDeclaracao(c: ConteudoDeclaracao, r: RegistroDeclaracao) {
  return {
    titulo: `${r.cancelada ? "CANCELADA · " : r.previa ? "PRÉVIA · " : ""}DECLARAÇÃO Nº ${rotuloNumero(r.numero, r.ano)} · página {pagina} de {total}`,
    linhas: [`${c.emitente.nome} · ${dataHoraBR(r.emitidoEm)} (Brasília) · código ${r.codigo}`, `Confira em ${r.urlVerificacao}`],
    cor: r.cancelada ? "var(--danger)" : COR_MOLDURA,
  };
}
