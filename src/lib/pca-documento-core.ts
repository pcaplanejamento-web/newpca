import type { BlocoDoc, ColunaDoc, LinhaDoc } from "./documento-pdf-core.ts";
import { brl, dataHoraBR, dataIsoBrasilia, num } from "./format.ts";
import type { ItemRow } from "./queries.ts";
import { textoSimples } from "./texto-formatado.ts";

/**
 * DOCUMENTO OFICIAL DO PCA — núcleo PURO (sem banco/DOM, testado). Cada PCA tem a SUA configuração (o ADM controla:
 * ligado/desligado, capa, expediente, seções de texto com marcadores, dados automáticos, colunas dos itens, assinatura) e o
 * documento é montado no NAVEGADOR (milhares de páginas — o Worker não aguenta) com os dados que o SERVIDOR entrega junto
 * do registro da emissão (código + selo). Estrutura de referência (Lei 14.133/2021 art. 12 VII; Decreto 10.947/2022):
 * capa · expediente · seções (apresentação, base legal, objetivos, metodologia…) · resumo geral · resumos por
 * classificação, unidade e prioridade · cronograma · DFDs (sem protocolo e sem dados pessoais) · TODOS os itens pelo
 * sequencial do PCA · notas · fecho com local, data, assinatura e o código de verificação.
 */

// ---------------------------------------------------------------------------
// Configuração (por PCA)
// ---------------------------------------------------------------------------

export type SecaoDocumento = { id: string; titulo: string; texto: string; ativa: boolean };
export type Autoridade = { cargo: string; nome: string };

/** As colunas da tabela dos itens (o ADM escolhe quais e em que ordem; o sequencial e a descrição são fixos). */
export const COLUNAS_ITEM_DOC = {
  sequencial: { titulo: "Seq.", peso: 0.6, alinhar: "center", fixa: true },
  codigo: { titulo: "Código", peso: 1, alinhar: "center", fixa: false },
  descricao: { titulo: "Descrição", peso: 4.2, alinhar: "left", fixa: true },
  medida: { titulo: "Medida", peso: 0.9, alinhar: "center", fixa: false },
  quantidade: { titulo: "Quantidade", peso: 0.9, alinhar: "right", fixa: false },
  valorUnitario: { titulo: "Valor unitário", peso: 1.1, alinhar: "right", fixa: false },
  valorTotal: { titulo: "Valor total", peso: 1.2, alinhar: "right", fixa: false },
  classificacao: { titulo: "Classificação", peso: 1.3, alinhar: "left", fixa: false },
  unidade: { titulo: "Unidade", peso: 0.8, alinhar: "center", fixa: false },
  dfd: { titulo: "DFD (planejamento)", peso: 1.1, alinhar: "center", fixa: false },
  prioridade: { titulo: "Prioridade", peso: 0.8, alinhar: "center", fixa: false },
  previsao: { titulo: "Previsão", peso: 0.9, alinhar: "center", fixa: false },
} as const satisfies Record<string, { titulo: string; peso: number; alinhar: "left" | "center" | "right"; fixa: boolean }>;
export type ColunaItemDoc = keyof typeof COLUNAS_ITEM_DOC;
export const ORDEM_COLUNAS = Object.keys(COLUNAS_ITEM_DOC) as ColunaItemDoc[];

/** Os DADOS AUTOMÁTICOS (calculados na emissão) que o ADM liga/desliga — os ITENS são sempre impressos (todos). */
export const AUTOMATICOS = {
  resumo: "Resumo geral (valor, itens, DFDs, unidades)",
  classificacao: "Resumo por classificação",
  unidade: "Resumo por unidade requisitante",
  prioridade: "Resumo por prioridade",
  cronograma: "Cronograma mensal (previsão das contratações)",
  dfds: "Relação dos DFDs",
  justificativas: "Objeto e justificativa de cada DFD",
} as const;
export type Automatico = keyof typeof AUTOMATICOS;

export type ConfigDocumentoPca = {
  /** Desligado = o botão some da tela pública e a emissão é recusada. */
  ativo: boolean;
  titulo: string;
  subtitulo: string;
  /** O ente (a 1ª linha da capa): "Prefeitura Municipal de Rio Verde — Estado de Goiás". */
  ente: string;
  /** Cidade/UF do fecho: "Rio Verde – GO". */
  local: string;
  capa: boolean;
  timbre: boolean;
  /** Paisagem para a tabela dos itens (A4 deitado — cabem mais colunas). */
  itensPaisagem: boolean;
  expediente: Autoridade[];
  secoes: SecaoDocumento[];
  automaticos: Record<Automatico, boolean>;
  colunas: ColunaItemDoc[];
  notas: string;
  assinaturas: Autoridade[];
};

export const LIMITES_DOC = { texto: 20000, titulo: 160, campo: 200, secoes: 20, autoridades: 20, notas: 8000 } as const;

const novoId = (i: number) => `s${i + 1}`;

/** As seções-padrão (o modelo profissional; o ADM edita, desliga, acrescenta). Marcadores: {{ano}}, {{nome}}, {{ente}},
 * {{itens}}, {{dfds}}, {{unidades}}, {{valor}}, {{valorExtenso}}, {{data}}. */
export const SECOES_PADRAO: Omit<SecaoDocumento, "id">[] = [
  {
    titulo: "Apresentação",
    ativa: true,
    texto:
      "[[justificado]]O Plano de Contratações Anual (PCA) {{ano}} da {{ente}} reúne as contratações de bens, serviços, obras e soluções de tecnologia da informação que os órgãos e unidades pretendem realizar no exercício, a partir dos Documentos de Formalização de Demanda (DFDs) apresentados pelas áreas requisitantes.\n\n[[justificado]]Este documento consolida {{itens}} itens, oriundos de {{dfds}} DFDs de {{unidades}} unidades requisitantes, com valor total estimado de {{valor}} ({{valorExtenso}}).",
  },
  {
    titulo: "Fundamentação legal",
    ativa: true,
    texto:
      "[[justificado]]O PCA é elaborado nos termos do art. 12, inciso VII, da Lei nº 14.133, de 1º de abril de 2021, que dispõe que os órgãos e entidades poderão elaborar plano de contratações anual com o objetivo de racionalizar as contratações, garantir o alinhamento com o planejamento estratégico e subsidiar a elaboração das leis orçamentárias, observando ainda o art. 18 (fase preparatória) e o art. 174, § 2º, inciso I (divulgação no Portal Nacional de Contratações Públicas).",
  },
  {
    titulo: "Objetivos",
    ativa: true,
    texto:
      "- Racionalizar as contratações, evitando o fracionamento de despesas e permitindo ganhos de escala;\n- Garantir o alinhamento das contratações com o planejamento estratégico da Administração;\n- Subsidiar a elaboração da Lei Orçamentária Anual;\n- Dar transparência e previsibilidade às contratações do exercício.",
  },
  {
    titulo: "Metodologia de elaboração",
    ativa: true,
    texto:
      "[[justificado]]As demandas foram formalizadas pelas áreas requisitantes por meio de DFDs, conferidas quanto à completude, à assinatura do responsável, ao valor estimado e à previsão de entrega, e consolidadas por número de planejamento. Cada item recebeu um número sequencial único no PCA, que o identifica em toda a execução.",
  },
  {
    titulo: "Disposições finais",
    ativa: true,
    texto:
      "[[justificado]]O PCA poderá ser revisado e alterado no curso do exercício, por inclusão, exclusão ou redimensionamento de itens, mediante justificativa, e a versão atualizada será divulgada. A inclusão de um item no PCA não obriga a Administração a contratá-lo.",
  },
];

export function configPadrao(): ConfigDocumentoPca {
  return {
    ativo: false,
    titulo: "PLANO DE CONTRATAÇÕES ANUAL",
    subtitulo: "Exercício {{ano}}",
    ente: "Prefeitura Municipal de Rio Verde — Estado de Goiás",
    local: "Rio Verde – GO",
    capa: true,
    timbre: true,
    itensPaisagem: true,
    expediente: [],
    secoes: SECOES_PADRAO.map((s, i) => ({ ...s, id: novoId(i) })),
    automaticos: { resumo: true, classificacao: true, unidade: true, prioridade: true, cronograma: true, dfds: true, justificativas: false },
    colunas: ["sequencial", "codigo", "descricao", "medida", "quantidade", "valorUnitario", "valorTotal", "classificacao", "unidade", "dfd", "prioridade", "previsao"],
    notas: "",
    assinaturas: [],
  };
}

const texto = (v: unknown, max: number, padrao = ""): string => (typeof v === "string" ? v.replace(/\r\n?/g, "\n").trim().slice(0, max) : padrao);
const bool = (v: unknown, padrao: boolean) => (typeof v === "boolean" ? v : padrao);
const autoridades = (v: unknown): Autoridade[] =>
  Array.isArray(v)
    ? v
        .map((a) => ({ cargo: texto((a as Autoridade)?.cargo, LIMITES_DOC.campo), nome: texto((a as Autoridade)?.nome, LIMITES_DOC.campo) }))
        .filter((a) => a.cargo || a.nome)
        .slice(0, LIMITES_DOC.autoridades)
    : [];

/** Qualquer JSON → a configuração válida (o que falta vem do padrão; nada fora dos limites; ids únicos). */
export function lerConfigDocumento(v: unknown): ConfigDocumentoPca {
  const p = configPadrao();
  if (!v || typeof v !== "object") return p;
  const o = v as Record<string, unknown>;
  const ids = new Set<string>();
  const secoes = Array.isArray(o.secoes)
    ? (o.secoes as unknown[])
        .map((s, i) => {
          const x = (s ?? {}) as Record<string, unknown>;
          let id = typeof x.id === "string" && /^[a-z0-9-]{1,40}$/i.test(x.id) ? x.id : novoId(i);
          while (ids.has(id)) id = `${id}x`;
          ids.add(id);
          return { id, titulo: texto(x.titulo, LIMITES_DOC.titulo), texto: texto(x.texto, LIMITES_DOC.texto), ativa: bool(x.ativa, true) };
        })
        .filter((s) => s.titulo || s.texto)
        .slice(0, LIMITES_DOC.secoes)
    : p.secoes;
  const auto = (o.automaticos ?? {}) as Record<string, unknown>;
  const colunasPedidas = Array.isArray(o.colunas) ? (o.colunas as unknown[]).filter((c): c is ColunaItemDoc => typeof c === "string" && c in COLUNAS_ITEM_DOC) : p.colunas;
  // Sem repetir, e as FIXAS sempre (o sequencial e a descrição identificam o item).
  const colunas = [...new Set<ColunaItemDoc>(colunasPedidas)];
  for (const f of ["descricao", "sequencial"] as const) if (!colunas.includes(f)) colunas.unshift(f);
  return {
    ativo: bool(o.ativo, p.ativo),
    titulo: texto(o.titulo, LIMITES_DOC.titulo) || p.titulo,
    subtitulo: texto(o.subtitulo, LIMITES_DOC.titulo, p.subtitulo),
    ente: texto(o.ente, LIMITES_DOC.campo, p.ente),
    local: texto(o.local, LIMITES_DOC.campo, p.local),
    capa: bool(o.capa, p.capa),
    timbre: bool(o.timbre, p.timbre),
    itensPaisagem: bool(o.itensPaisagem, p.itensPaisagem),
    expediente: "expediente" in o ? autoridades(o.expediente) : p.expediente,
    secoes,
    automaticos: Object.fromEntries((Object.keys(AUTOMATICOS) as Automatico[]).map((k) => [k, bool(auto[k], p.automaticos[k])])) as Record<Automatico, boolean>,
    colunas,
    notas: texto(o.notas, LIMITES_DOC.notas),
    assinaturas: "assinaturas" in o ? autoridades(o.assinaturas) : p.assinaturas,
  };
}

/** A configuração canônica em texto (a mesma configuração = o mesmo texto — o hash da emissão). */
export const textoConfig = (c: ConfigDocumentoPca) => JSON.stringify(lerConfigDocumento(c));

// ---------------------------------------------------------------------------
// Dados
// ---------------------------------------------------------------------------

/** Um DFD no documento — SEM protocolo e SEM dados pessoais (objeto/justificativa já mascarados no servidor). */
export type DfdDocumento = {
  numero: string;
  planejamento: string | null;
  tipo: string | null;
  sigla: string | null;
  objeto: string | null;
  justificativa: string | null;
  prioridade: string | null;
  previsao: string | null;
  itens: number;
  valor: number;
};

export type DadosDocumento = {
  pca: { id: number; nome: string; ano: number | null };
  itens: ItemRow[];
  dfds: DfdDocumento[];
  /** O nome de cada unidade pela sigla. */
  unidades: Record<string, string>;
};

/** O registro da emissão (vem do servidor). */
export type EmissaoDocumento = { codigo: string; emitidoEm: string; url: string; selo: string };

/** Os itens SEMPRE pelo sequencial do PCA (sem sequencial, no fim — pelo id, estável). */
export function itensEmOrdem(itens: readonly ItemRow[]): ItemRow[] {
  return [...itens].sort((a, b) => (a.sequencial ?? Number.POSITIVE_INFINITY) - (b.sequencial ?? Number.POSITIVE_INFINITY) || a.id - b.id);
}

/** A classificação canônica (a mesma escrita em caixas/espaços diferentes vira UMA — o documento antigo repetia). */
export function chaveClassificacao(s: string | null | undefined): string {
  const t = (s ?? "").normalize("NFC").replace(/\s+/g, " ").trim().toLocaleUpperCase("pt-BR");
  return t || "NÃO CLASSIFICADO";
}

const MESES_CURTOS = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

/** A previsão do item em texto ("MAR/2026" · "ANUAL" · "SEMESTRAL" · "—"). */
export function previsaoDoItem(i: Partial<Pick<ItemRow, "mes" | "ano" | "anual" | "periodo" | "dataDesejada">>): string {
  if (i.mes && i.ano) return `${MESES_CURTOS[i.mes - 1]}/${i.ano}`;
  if (i.anual) return (i.periodo ?? "ANUAL").toUpperCase();
  const m = i.dataDesejada?.match(/^(\d{4})-(\d{2})/);
  return m ? `${MESES_CURTOS[Number(m[2]) - 1]}/${m[1]}` : "—";
}

export type Totais = { itens: number; valor: number; dfds: number; unidades: number; classificacoes: number };

/** Os totais do documento (a MESMA conta no servidor — o registro — e no PDF). */
export function totaisDocumento(d: Pick<DadosDocumento, "itens" | "dfds">): Totais {
  let valor = 0;
  const unidades = new Set<string>();
  const classes = new Set<string>();
  for (const i of d.itens) {
    valor += Number(i.valorTotal ?? 0);
    if (i.codigo) unidades.add(i.codigo);
    classes.add(chaveClassificacao(i.classificacao));
  }
  return { itens: d.itens.length, valor: Math.round(valor * 1e4) / 1e4, dfds: d.dfds.length, unidades: unidades.size, classificacoes: classes.size };
}

// ---------------------------------------------------------------------------
// Valor por extenso
// ---------------------------------------------------------------------------

const UNIDADES_EXT = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DEZENAS_EXT = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CENTENAS_EXT = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

function ate999(n: number): string {
  if (n === 100) return "cem";
  const c = Math.floor(n / 100);
  const r = n % 100;
  const partes: string[] = [];
  if (c) partes.push(CENTENAS_EXT[c]);
  if (r) partes.push(r < 20 ? UNIDADES_EXT[r] : [DEZENAS_EXT[Math.floor(r / 10)], UNIDADES_EXT[r % 10]].filter(Boolean).join(" e "));
  return partes.join(" e ");
}

const ESCALAS: [string, string][] = [
  ["", ""],
  ["mil", "mil"],
  ["milhão", "milhões"],
  ["bilhão", "bilhões"],
  ["trilhão", "trilhões"],
];

/** Um inteiro por extenso (até trilhões): 1.250.300 = "um milhão, duzentos e cinquenta mil e trezentos". */
export function inteiroPorExtenso(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return "zero";
  const grupos: number[] = [];
  for (let x = n; x > 0; x = Math.floor(x / 1000)) grupos.push(x % 1000);
  const partes: { txt: string; g: number }[] = [];
  for (let i = grupos.length - 1; i >= 0; i--) {
    const g = grupos[i];
    if (!g) continue;
    const [sing, plur] = ESCALAS[i] ?? ["", ""];
    const base = i === 1 && g === 1 ? "" : ate999(g);
    const escala = i === 0 ? "" : g === 1 ? sing : plur;
    partes.push({ txt: [base, escala].filter(Boolean).join(" "), g });
  }
  // O último grupo: "e" quando é < 100 ou centena redonda ("mil e trezentos"), senão só o espaço ("mil duzentos e…");
  // os demais, a vírgula ("um milhão, duzentos mil").
  return partes
    .map((p, k) => {
      if (k === 0) return p.txt;
      if (k < partes.length - 1) return `, ${p.txt}`;
      return `${p.g < 100 || p.g % 100 === 0 ? " e " : " "}${p.txt}`;
    })
    .join("");
}

/** Um valor em reais por extenso: 1.234,56 = "mil duzentos e trinta e quatro reais e cinquenta e seis centavos". */
export function valorPorExtenso(valor: number): string {
  const centavosTotais = Math.round(Math.abs(Number(valor) || 0) * 100);
  const reais = Math.floor(centavosTotais / 100);
  const centavos = centavosTotais % 100;
  const parteReais = reais ? `${inteiroPorExtenso(reais)}${reais % 1_000_000 === 0 && reais >= 1_000_000 ? " de" : ""} ${reais === 1 ? "real" : "reais"}` : "";
  const parteCent = centavos ? `${inteiroPorExtenso(centavos)} ${centavos === 1 ? "centavo" : "centavos"}` : "";
  return [parteReais, parteCent].filter(Boolean).join(" e ") || "zero real";
}

// ---------------------------------------------------------------------------
// Marcadores dos textos
// ---------------------------------------------------------------------------

export const MARCADORES = {
  ano: "O ano do PCA",
  nome: "O nome do PCA",
  ente: "O ente (a 1ª linha da capa)",
  itens: "Quantos itens",
  dfds: "Quantos DFDs",
  unidades: "Quantas unidades requisitantes",
  valor: "O valor total (R$)",
  valorExtenso: "O valor total por extenso",
  data: "A data da emissão por extenso",
} as const;
export type Marcador = keyof typeof MARCADORES;

export function dataPorExtensoBR(ts: string): string {
  const m = dataIsoBrasilia(ts).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${Number(m[3])} de ${MESES[Number(m[2]) - 1].toLowerCase()} de ${m[1]}` : ts;
}

export function valoresMarcadores(d: Pick<DadosDocumento, "pca">, t: Totais, cfg: Pick<ConfigDocumentoPca, "ente">, emitidoEm: string): Record<Marcador, string> {
  return {
    ano: d.pca.ano != null ? String(d.pca.ano) : "",
    nome: d.pca.nome,
    ente: cfg.ente,
    itens: num(t.itens),
    dfds: num(t.dfds),
    unidades: num(t.unidades),
    valor: brl(t.valor),
    valorExtenso: valorPorExtenso(t.valor),
    data: dataPorExtensoBR(emitidoEm),
  };
}

/** Troca os `{{marcador}}` conhecidos; o desconhecido fica como está (o ADM vê o erro na prévia). */
export function substituirMarcadores(texto: string, v: Record<Marcador, string>): string {
  return texto.replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (todo, k: string) => (k in v ? v[k as Marcador] : todo));
}

/** Os marcadores DESCONHECIDOS de um texto (o aviso do editor). */
export function marcadoresDesconhecidos(texto: string): string[] {
  return [...new Set([...texto.matchAll(/\{\{\s*([a-zA-Z]+)\s*\}\}/g)].map((m) => m[1]).filter((k) => !(k in MARCADORES)))];
}

/** O texto formatado (o `EditorRico`) → blocos do PDF: parágrafos justificados, listas e subtítulos. */
export function blocosDoTexto(t: string): BlocoDoc[] {
  const out: BlocoDoc[] = [];
  for (const par of textoSimples(t).split(/\n{2,}/)) {
    const linhas = par.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!linhas.length) continue;
    if (linhas.every((l) => /^(•|\d+\.)\s/.test(l))) out.push({ tipo: "lista", itens: linhas.map((l) => l.replace(/^•\s/, "")) });
    else if (linhas.length === 1 && linhas[0] === "—") continue;
    else out.push({ tipo: "paragrafo", texto: linhas.join(" "), alinhar: "justificado" });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Blocos do documento
// ---------------------------------------------------------------------------

const pct = (v: number, total: number) => (total > 0 ? `${((v / total) * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : "—");
const ou = (v: string | null | undefined) => v?.trim() || "—";

type Agregado = { chave: string; itens: number; valor: number; dfds: Set<string> };
function agrupar(itens: readonly ItemRow[], chave: (i: ItemRow) => string): Agregado[] {
  const m = new Map<string, Agregado>();
  for (const i of itens) {
    const k = chave(i);
    const a = m.get(k) ?? { chave: k, itens: 0, valor: 0, dfds: new Set<string>() };
    a.itens++;
    a.valor += Number(i.valorTotal ?? 0);
    if (i.dfdNumero) a.dfds.add(i.dfdNumero);
    m.set(k, a);
  }
  return [...m.values()].sort((a, b) => b.valor - a.valor || a.chave.localeCompare(b.chave, "pt-BR"));
}

const COLS_RESUMO = (rotulo: string, peso = 3): ColunaDoc[] => [
  { titulo: rotulo, peso },
  { titulo: "Itens", peso: 0.8, alinhar: "right" },
  { titulo: "Valor estimado", peso: 1.4, alinhar: "right" },
  { titulo: "Participação", peso: 1, alinhar: "right" },
];
const linhaTotal = (celulas: string[]): LinhaDoc => ({ celulas, destaque: true, negritos: celulas.map(() => true) });

/** A célula de cada coluna dos itens. */
function celulaItem(i: ItemRow, c: ColunaItemDoc, planejamento: Map<string, string | null>): string {
  switch (c) {
    case "sequencial":
      return i.sequencial != null ? String(i.sequencial) : "—";
    case "codigo":
      return ou(i.idProduto);
    case "descricao":
      return ou(i.nomeProduto);
    case "medida":
      return ou(i.unidadeMedida);
    case "quantidade":
      return i.quantidade == null ? "—" : num(i.quantidade);
    case "valorUnitario":
      return i.valorReferencia == null ? "—" : brl(i.valorReferencia);
    case "valorTotal":
      return brl(i.valorTotal);
    case "classificacao":
      return chaveClassificacao(i.classificacao);
    case "unidade":
      return ou(i.codigo);
    case "dfd": {
      if (!i.dfdNumero) return "—";
      const p = planejamento.get(i.dfdNumero);
      return p ? `${i.dfdNumero} (${p})` : i.dfdNumero;
    }
    case "prioridade":
      return ou(i.prioridade);
    case "previsao":
      return previsaoDoItem(i);
  }
}

/**
 * Os BLOCOS do documento (A4; a tabela dos itens em página deitada quando configurado). `emissao` ausente = a PRÉVIA do
 * ADM (marcada "PRÉVIA", sem código). Os itens são TODOS, pelo sequencial; os DFDs pelo nº.
 */
export function blocosDocumentoPca(d: DadosDocumento, cfg: ConfigDocumentoPca, emissao: EmissaoDocumento | null, agora: string): BlocoDoc[] {
  const t = totaisDocumento(d);
  const quando = emissao?.emitidoEm ?? agora;
  const v = valoresMarcadores(d, t, cfg, quando);
  const sub = (s: string) => substituirMarcadores(s, v);
  const b: BlocoDoc[] = [];
  const itens = itensEmOrdem(d.itens);
  const planejamento = new Map(d.dfds.map((x) => [x.numero, x.planejamento]));

  if (cfg.capa) {
    b.push({
      tipo: "capa",
      linhas: [
        ...(cfg.ente ? [{ texto: sub(cfg.ente).toUpperCase(), tam: 12, negrito: true }] : []),
        { texto: sub(cfg.titulo).toUpperCase(), tam: 24, negrito: true, espaco: 70 },
        ...(cfg.subtitulo ? [{ texto: sub(cfg.subtitulo), tam: 15, espaco: 10 }] : []),
        { texto: d.pca.nome, tam: 12, cor: "@muted", espaco: 18 },
        ...(emissao ? [] : [{ texto: "PRÉVIA — SEM VALIDADE", tam: 12, negrito: true, espaco: 24 }]),
        { texto: `${cfg.local ? `${sub(cfg.local)} · ` : ""}${dataPorExtensoBR(quando)}`, tam: 11, espaco: 90 },
      ],
    });
  } else if (!emissao) {
    b.push({ tipo: "nota", texto: "PRÉVIA — este documento não foi emitido e não tem validade.", cor: "#4a4a4a" });
  }

  if (!cfg.capa) {
    b.push({ tipo: "titulo", texto: sub(cfg.titulo).toUpperCase(), alinhar: "centro" });
    if (cfg.subtitulo) b.push({ tipo: "paragrafo", texto: sub(cfg.subtitulo), alinhar: "centro", negrito: true });
  }

  if (cfg.expediente.length) {
    b.push({ tipo: "secao", texto: "Expediente" });
    b.push({
      tipo: "tabela",
      colunas: [
        { titulo: "Cargo", peso: 2 },
        { titulo: "Nome", peso: 2.6 },
      ],
      linhas: cfg.expediente.map((a) => ({ celulas: [ou(a.cargo), ou(a.nome)], negritos: [true, false] })),
    });
  }

  let n = 0;
  const secao = (titulo: string) => b.push({ tipo: "secao", texto: `${++n}. ${titulo}` });
  for (const s of cfg.secoes) {
    if (!s.ativa) continue;
    secao(sub(s.titulo) || "Seção");
    b.push(...blocosDoTexto(sub(s.texto)));
  }

  const a = cfg.automaticos;
  if (a.resumo) {
    secao("Resumo geral");
    b.push({
      tipo: "destaques",
      itens: [
        { rotulo: "Valor total estimado", valor: brl(t.valor), detalhe: valorPorExtenso(t.valor) },
        { rotulo: "Itens", valor: num(t.itens) },
        { rotulo: "DFDs", valor: num(t.dfds) },
        { rotulo: "Unidades requisitantes", valor: num(t.unidades) },
      ],
    });
  }
  if (a.classificacao) {
    secao("Resumo por classificação");
    const g = agrupar(itens, (i) => chaveClassificacao(i.classificacao));
    b.push({
      tipo: "tabela",
      colunas: COLS_RESUMO("Classificação"),
      linhas: [...g.map((x) => ({ celulas: [x.chave, num(x.itens), brl(x.valor), pct(x.valor, t.valor)] })), linhaTotal(["TOTAL", num(t.itens), brl(t.valor), pct(t.valor, t.valor)])],
    });
  }
  if (a.unidade) {
    secao("Resumo por unidade requisitante");
    const g = agrupar(itens, (i) => i.codigo ?? "—");
    b.push({
      tipo: "tabela",
      colunas: [
        { titulo: "Unidade", peso: 0.9, alinhar: "center" },
        { titulo: "Nome", peso: 2.6 },
        ...(t.dfds ? [{ titulo: "DFDs", peso: 0.6, alinhar: "right" as const }] : []),
        ...COLS_RESUMO("").slice(1),
      ],
      linhas: [
        ...g.map((x) => ({ celulas: [x.chave, ou(d.unidades[x.chave]), ...(t.dfds ? [num(x.dfds.size)] : []), num(x.itens), brl(x.valor), pct(x.valor, t.valor)] })),
        linhaTotal(["TOTAL", "", ...(t.dfds ? [num(t.dfds)] : []), num(t.itens), brl(t.valor), pct(t.valor, t.valor)]),
      ],
    });
  }
  if (a.prioridade && itens.some((i) => i.prioridade)) {
    secao("Resumo por prioridade");
    const ordem = ["ALTA", "MÉDIA", "BAIXA"];
    const g = agrupar(itens, (i) => (i.prioridade ? i.prioridade.toUpperCase() : "SEM PRIORIDADE")).sort((x, y) => {
      const ix = ordem.indexOf(x.chave);
      const iy = ordem.indexOf(y.chave);
      return (ix < 0 ? 9 : ix) - (iy < 0 ? 9 : iy);
    });
    b.push({
      tipo: "tabela",
      colunas: COLS_RESUMO("Prioridade", 2),
      linhas: [...g.map((x) => ({ celulas: [x.chave, num(x.itens), brl(x.valor), pct(x.valor, t.valor)] })), linhaTotal(["TOTAL", num(t.itens), brl(t.valor), pct(t.valor, t.valor)])],
    });
  }
  if (a.cronograma) {
    secao("Cronograma das contratações");
    b.push({
      tipo: "paragrafo",
      texto: "Previsão de entrega informada nos DFDs: os itens com mês definido aparecem no mês; os de previsão genérica (anual, semestral, quadrimestral, trimestral) aparecem à parte.",
      cor: "muted",
    });
    const linhas: LinhaDoc[] = [];
    for (let m = 1; m <= 12; m++) {
      const doMes = itens.filter((i) => i.mes === m);
      linhas.push({ celulas: [MESES[m - 1], num(doMes.length), brl(doMes.reduce((s, i) => s + Number(i.valorTotal ?? 0), 0)), pct(doMes.reduce((s, i) => s + Number(i.valorTotal ?? 0), 0), t.valor)] });
    }
    const genericos = agrupar(
      itens.filter((i) => !i.mes),
      (i) => (i.anual ? `Genérica — ${(i.periodo ?? "ANUAL").toUpperCase()}` : "Sem previsão"),
    );
    for (const x of genericos) linhas.push({ celulas: [x.chave, num(x.itens), brl(x.valor), pct(x.valor, t.valor)] });
    linhas.push(linhaTotal(["TOTAL", num(t.itens), brl(t.valor), pct(t.valor, t.valor)]));
    b.push({ tipo: "tabela", colunas: COLS_RESUMO("Mês / previsão", 2), linhas });
  }
  if (a.dfds && d.dfds.length) {
    secao("Relação dos Documentos de Formalização de Demanda (DFDs)");
    const dfds = [...d.dfds].sort((x, y) => x.numero.localeCompare(y.numero, "pt-BR", { numeric: true }));
    b.push({
      tipo: "tabela",
      colunas: [
        { titulo: "DFD", peso: 0.7, alinhar: "center" },
        { titulo: "Planejamento", peso: 0.9, alinhar: "center" },
        { titulo: "Tipo", peso: 0.6, alinhar: "center" },
        { titulo: "Unidade", peso: 0.8, alinhar: "center" },
        { titulo: "Prioridade", peso: 0.8, alinhar: "center" },
        { titulo: "Previsão", peso: 0.9, alinhar: "center" },
        { titulo: "Itens", peso: 0.6, alinhar: "right" },
        { titulo: "Valor", peso: 1.2, alinhar: "right" },
      ],
      linhas: [
        ...dfds.map((x) => ({ celulas: [x.numero, ou(x.planejamento), ou(x.tipo), ou(x.sigla), ou(x.prioridade), ou(x.previsao), num(x.itens), brl(x.valor)] })),
        linhaTotal(["TOTAL", "", "", "", "", "", num(dfds.reduce((s, x) => s + x.itens, 0)), brl(dfds.reduce((s, x) => s + x.valor, 0))]),
      ],
    });
    if (a.justificativas) {
      secao("Objeto e justificativa das demandas");
      for (const x of dfds) {
        b.push({ tipo: "subsecao", texto: `DFD ${x.numero}${x.planejamento ? ` (Planej. ${x.planejamento})` : ""}`, detalhe: [x.sigla, brl(x.valor)].filter(Boolean).join(" · ") });
        b.push({ tipo: "paragrafo", texto: `Objeto: ${ou(x.objeto)}`, alinhar: "justificado" });
        if (x.justificativa) b.push({ tipo: "paragrafo", texto: `Justificativa: ${x.justificativa}`, alinhar: "justificado" });
      }
    }
  }

  // OS ITENS — todos, sem exceção, pelo sequencial.
  if (cfg.itensPaisagem) b.push({ tipo: "pagina", paisagem: true });
  secao("Relação dos itens do Plano");
  b.push({ tipo: "paragrafo", texto: `${num(t.itens)} itens, identificados pelo número sequencial do PCA, com valor total estimado de ${brl(t.valor)}.`, cor: "muted" });
  const cols = cfg.colunas;
  const colTotal = cols.indexOf("valorTotal");
  b.push({
    tipo: "tabela",
    colunas: cols.map((c) => ({ titulo: COLUNAS_ITEM_DOC[c].titulo, peso: COLUNAS_ITEM_DOC[c].peso, alinhar: COLUNAS_ITEM_DOC[c].alinhar })),
    linhas: [
      ...itens.map((i) => ({ celulas: cols.map((c) => celulaItem(i, c, planejamento)) })),
      linhaTotal(cols.map((c, k) => (k === 0 ? "TOTAL" : k === colTotal ? brl(t.valor) : c === "descricao" ? `${num(t.itens)} itens` : ""))),
    ],
    vazio: "Nenhum item no PCA.",
  });
  if (cfg.itensPaisagem) b.push({ tipo: "pagina" });

  if (cfg.notas.trim()) {
    secao("Notas explicativas");
    b.push(...blocosDoTexto(sub(cfg.notas)));
  }

  // FECHO: local e data, assinaturas e o registro da emissão.
  b.push({ tipo: "paragrafo", texto: `${cfg.local ? `${sub(cfg.local)}, ` : ""}${dataPorExtensoBR(quando)}.`, alinhar: "centro" });
  for (const s of cfg.assinaturas) {
    b.push({ tipo: "paragrafo", texto: "_______________________________________", alinhar: "centro" });
    b.push({ tipo: "paragrafo", texto: ou(s.nome), alinhar: "centro", negrito: true });
    if (s.cargo) b.push({ tipo: "paragrafo", texto: s.cargo, alinhar: "centro", cor: "muted" });
  }
  if (emissao)
    b.push({
      tipo: "quadro",
      titulo: "Registro da emissão",
      itens: [
        { rotulo: "Emitido em", valor: `${dataHoraBR(emissao.emitidoEm)} (horário de Brasília)` },
        { rotulo: "Itens · valor", valor: `${num(t.itens)} · ${brl(t.valor)}` },
        { rotulo: "Código de verificação", valor: emissao.codigo },
        { rotulo: "Confira em", valor: emissao.url },
        { rotulo: "Selo", valor: emissao.selo },
      ],
      nota: "Documento gerado a partir dos dados publicados do PCA. A autenticidade e os números da emissão podem ser conferidos no endereço acima.",
      cor: "#4a4a4a",
    });
  return b;
}

/** O carimbo de cada página (o código e a verificação). */
export function carimboDocumento(d: Pick<DadosDocumento, "pca">, emissao: EmissaoDocumento | null) {
  return {
    titulo: `${emissao ? "" : "PRÉVIA · "}${d.pca.nome} · página {pagina} de {total}`,
    linhas: emissao ? [`Emitido em ${dataHoraBR(emissao.emitidoEm)} (Brasília) · código ${emissao.codigo}`, `Confira em ${emissao.url}`] : ["Prévia do documento — sem validade"],
    cor: "#4a4a4a",
  };
}

/** O nome do arquivo: "PCA 2026 - Plano de Contratações Anual.pdf". */
export function nomeArquivoDocumento(d: Pick<DadosDocumento, "pca">): string {
  return `${d.pca.nome.replace(/[\\/:*?"<>|]+/g, "-").trim() || "PCA"} - Plano de Contratações Anual.pdf`;
}

/** O selo da emissão (o servidor grava; a verificação refaz e compara). */
export const textoSelo = (e: { codigo: string; pcaId: number; emitidoEm: string; itens: number; valor: number; dfds: number; dadosHash: string; configHash: string }) =>
  [e.codigo, e.pcaId, e.emitidoEm, e.itens, e.valor.toFixed(4), e.dfds, e.dadosHash, e.configHash].join("|");

/** O endereço da verificação pública de uma emissão. */
export const urlVerificacaoDocumento = (origem: string, codigo: string) => `${origem}/pca/documento/verificar/${codigo}`;
