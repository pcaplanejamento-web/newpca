import type { ColunaDoc, BlocoDoc, LinhaDoc } from "./documento-pdf-core.ts";
import type { ConferenciaItem, FaltaCatalogoItem } from "./catalogo-conferencia.ts";
import {
  linhasRelatorioDfd,
  linhasRelatorioProtocolo,
  mapaItensDuplicados,
  type MensagemDfd,
  SECOES_OBRIGATORIAS,
  ROTULO_CURTO,
  semValorUnitario,
  STATUS_MENSAGEM_COR,
  textoSecao,
} from "./dfd-tratamento.ts";
import { brl, num } from "./format.ts";
import { normalizarCodigo } from "./parse-catalogo-comum.ts";
import { type DfdItemParseado, type DfdSecao, refDfd, tipoCurtoDfd } from "./parse-dfd-comum.ts";

/**
 * PENDÊNCIAS PADRONIZADAS — Protocolo › DFD › Item, num modelo ÚNICO (puro, testável). A fonte é a MESMA régua da célula
 * Estado e dos botões: as mensagens do DFD (`mensagensDfd`, com os níveis e cores do ADM) e a conciliação da capa. O DFD
 * SOMA os itens (as mensagens agregadas de itens — "Falta valor unitário em 3 de 10 itens" — viram a lista de CADA item com
 * pendência, no status/cor da mensagem) e o PROTOCOLO soma a capa + os DFDs. Daqui saem o painel (`PainelPendencias`), o
 * texto copiável (despacho · WhatsApp · lista) e o PDF (blocos do `documento-pdf-core`).
 */

export type StatusPendencia = "erro" | "atencao";

/** Para onde LEVAR ao tocar: o DFD (chave do host), o ITEM (índice) e a ÂNCORA (`data-ancora`) no banner. */
export type AlvoPendencia = { dfd?: string | number; item?: number; ancora: string };

/** Uma pendência (folha): o ponto, o status/cor do ADM, o texto e ONDE está (+ o trecho atual do componente). */
export type Pendencia = {
  chave: string;
  status: StatusPendencia;
  cor?: string;
  texto: string;
  /** Onde está (rótulo legível — "Seção 6 — Prioridade", "Assinatura", "Capa do processo"…). */
  onde: string;
  /** O CONTEÚDO atual do componente (o texto da seção, o valor da capa) — vai ao PDF. */
  contexto?: string;
  alvo: AlvoPendencia;
};

/** Um ITEM com pendência (a linha da Seção 4 + os problemas dele). */
export type ItemPendente = {
  idx: number;
  item: number | null;
  codigo: string | null;
  descricao: string | null;
  unidade: string | null;
  quantidade: number | null;
  valorUnitario: number | null;
  status: StatusPendencia;
  problemas: Pendencia[];
};

/** Um DFD com as pendências PRÓPRIAS + os itens (soma dos itens) + as linhas do despacho (ações cirúrgicas). */
export type DfdPendente = {
  chave: string | number;
  numero: string;
  planejamento: string | null;
  tipo: string | null;
  status: StatusPendencia;
  pendencias: Pendencia[];
  /** As mensagens AGREGADAS dos itens (uma por ponto — contam no total do DFD). */
  resumoItens: Pendencia[];
  itens: ItemPendente[];
  /** O texto do DESPACHO (as faltas cirúrgicas — `faltasCirurgicasDfd`); sem ele, os textos das pendências. */
  despacho?: string[];
};

export type ProtocoloPendente = {
  numero: string;
  idExterno?: string | null;
  interessado?: string | null;
  assunto?: string | null;
  capa: Pendencia | null;
  dfds: DfdPendente[];
};

export type Contagem = { erros: number; atencoes: number };

/** Os pontos que são de ITEM (a mensagem do DFD agrega; a pendência vai a cada item). */
const CHAVES_ITEM = new Set([
  "item.valorUnitario",
  "item.quantidade",
  "item.duplicado",
  "item.naoCatalogado",
  "item.divergenteCatalogo",
  "item.tipoIncompativel",
]);
const FALTA_DA_CHAVE: Record<string, FaltaCatalogoItem> = {
  "item.naoCatalogado": "naoCatalogado",
  "item.divergenteCatalogo": "divergenteCatalogo",
  "item.tipoIncompativel": "tipoIncompativel",
};
/** A âncora do campo no detalhe do item (`ItemDetalhe`). */
const ANCORA_ITEM: Record<string, string> = {
  "item.valorUnitario": "valorUnitario",
  "item.quantidade": "quantidade",
  "item.duplicado": "repetidos",
  "item.naoCatalogado": "catalogo",
  "item.divergenteCatalogo": "catalogo",
  "item.tipoIncompativel": "catalogo",
};

/** Rótulo legível do LUGAR de cada âncora do banner do DFD. */
const ONDE: Record<string, string> = {
  reparticao: "Unidade / Setor requisitante",
  tipo: "Tipo do DFD",
  anoPca: "Identificação (Seção 1)",
  referenciaRenovacao: "Referências da renovação",
  itens: "Itens (Seção 4)",
  assinatura: "Assinatura digital",
  capa: "Capa do processo",
  duplicados: "DFDs duplicados no protocolo",
  valorUnitario: "Valor unitário",
  quantidade: "Quantidade",
  repetidos: "Item repetido",
  catalogo: "Catálogo",
};
for (const s of SECOES_OBRIGATORIAS) ONDE[s.chave.replace(/^dfd\./, "")] = s.rotulo;

export const ondeDaAncora = (ancora: string): string => ONDE[ancora] ?? "DFD";

const cortar = (s: string, max = 400) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

/** O que cada ponto de item diz NAQUELE item. */
function textoNoItem(chave: string, it: DfdItemParseado, iguais: (number | null)[]): string {
  switch (chave) {
    case "item.valorUnitario":
      return "Sem valor unitário";
    case "item.quantidade":
      return "Sem quantidade";
    case "item.duplicado":
      return `Repetido — igual ao item ${iguais.map((n) => n ?? "—").join(", ")}`;
    case "item.naoCatalogado":
      return `Fora do catálogo${it.codigo ? ` (código ${it.codigo})` : ""}`;
    case "item.divergenteCatalogo":
      return "Descrição/unidade diferente do catálogo";
    default:
      return "Tipo de DFD não permitido pelo catálogo";
  }
}

const pior = (a: StatusPendencia, b: StatusPendencia): StatusPendencia => (a === "erro" || b === "erro" ? "erro" : "atencao");

/**
 * As pendências de UM DFD a partir das MENSAGENS dele (as mesmas do painel e da célula Estado): as próprias do DFD (com o
 * TEXTO ATUAL da seção como contexto) e, para cada ponto de ITEM em erro/atenção, os itens que o têm — no status/cor da
 * mensagem. `conformidade` = o veredito do catálogo por código (o mesmo das mensagens). Puro e linear.
 */
export function pendenciasDoDfd(
  dfd: { chave: string | number; numero: string; planejamento: string | null; tipo: string | null; secoes: DfdSecao[]; itens: DfdItemParseado[] },
  mensagens: Pick<MensagemDfd, "chave" | "status" | "texto" | "ancora" | "cor">[],
  conformidade?: Map<string, ConferenciaItem>,
  despacho?: string[],
): DfdPendente {
  const pendencias: Pendencia[] = [];
  const resumoItens: Pendencia[] = [];
  const porItem = new Map<number, ItemPendente>();
  let dups: Map<number, number[]> | null = null;
  for (const m of mensagens) {
    if (m.status === "acerto") continue;
    const status: StatusPendencia = m.status;
    const base = { chave: m.chave, status, ...(m.cor ? { cor: m.cor } : {}) };
    if (!CHAVES_ITEM.has(m.chave) || dfd.itens.length === 0) {
      const secao = SECOES_OBRIGATORIAS.find((s) => s.chave === m.chave);
      const atual = secao ? textoSecao(dfd.secoes, secao.kw).trim() : "";
      pendencias.push({
        ...base,
        texto: m.texto,
        onde: ondeDaAncora(m.ancora),
        ...(secao ? { contexto: atual ? cortar(atual) : "(não preenchida)" } : {}),
        alvo: { dfd: dfd.chave, ancora: m.ancora },
      });
      continue;
    }
    resumoItens.push({ ...base, texto: m.texto, onde: ondeDaAncora("itens"), alvo: { dfd: dfd.chave, ancora: "itens" } });
    const falta = FALTA_DA_CHAVE[m.chave];
    if (m.chave === "item.duplicado") dups ??= mapaItensDuplicados(dfd.itens);
    dfd.itens.forEach((it, idx) => {
      let tem = false;
      let iguais: (number | null)[] = [];
      if (m.chave === "item.valorUnitario") tem = semValorUnitario(it.valorUnitario);
      else if (m.chave === "item.quantidade") tem = it.quantidade == null;
      else if (m.chave === "item.duplicado") {
        const g = dups?.get(idx);
        tem = !!g;
        if (g) iguais = g.filter((j) => j !== idx).slice(0, 10).map((j) => dfd.itens[j].item ?? j + 1);
      } else if (falta) tem = !!conformidade?.get(normalizarCodigo(it.codigo ?? null))?.faltas.includes(falta);
      if (!tem) return;
      const ancora = ANCORA_ITEM[m.chave];
      const p: Pendencia = { ...base, texto: textoNoItem(m.chave, it, iguais), onde: ondeDaAncora(ancora), alvo: { dfd: dfd.chave, item: idx, ancora } };
      const atual = porItem.get(idx);
      if (atual) {
        atual.problemas.push(p);
        atual.status = pior(atual.status, status);
      } else
        porItem.set(idx, {
          idx,
          item: it.item,
          codigo: it.codigo,
          descricao: it.descricao,
          unidade: it.unidade,
          quantidade: it.quantidade,
          valorUnitario: it.valorUnitario,
          status,
          problemas: [p],
        });
    });
  }
  const itens = [...porItem.values()].sort((a, b) => a.idx - b.idx);
  const todas = [...pendencias, ...resumoItens];
  return {
    chave: dfd.chave,
    numero: dfd.numero,
    planejamento: dfd.planejamento,
    tipo: dfd.tipo,
    status: todas.some((p) => p.status === "erro") ? "erro" : "atencao",
    pendencias,
    resumoItens,
    itens,
    ...(despacho ? { despacho } : {}),
  };
}

/**
 * As pendências de UM ITEM sozinho (o detalhe do item — o banner do item): `problemas` = as mensagens do item
 * (`mensagensItem` — a MESMA régua da célula Estado da tabela de itens) + as do catálogo; cada uma aponta o CAMPO. Devolve
 * o DFD de origem com só este item (o mesmo formato do painel, do texto e do PDF). Puro.
 */
export function pendenciasDoItemSolo(
  dfd: { chave: string | number; numero: string; planejamento: string | null; tipo: string | null },
  it: Pick<DfdItemParseado, "item" | "codigo" | "descricao" | "unidade" | "quantidade" | "valorUnitario">,
  idx: number,
  problemas: { chave: string; status: "erro" | "atencao" | "acerto"; texto: string; cor?: string }[],
): DfdPendente {
  const lista: Pendencia[] = problemas
    .filter((m): m is typeof m & { status: StatusPendencia } => m.status !== "acerto")
    .map((m) => {
      const ancora = ANCORA_ITEM[m.chave] ?? "catalogo";
      return { chave: m.chave, status: m.status, ...(m.cor ? { cor: m.cor } : {}), texto: m.texto, onde: ondeDaAncora(ancora), alvo: { dfd: dfd.chave, item: idx, ancora } };
    });
  const status: StatusPendencia = lista.some((p) => p.status === "erro") ? "erro" : "atencao";
  return {
    ...dfd,
    status,
    pendencias: [],
    resumoItens: lista,
    itens: lista.length ? [{ idx, item: it.item, codigo: it.codigo, descricao: it.descricao, unidade: it.unidade, quantidade: it.quantidade, valorUnitario: it.valorUnitario, status, problemas: lista }] : [],
  };
}

/** A pendência da CAPA (conciliação do valor) — `null` quando confere. */
export function pendenciaDaCapa(
  conc: { divergente: boolean; bloqueia: boolean; motivo: string | null; somatorio: number },
  valorCapa: number | null | undefined,
): Pendencia | null {
  if (!conc.divergente || !conc.motivo) return null;
  const status: StatusPendencia = conc.bloqueia ? "erro" : "atencao";
  return {
    chave: "protocolo.valorCapa",
    status,
    cor: STATUS_MENSAGEM_COR[status],
    texto: conc.motivo,
    onde: ondeDaAncora("capa"),
    contexto: `Valor da capa: ${valorCapa != null && valorCapa > 0 ? brl(valorCapa) : "não informado"} · Somatória dos DFDs: ${brl(conc.somatorio)}`,
    alvo: { ancora: "capa" },
  };
}

/** Um DFD tem alguma pendência? */
export const temPendencia = (d: DfdPendente): boolean => d.pendencias.length + d.resumoItens.length > 0;

/** A contagem do DFD = a das mensagens (pendências próprias + uma por ponto de item). */
export function contarDfd(d: DfdPendente): Contagem {
  const todas = [...d.pendencias, ...d.resumoItens];
  return { erros: todas.filter((p) => p.status === "erro").length, atencoes: todas.filter((p) => p.status === "atencao").length };
}

/** A contagem do PROTOCOLO = a capa + a SOMA dos DFDs. */
export function contarProtocolo(p: ProtocoloPendente): Contagem {
  const c: Contagem = { erros: p.capa?.status === "erro" ? 1 : 0, atencoes: p.capa?.status === "atencao" ? 1 : 0 };
  for (const d of p.dfds) {
    const x = contarDfd(d);
    c.erros += x.erros;
    c.atencoes += x.atencoes;
  }
  return c;
}

// ---- ESCOLHA do que vai à CÓPIA e ao PDF (tipos de problema · situação · DFDs) ----

/** Um TIPO de problema (o ponto conferido) com quantas ocorrências há — a lista de escolha do "Montar documento". */
export type TipoPendencia = { chave: string; rotulo: string; erros: number; atencoes: number };

/** O que entra: as situações (erro/atenção), os tipos de problema (`chave`) e os DFDs (`String(chave)`). */
export type FiltroPendencias = { status: Set<StatusPendencia>; chaves: Set<string>; dfds: Set<string> };

/** Rótulos curtos dos tipos que o `ROTULO_CURTO` diz pela FALTA ("Sem prioridade") — aqui vale o ponto (falta OU fora do padrão). */
const ROTULO_TIPO: Record<string, string> = {
  "protocolo.valorCapa": "Valor da capa",
  leitura: "Leitura do PDF",
  "dfd.justificativa": "Justificativa",
  "dfd.previsao": "Previsão de entrega",
  "dfd.prioridade": "Prioridade",
  "dfd.fundamentacao": "Fundamentação legal",
};

export function rotuloTipoPendencia(chave: string, texto = ""): string {
  if (chave.startsWith("item.catalogo:")) return chave.slice("item.catalogo:".length);
  return ROTULO_TIPO[chave] ?? ROTULO_CURTO[chave] ?? cortar(texto, 60);
}

/** As ocorrências (as folhas que o leitor vê): a capa, as pendências do DFD e os problemas de cada item. */
function ocorrencias(p: ProtocoloPendente): Pendencia[] {
  const out: Pendencia[] = p.capa ? [p.capa] : [];
  for (const d of p.dfds) {
    out.push(...d.pendencias);
    out.push(...d.resumoItens.filter((r) => !d.itens.some((it) => it.problemas.some((x) => x.chave === r.chave))));
    for (const it of d.itens) out.push(...it.problemas);
  }
  return out;
}

/** Os tipos de problema presentes (na ordem em que aparecem), com as contagens. */
export function tiposDePendencia(p: ProtocoloPendente): TipoPendencia[] {
  const m = new Map<string, TipoPendencia>();
  for (const x of ocorrencias(p)) {
    let t = m.get(x.chave);
    if (!t) {
      t = { chave: x.chave, rotulo: rotuloTipoPendencia(x.chave, x.texto), erros: 0, atencoes: 0 };
      m.set(x.chave, t);
    }
    if (x.status === "erro") t.erros++;
    else t.atencoes++;
  }
  return [...m.values()];
}

/** O filtro com TUDO marcado (o padrão ao abrir). */
export function filtroCompleto(p: ProtocoloPendente): FiltroPendencias {
  return { status: new Set(["erro", "atencao"]), chaves: new Set(tiposDePendencia(p).map((t) => t.chave)), dfds: new Set(p.dfds.map((d) => String(d.chave))) };
}

/**
 * Só o que foi ESCOLHIDO (situação × tipo × DFD) — o DFD/item que fica sem nada sai. O DFD de que algo foi tirado perde o
 * despacho cirúrgico pronto (que não separa por tipo) e o despacho dele passa a ser os textos das pendências escolhidas.
 */
export function filtrarPendencias(p: ProtocoloPendente, f: FiltroPendencias): ProtocoloPendente {
  const ok = (x: Pendencia) => f.status.has(x.status) && f.chaves.has(x.chave);
  const dfds = p.dfds
    .filter((d) => f.dfds.has(String(d.chave)))
    .map((d) => {
      const pendencias = d.pendencias.filter(ok);
      const resumoItens = d.resumoItens.filter(ok);
      const itens = d.itens
        .map((it) => {
          const problemas = it.problemas.filter(ok);
          return { ...it, problemas, status: problemas.some((x) => x.status === "erro") ? ("erro" as const) : ("atencao" as const) };
        })
        .filter((it) => it.problemas.length > 0);
      const inteiro =
        pendencias.length === d.pendencias.length &&
        resumoItens.length === d.resumoItens.length &&
        itens.length === d.itens.length &&
        itens.every((it, i) => it.problemas.length === d.itens[i].problemas.length);
      const { despacho, ...resto } = d;
      return { ...resto, pendencias, resumoItens, itens, ...(inteiro && despacho ? { despacho } : {}) };
    })
    .filter(temPendencia);
  return { ...p, capa: p.capa && ok(p.capa) ? p.capa : null, dfds };
}

// ---- TEXTO COPIÁVEL (despacho · WhatsApp · lista) ----

export type FormatoTexto = "despacho" | "whatsapp" | "lista";
export const FORMATOS_TEXTO: { valor: FormatoTexto; rotulo: string; dica: string }[] = [
  { valor: "despacho", rotulo: "Despacho", dica: "Despacho de devolução formal, pronto para o processo" },
  { valor: "whatsapp", rotulo: "WhatsApp", dica: "Mensagem curta com negrito e marcadores, para colar no WhatsApp" },
  { valor: "lista", rotulo: "Lista simples", dica: "Texto hierárquico (protocolo › DFD › item) para e-mail ou chamado" },
];

const rotuloItem = (it: ItemPendente) => `Item ${it.item ?? it.idx + 1}${it.codigo ? ` (cód. ${it.codigo})` : ""}`;
const linhaItem = (it: ItemPendente) => `${rotuloItem(it)}: ${it.problemas.map((p) => p.texto).join("; ")}`;
const tituloDfd = (d: DfdPendente) => {
  const tipo = tipoCurtoDfd(d.tipo);
  return `DFD ${refDfd(d.numero, d.planejamento)}${tipo ? ` — ${tipo}` : ""}`;
};
/** As linhas de despacho de um DFD (as faltas cirúrgicas; sem elas, os textos das pendências). */
const despachoDe = (d: DfdPendente) => d.despacho ?? [...d.pendencias, ...d.resumoItens].map((p) => p.texto);

/** O texto de um PROTOCOLO (ou de um DFD/item só: `numero` vazio e um DFD) no formato pedido. */
export function textoPendencias(p: ProtocoloPendente, formato: FormatoTexto, escopo: "protocolo" | "dfd" | "item" = "protocolo"): string {
  if (formato === "despacho") {
    if (escopo !== "protocolo") {
      const d = p.dfds[0];
      if (!d) return "Sem pendências.";
      const faltas = escopo === "item" ? d.itens.map(linhaItem) : despachoDe(d);
      return [...linhasRelatorioDfd({ numero: d.numero, planejamento: d.planejamento, tipo: d.tipo, faltas }), "", "Respeitosamente"].join("\n");
    }
    return [
      ...linhasRelatorioProtocolo({
        numero: p.numero,
        idExterno: p.idExterno,
        interessado: p.interessado,
        assunto: p.assunto,
        capaMotivo: p.capa?.texto ?? null,
        dfds: p.dfds.map((d) => ({ numero: d.numero, planejamento: d.planejamento, tipo: d.tipo, faltas: despachoDe(d) })),
      }),
      "",
      "Respeitosamente",
    ].join("\n");
  }
  const c = contarProtocolo(p);
  const resumo = `${c.erros} erro(s) · ${c.atencoes} atenção(ões)`;
  const L: string[] = [];
  if (formato === "whatsapp") {
    const titulo = escopo === "protocolo" ? `*Pendências — Protocolo ${p.numero}*` : `*Pendências — ${p.dfds[0] ? tituloDfd(p.dfds[0]) : "DFD"}*`;
    L.push(titulo, resumo, "");
    if (p.capa) L.push(`*Capa:* ${p.capa.texto}`, "");
    for (const d of p.dfds) {
      if (escopo === "protocolo") L.push(`*${tituloDfd(d)}*`);
      for (const x of d.pendencias) L.push(`• ${x.texto}`);
      if (escopo !== "item") for (const x of d.resumoItens) L.push(`• ${x.texto}`);
      for (const it of d.itens) L.push(`  ◦ ${linhaItem(it)}`);
      L.push("");
    }
    return L.join("\n").trimEnd();
  }
  // lista simples hierárquica
  L.push(escopo === "protocolo" ? `Pendências do protocolo ${p.numero}${p.idExterno ? ` (Id ${p.idExterno})` : ""} — ${resumo}` : `Pendências — ${resumo}`);
  if (p.capa) L.push(`- Capa do processo: ${p.capa.texto}`);
  for (const d of p.dfds) {
    L.push(`- ${tituloDfd(d)}`);
    for (const x of d.pendencias) L.push(`  - [${x.onde}] ${x.texto}`);
    if (d.itens.length) {
      L.push("  - Itens (Seção 4):");
      for (const it of d.itens) L.push(`    - ${linhaItem(it)}`);
    }
  }
  return L.join("\n");
}

// ---- PDF (blocos do gerador de documento) ----

const ROTULO_STATUS: Record<StatusPendencia, string> = { erro: "Erro", atencao: "Atenção" };
const corDe = (p: { status: StatusPendencia; cor?: string }) => p.cor ?? STATUS_MENSAGEM_COR[p.status];

const COLUNAS_DFD: ColunaDoc[] = [
  { titulo: "Situação", peso: 1.1 },
  { titulo: "Onde", peso: 2.2 },
  { titulo: "Pendência", peso: 4 },
  { titulo: "Conteúdo atual", peso: 3.4 },
];
const COLUNAS_ITENS: ColunaDoc[] = [
  { titulo: "Item", peso: 0.7, alinhar: "right" },
  { titulo: "Código", peso: 1.5 },
  { titulo: "Descrição", peso: 4.2 },
  { titulo: "Unid.", peso: 1 },
  { titulo: "Qtd.", peso: 1, alinhar: "right" },
  { titulo: "Vlr. unit.", peso: 1.4, alinhar: "right" },
  { titulo: "Pendência", peso: 3.6 },
];

/**
 * O PDF das pendências — BLOCOS do `documento-pdf-core` (A4, nada cortado): resumo, a capa (valor × somatória) e, por DFD,
 * a tabela das pendências COM o conteúdo atual do componente e a tabela dos ITENS com pendência (a linha do item como está
 * no DFD; a célula que falta na cor do erro). Puro.
 */
export function blocosPendenciasPdf(p: ProtocoloPendente, escopo: "protocolo" | "dfd" | "item" = "protocolo"): { titulo: string; blocos: BlocoDoc[] } {
  const c = contarProtocolo(p);
  const itensAfetados = p.dfds.reduce((s, d) => s + d.itens.length, 0);
  const titulo =
    escopo === "protocolo" ? `Pendências do protocolo ${p.numero}` : `Pendências — ${p.dfds[0] ? tituloDfd(p.dfds[0]) : "DFD"}`;
  const blocos: BlocoDoc[] = [{ tipo: "titulo", texto: titulo }];
  const ident = [
    p.idExterno ? `Id ${p.idExterno}` : "",
    p.interessado ? `Interessado: ${p.interessado}` : "",
    p.assunto ? `Assunto: ${p.assunto}` : "",
  ].filter(Boolean);
  if (escopo === "protocolo" && ident.length) blocos.push({ tipo: "paragrafo", texto: ident.join(" · "), cor: "muted" });
  blocos.push({
    tipo: "destaques",
    itens: [
      { rotulo: "Erros", valor: num(c.erros), cor: "var(--danger)" },
      { rotulo: "Atenções", valor: num(c.atencoes), cor: "var(--warn)" },
      ...(escopo === "protocolo" ? [{ rotulo: "DFDs com pendência", valor: num(p.dfds.length) }] : []),
      { rotulo: "Itens com pendência", valor: num(itensAfetados) },
    ],
  });
  if (c.erros + c.atencoes === 0) {
    blocos.push({ tipo: "paragrafo", texto: "Nenhuma pendência encontrada." });
    return { titulo, blocos };
  }
  if (p.capa) {
    blocos.push({ tipo: "secao", texto: "Capa do processo" });
    blocos.push({ tipo: "nota", texto: p.capa.texto, cor: corDe(p.capa) });
    if (p.capa.contexto) blocos.push({ tipo: "paragrafo", texto: p.capa.contexto, cor: "muted" });
  }
  for (const d of p.dfds) {
    const cd = contarDfd(d);
    if (escopo === "protocolo") blocos.push({ tipo: "secao", texto: tituloDfd(d) });
    blocos.push({
      tipo: "subsecao",
      texto: escopo === "item" ? "Pendências do item" : "Pendências do DFD",
      detalhe: `${cd.erros} erro(s) · ${cd.atencoes} atenção(ões)`,
      corDetalhe: cd.erros ? "var(--danger)" : "var(--warn)",
    });
    const linhas: LinhaDoc[] = [...d.pendencias, ...(escopo === "item" ? [] : d.resumoItens)].map((x) => ({
      celulas: [ROTULO_STATUS[x.status], x.onde, x.texto, x.contexto ?? "—"],
      cores: [corDe(x), null, null, x.contexto === "(não preenchida)" ? corDe(x) : "@muted"],
      negritos: [true, true, false, false],
    }));
    if (linhas.length) blocos.push({ tipo: "tabela", colunas: COLUNAS_DFD, linhas });
    if (d.itens.length) {
      if (escopo !== "item") blocos.push({ tipo: "subsecao", texto: "Itens com pendência (Seção 4)", detalhe: `${num(d.itens.length)} item(ns)` });
      const tem = (it: ItemPendente, chave: string) => it.problemas.find((x) => x.chave === chave);
      blocos.push({
        tipo: "tabela",
        colunas: COLUNAS_ITENS,
        linhas: d.itens.map((it) => {
          const q = tem(it, "item.quantidade");
          const v = tem(it, "item.valorUnitario");
          const cat = it.problemas.find((x) => x.alvo.ancora === "catalogo" || x.alvo.ancora === "repetidos");
          return {
            celulas: [
              String(it.item ?? it.idx + 1),
              it.codigo ?? "—",
              cortar(it.descricao ?? "—", 300),
              it.unidade ?? "—",
              q ? "falta" : it.quantidade != null ? num(it.quantidade) : "—",
              v ? "falta" : brl(it.valorUnitario),
              it.problemas.map((x) => x.texto).join("; "),
            ],
            cores: [null, cat ? corDe(cat) : null, cat ? corDe(cat) : null, null, q ? corDe(q) : null, v ? corDe(v) : null, corDe(it.problemas[0])],
          };
        }),
      });
    }
  }
  return { titulo, blocos };
}
