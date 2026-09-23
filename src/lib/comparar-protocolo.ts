import { SECOES_OBRIGATORIAS, setTextoSecao, situacaoSecao, textoSecao } from "./dfd-tratamento.ts";
import { brl, num } from "./format.ts";
import { type Assinatura, type DfdSecao, listaRefs, norm, SEPARADOR_REFS, tipoCurtoDfd } from "./parse-dfd-comum.ts";

/**
 * REENVIO de um protocolo (sobrescrever com o MESMO PDF, corrigido) — núcleo PURO/testável da
 * COMPARAÇÃO entre o protocolo GRAVADO e o PDF reenviado: identidade (mesmo nº e Id), diferenças da
 * capa, situação de cada DFD (novo / alterado / igual), diferenças por campo, seção, assinatura e ITEM
 * (novo / removido / alterado, campo a campo) e o relatório copiável. Sem `getDb`/JSX.
 */

/** Uma diferença de campo: rótulo + valor gravado → valor novo (textos já formatados p/ exibir). */
export type DiffCampo = { campo: string; rotulo: string; antes: string; depois: string };

/** Texto normalizado para COMPARAR (espaços/quebras colapsados; vazio = ""). */
const txt = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
/** Texto para EXIBIR (vazio = "—"). */
const ver = (v: unknown) => txt(v) || "—";
const mesmoNum = (a: number | null | undefined, b: number | null | undefined, tol: number) =>
  (a == null && b == null) || (a != null && b != null && Math.abs(a - b) < tol);
const moeda = (v: number | null | undefined) => (v == null ? "—" : brl(v));
const qtd = (v: number | null | undefined) => (v == null ? "—" : num(v));
/** Nº de processo comparável (sem espaços). */
const chaveNumero = (v: string | null | undefined) => txt(v).replace(/\s+/g, "");

/**
 * O PDF reenviado é o MESMO protocolo? Exige o MESMO nº de processo e, quando os dois têm, o MESMO Id.
 * Devolve `null` (ok) ou o motivo da recusa.
 */
export function identidadeReenvio(
  gravado: { numero: string; idExterno: string | null },
  pdf: { numero: string | null; idExterno: string | null },
): string | null {
  if (!chaveNumero(pdf.numero)) return "A capa do PDF não traz o número do processo — não dá para confirmar que é o mesmo protocolo.";
  if (chaveNumero(pdf.numero) !== chaveNumero(gravado.numero))
    return `O PDF é do protocolo ${txt(pdf.numero)}, não do ${txt(gravado.numero)} — o reenvio só aceita o MESMO protocolo.`;
  if (txt(gravado.idExterno) && txt(pdf.idExterno) && txt(gravado.idExterno) !== txt(pdf.idExterno))
    return `O Id do PDF (${txt(pdf.idExterno)}) é diferente do Id gravado (${txt(gravado.idExterno)}) — o reenvio só aceita o MESMO protocolo.`;
  return null;
}

// ---- Capa ----

export type CapaComparavel = {
  data: string | null;
  interessado: string | null;
  documento: string | null;
  assunto: string | null;
  observacao: string | null;
  valorCapa: number | null;
  localReparticao: string | null;
  anoPca: number | null;
  reparticaoId: number | null;
};

/** Diferenças da CAPA (gravada → PDF/edição). `rotuloUnidade` traduz o id da unidade (sigla). */
export function compararCapa(g: CapaComparavel, p: CapaComparavel, rotuloUnidade: (id: number | null) => string = (id) => (id == null ? "—" : `#${id}`)): DiffCampo[] {
  const out: DiffCampo[] = [];
  const texto = (campo: keyof CapaComparavel, rotulo: string) => {
    if (txt(g[campo]) !== txt(p[campo])) out.push({ campo, rotulo, antes: ver(g[campo]), depois: ver(p[campo]) });
  };
  texto("data", "Data");
  texto("interessado", "Interessado");
  texto("documento", "CPF/CNPJ");
  texto("assunto", "Assunto");
  texto("observacao", "Observação");
  if (!mesmoNum(g.valorCapa, p.valorCapa, 0.005)) out.push({ campo: "valorCapa", rotulo: "Valor da capa", antes: moeda(g.valorCapa), depois: moeda(p.valorCapa) });
  texto("localReparticao", "Local");
  if (g.anoPca !== p.anoPca) out.push({ campo: "anoPca", rotulo: "PCA (ano)", antes: ver(g.anoPca), depois: ver(p.anoPca) });
  if (g.reparticaoId !== p.reparticaoId) out.push({ campo: "reparticaoId", rotulo: "Unidade", antes: rotuloUnidade(g.reparticaoId), depois: rotuloUnidade(p.reparticaoId) });
  return out;
}

// ---- DFD ----

export type ItemComparavel = {
  item: number | null;
  codigo: string | null;
  descricao: string | null;
  unidade: string | null;
  quantidade: number | null;
  valorUnitario: number | null;
  valorTotal: number | null;
};
export type DfdComparavel = {
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
  numeroContrato: string | null;
  numeroAta: string | null;
  numeroLicitacao: string | null;
  anoPca: number | null;
  reparticaoId: number | null;
  valorTotal: number | null;
  secoes: { titulo: string; texto: string }[];
  assinaturas: AssinaturaComparavel[];
  itens: ItemComparavel[];
};
/** O que conta numa assinatura: assinante/data, formato, código verificador e a validação pela equipe. */
export type AssinaturaComparavel = {
  nome: string;
  data?: string | null;
  fonte?: string;
  codigo?: string;
  validacao?: { por?: string; responsavel?: string } | null;
};

export type DiffItemDfd = {
  tipo: "novo" | "removido" | "alterado";
  item: number | null;
  codigo: string | null;
  descricao: string | null;
  campos: DiffCampo[];
};
export type SituacaoComparacao = "novo" | "alterado" | "igual";
export type ComparacaoDfd = {
  situacao: SituacaoComparacao;
  /** Cabeçalho, unidade, ano do PCA e valor total. */
  campos: DiffCampo[];
  /** Seções (texto) que mudaram — `rotulo` = título da seção. */
  secoes: DiffCampo[];
  /** Assinaturas (lista de assinantes) — `null` = iguais. */
  assinaturas: DiffCampo | null;
  itens: DiffItemDfd[];
  /** Nº total de diferenças (para o contador "Diferenças (N)"). */
  total: number;
};

const REFS = new Set<keyof DfdComparavel>(["numeroContrato", "numeroAta", "numeroLicitacao"]);
const CAMPOS_DFD: [keyof DfdComparavel, string][] = [
  ["planejamento", "Nº de planejamento"],
  ["objeto", "Objeto"],
  ["orgaoEntidade", "Órgão/Entidade"],
  ["setorRequisitante", "Setor requisitante"],
  ["responsavel", "Responsável"],
  ["matricula", "Matrícula"],
  ["email", "E-mail"],
  ["telefone", "Telefone"],
  ["numeroContrato", "Nº do contrato"],
  ["numeroAta", "Nº da ARP"],
  ["numeroLicitacao", "Nº da licitação"],
];

/** Pareia os itens gravados com os do PDF, em 3 rodadas: o MESMO item (código + descrição), depois pelo
 * Nº do item (descrição/código editados) e, por fim, só pelo código. Assim um item removido com a lista
 * RENUMERADA vira 1 "removido" (e os seguintes só mudam de nº), não uma cascata de "alterados". Puro. */
function parearItens(g: ItemComparavel[], p: ItemComparavel[]) {
  const livresG = new Set(g.map((_, i) => i));
  const pares: [ItemComparavel, ItemComparavel][] = [];
  let pendentes = p;
  /** Uma rodada: cada pendente casa com o 1º item gravado LIVRE de mesma chave (`null` = não casa). Filas por
   * chave, na ordem dos gravados — LINEAR, mesmo com milhares de itens sem código ou de código repetido. */
  const rodada = (chave: (x: ItemComparavel) => string | null) => {
    const filas = new Map<string, { idx: number[]; pos: number }>();
    for (const i of livresG) {
      const k = chave(g[i]);
      if (k == null) continue;
      const f = filas.get(k);
      if (f) f.idx.push(i);
      else filas.set(k, { idx: [i], pos: 0 });
    }
    const sobra: ItemComparavel[] = [];
    for (const it of pendentes) {
      const k = chave(it);
      const f = k == null ? undefined : filas.get(k);
      const i = f && f.pos < f.idx.length ? f.idx[f.pos++] : undefined;
      if (i == null) sobra.push(it);
      else {
        livresG.delete(i);
        pares.push([g[i], it]);
      }
    }
    pendentes = sobra;
  };
  rodada((x) => (txt(x.codigo) ? `${txt(x.codigo)}\u0001${norm(x.descricao)}` : null));
  rodada((x) => (x.item != null ? String(x.item) : null));
  rodada((x) => txt(x.codigo) || null);
  return { pares, novos: pendentes, removidos: [...livresG].map((i) => g[i]) };
}

/** Diferenças campo a campo entre dois estados do MESMO item (comparação do reenvio e histórico). */
export function diffItem(a: ItemComparavel, b: ItemComparavel): DiffCampo[] {
  const out: DiffCampo[] = [];
  if (a.item !== b.item) out.push({ campo: "item", rotulo: "Nº do item", antes: ver(a.item), depois: ver(b.item) });
  if (txt(a.codigo) !== txt(b.codigo)) out.push({ campo: "codigo", rotulo: "Código", antes: ver(a.codigo), depois: ver(b.codigo) });
  if (txt(a.descricao) !== txt(b.descricao)) out.push({ campo: "descricao", rotulo: "Descrição", antes: ver(a.descricao), depois: ver(b.descricao) });
  if (txt(a.unidade).toUpperCase() !== txt(b.unidade).toUpperCase()) out.push({ campo: "unidade", rotulo: "Unidade", antes: ver(a.unidade), depois: ver(b.unidade) });
  if (!mesmoNum(a.quantidade, b.quantidade, 1e-6)) out.push({ campo: "quantidade", rotulo: "Quantidade", antes: qtd(a.quantidade), depois: qtd(b.quantidade) });
  if (!mesmoNum(a.valorUnitario, b.valorUnitario, 0.005)) out.push({ campo: "valorUnitario", rotulo: "Valor unitário", antes: moeda(a.valorUnitario), depois: moeda(b.valorUnitario) });
  if (!mesmoNum(a.valorTotal, b.valorTotal, 0.005)) out.push({ campo: "valorTotal", rotulo: "Valor total", antes: moeda(a.valorTotal), depois: moeda(b.valorTotal) });
  return out;
}

const ROTULO_FONTE: Record<string, string> = {
  certificado: "certificado",
  sistema: "sistema",
  dropsigner: "Dropsigner",
  adobe: "Adobe",
  foxit: "Foxit",
  manual: "equipe",
};
/** Lista legível dos assinantes (ordenada — a ordem de leitura não é diferença): assinante (data), formato,
 * código verificador e a validação pela EQUIPE — validar/desfazer ou um carimbo re-assinado É diferença. */
const assinantes = (l: AssinaturaComparavel[]) =>
  l
    .map((a) => {
      let s = `${txt(a.nome) || "(sem nome)"}${a.data ? ` (${txt(a.data)})` : ""}`;
      if (a.fonte) s += ` · ${ROTULO_FONTE[a.fonte] ?? a.fonte}`;
      if (txt(a.codigo)) s += ` · cód. ${txt(a.codigo)}`;
      if (a.validacao?.por === "equipe") s += ` · validada pela equipe${a.validacao.responsavel ? ` (${txt(a.validacao.responsavel)})` : ""}`;
      return s;
    })
    .sort((x, y) => x.localeCompare(y, "pt-BR"))
    .join("; ");

/**
 * Compara UM DFD gravado com o do PDF (já com as edições do usuário). Sem gravado ⇒ "novo". Puro.
 * `rotuloUnidade` traduz o id da unidade (sigla) nas diferenças.
 */
export function compararDfd(
  g: DfdComparavel | null,
  p: DfdComparavel,
  rotuloUnidade: (id: number | null) => string = (id) => (id == null ? "—" : `#${id}`),
): ComparacaoDfd {
  if (!g) return { situacao: "novo", campos: [], secoes: [], assinaturas: null, itens: [], total: 0 };
  const campos: DiffCampo[] = [];
  for (const [c, rotulo] of CAMPOS_DFD) {
    // Referências de renovação são LISTAS ("a; b"): a ordem não é diferença.
    const canon = (v: unknown) => (REFS.has(c) ? [...listaRefs(v as string | null)].sort().join(SEPARADOR_REFS) : txt(v));
    if (canon(g[c]) !== canon(p[c])) campos.push({ campo: c, rotulo, antes: ver(g[c]), depois: ver(p[c]) });
  }
  if (tipoCurtoDfd(g.tipo) !== tipoCurtoDfd(p.tipo)) campos.push({ campo: "tipo", rotulo: "Tipo", antes: ver(tipoCurtoDfd(g.tipo)), depois: ver(tipoCurtoDfd(p.tipo)) });
  if (g.anoPca !== p.anoPca) campos.push({ campo: "anoPca", rotulo: "PCA (ano)", antes: ver(g.anoPca), depois: ver(p.anoPca) });
  if (g.reparticaoId !== p.reparticaoId) campos.push({ campo: "reparticaoId", rotulo: "Unidade", antes: rotuloUnidade(g.reparticaoId), depois: rotuloUnidade(p.reparticaoId) });
  if (!mesmoNum(g.valorTotal ?? 0, p.valorTotal ?? 0, 0.005)) campos.push({ campo: "valorTotal", rotulo: "Valor total", antes: moeda(g.valorTotal ?? 0), depois: moeda(p.valorTotal ?? 0) });

  // Seções pelo TÍTULO normalizado SEM a numeração (o nº varia entre modelos: "5 - …" × "6 - …").
  const secoes: DiffCampo[] = [];
  const mapa = (l: { titulo: string; texto: string }[]) => {
    const m = new Map<string, { titulo: string; texto: string }>();
    for (const s of l) {
      const k = norm(s.titulo).replace(/^\d+(\.\d+)*\s*[-–.)]?\s*/, "");
      const cur = m.get(k);
      m.set(k, cur ? { titulo: cur.titulo, texto: `${cur.texto} ${s.texto}` } : { titulo: s.titulo, texto: s.texto });
    }
    return m;
  };
  const sg = mapa(g.secoes);
  const sp = mapa(p.secoes);
  for (const k of new Set([...sg.keys(), ...sp.keys()])) {
    const a = sg.get(k);
    const b = sp.get(k);
    if (txt(a?.texto) !== txt(b?.texto)) secoes.push({ campo: `secao:${k}`, rotulo: txt(b?.titulo ?? a?.titulo), antes: ver(a?.texto), depois: ver(b?.texto) });
  }

  const ag = assinantes(g.assinaturas);
  const ap = assinantes(p.assinaturas);
  const assinaturas = ag !== ap ? { campo: "assinaturas", rotulo: "Assinaturas", antes: ag || "—", depois: ap || "—" } : null;

  const { pares, novos, removidos } = parearItens(g.itens, p.itens);
  const itens: DiffItemDfd[] = [];
  for (const [a, b] of pares) {
    const d = diffItem(a, b);
    if (d.length > 0) itens.push({ tipo: "alterado", item: b.item, codigo: b.codigo, descricao: b.descricao, campos: d });
  }
  for (const b of novos) itens.push({ tipo: "novo", item: b.item, codigo: b.codigo, descricao: b.descricao, campos: [] });
  for (const a of removidos) itens.push({ tipo: "removido", item: a.item, codigo: a.codigo, descricao: a.descricao, campos: [] });
  itens.sort((x, y) => (x.item ?? Number.MAX_SAFE_INTEGER) - (y.item ?? Number.MAX_SAFE_INTEGER));

  const total = campos.length + secoes.length + (assinaturas ? 1 : 0) + itens.length;
  return { situacao: total === 0 ? "igual" : "alterado", campos, secoes, assinaturas, itens, total };
}

/** Rótulo curto da situação do DFD no reenvio (coluna "Situação"). */
export function rotuloSituacaoReenvio(c: ComparacaoDfd): string {
  if (c.situacao === "novo") return "Novo";
  if (c.situacao === "igual") return "Igual";
  return `Alterado (${c.total})`;
}

/** Corta um texto longo p/ o relatório (a tela mostra inteiro). */
const curto = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * RELATÓRIO DE DIFERENÇAS do reenvio (copiável): capa, DFDs novos/alterados (campo a campo, itens) e os
 * gravados que não vieram no PDF (excluídos ou mantidos). Puro.
 */
export function linhasRelatorioReenvio(info: {
  numero: string;
  idExterno: string | null;
  capa: DiffCampo[];
  dfds: { numero: string; planejamento: string | null; comparacao: ComparacaoDfd }[];
  removidos: { numero: string; planejamento: string | null; excluir: boolean }[];
  /** DFDs gravados que o PDF traz mas ainda não foram lidos/comparados (ex.: além do teto da análise). */
  pendentes?: { numero: string; planejamento: string | null }[];
}): string[] {
  const l: string[] = [`Reenvio do protocolo ${info.numero}${info.idExterno ? ` (Id ${info.idExterno})` : ""} — diferenças em relação ao gravado`, ""];
  const campo = (d: DiffCampo) => `  • ${d.rotulo}: ${curto(d.antes)} → ${curto(d.depois)}`;
  if (info.capa.length > 0) {
    l.push("Capa:");
    for (const d of info.capa) l.push(campo(d));
    l.push("");
  }
  const novos = info.dfds.filter((d) => d.comparacao.situacao === "novo");
  const alterados = info.dfds.filter((d) => d.comparacao.situacao === "alterado");
  const iguais = info.dfds.filter((d) => d.comparacao.situacao === "igual");
  const ref = (d: { numero: string; planejamento: string | null }) => `DFD ${d.numero}${d.planejamento ? ` (Planej. ${d.planejamento})` : ""}`;
  if (novos.length > 0) l.push(`Novos (${novos.length}): ${novos.map(ref).join(", ")}.`, "");
  for (const d of alterados) {
    const c = d.comparacao;
    l.push(`${ref(d)} — ${c.total} diferença(s):`);
    for (const x of c.campos) l.push(campo(x));
    for (const x of c.secoes) l.push(campo(x));
    if (c.assinaturas) l.push(campo(c.assinaturas));
    for (const it of c.itens) {
      const nome = `Item ${it.item ?? "—"}${it.codigo ? ` (${it.codigo})` : ""}`;
      if (it.tipo === "novo") l.push(`  • ${nome}: NOVO — ${curto(txt(it.descricao))}`);
      else if (it.tipo === "removido") l.push(`  • ${nome}: REMOVIDO — ${curto(txt(it.descricao))}`);
      else l.push(`  • ${nome}: ${it.campos.map((x) => `${x.rotulo} ${curto(x.antes, 60)} → ${curto(x.depois, 60)}`).join("; ")}`);
    }
    l.push("");
  }
  if (iguais.length > 0) l.push(`Sem diferenças (${iguais.length}): ${iguais.map(ref).join(", ")}.`, "");
  const pendentes = info.pendentes ?? [];
  if (pendentes.length > 0) l.push(`Ainda NÃO comparados (${pendentes.length}) — abra-os ou aguarde a análise: ${pendentes.map(ref).join(", ")}.`, "");
  const excluir = info.removidos.filter((r) => r.excluir);
  const manter = info.removidos.filter((r) => !r.excluir);
  if (excluir.length > 0) l.push(`Gravados que NÃO vieram no PDF — serão EXCLUÍDOS (${excluir.length}): ${excluir.map(ref).join(", ")}.`);
  if (manter.length > 0) l.push(`Gravados que NÃO vieram no PDF — MANTIDOS (${manter.length}): ${manter.map(ref).join(", ")}.`);
  if (info.capa.length === 0 && novos.length === 0 && alterados.length === 0 && info.removidos.length === 0 && pendentes.length === 0)
    l.push("Nenhuma diferença: o PDF reenviado é igual ao protocolo gravado.");
  return l;
}

// ---- Tratamentos herdados do gravado ----

const ROTULO_HERDADO: Record<string, string> = {
  JUSTIFICATIVA: "Justificativa",
  "PREVISAO DE ENTREGA": "Previsão de entrega",
  PRIORIDADE: "Prioridade",
  "FUNDAMENTACAO LEGAL": "Fundamentação legal",
};
const chaveAssinatura = (a: { nome: string; data?: string | null; fonte?: string }) => `${norm(a.nome)}|${txt(a.data)}|${a.fonte ?? ""}`;

/** O que o reenvio lê/altera de um DFD (DfdParseado do PDF e DfdDetalhe do gravado servem). */
export type DfdTratavel = {
  tipo: string | null;
  secoes: DfdSecao[];
  numeroContrato: string | null;
  numeroAta: string | null;
  numeroLicitacao: string | null;
  assinaturas: Assinatura[];
};

/**
 * REENVIO: o que o PDF NÃO traz (vazio / fora do padrão) mas o DFD gravado já tinha TRATADO é HERDADO do
 * gravado — tipo, seções obrigatórias (justificativa/previsão/prioridade/fundamentação), referências de
 * renovação e a VALIDAÇÃO da assinatura pela equipe (mesmo assinante/data; ou a assinatura "manual" quando o
 * PDF segue sem assinatura nomeada). NUNCA sobrescreve um valor válido do PDF. Devolve o DFD + os rótulos
 * do que foi herdado (transparência na comparação). Puro.
 */
export function herdarTratamentos<T extends DfdTratavel>(
  novo: T,
  gravado: DfdTratavel,
  anoPca?: number | null,
  /** Partes a herdar: a das ASSINATURAS é adiada enquanto o DFD aguarda o OCR (a assinatura achatada só
   * existe depois da leitura — herdar antes perderia a validação e pularia o OCR). */
  partes: { tratamentos?: boolean; assinaturas?: boolean } = {},
): { dfd: T; herdados: string[] } {
  const herdados: string[] = [];
  let dfd = novo;
  if (partes.tratamentos !== false) {
    const t = herdarTratamentosTexto(dfd, gravado, anoPca);
    dfd = t.dfd;
    herdados.push(...t.herdados);
  }
  if (partes.assinaturas !== false) {
    const a = herdarValidacaoAssinaturas(dfd, gravado);
    dfd = a.dfd;
    herdados.push(...a.herdados);
  }
  return { dfd, herdados };
}

/** Tipo, seções obrigatórias e referências de renovação (o que o PDF não traz e o gravado tratou). */
function herdarTratamentosTexto<T extends DfdTratavel>(novo: T, gravado: DfdTratavel, anoPca?: number | null): { dfd: T; herdados: string[] } {
  const herdados: string[] = [];
  let dfd = novo;
  if (!tipoCurtoDfd(novo.tipo) && tipoCurtoDfd(gravado.tipo)) {
    dfd = { ...dfd, tipo: gravado.tipo };
    herdados.push("Tipo");
  }
  let secoes = dfd.secoes;
  for (const s of SECOES_OBRIGATORIAS) {
    if (situacaoSecao(secoes, s.kw, anoPca) !== "ok" && situacaoSecao(gravado.secoes, s.kw, anoPca) === "ok") {
      secoes = setTextoSecao(secoes, s, textoSecao(gravado.secoes, s.kw));
      herdados.push(ROTULO_HERDADO[s.kw] ?? s.rotulo);
    }
  }
  if (secoes !== dfd.secoes) dfd = { ...dfd, secoes };
  const semRefs = (d: DfdTratavel) => !txt(d.numeroContrato) && !txt(d.numeroAta) && !txt(d.numeroLicitacao);
  if (semRefs(dfd) && !semRefs(gravado)) {
    dfd = { ...dfd, numeroContrato: gravado.numeroContrato, numeroAta: gravado.numeroAta, numeroLicitacao: gravado.numeroLicitacao };
    herdados.push("Referências de renovação");
  }
  return { dfd, herdados };
}

/** Validação da assinatura pela EQUIPE herdada do gravado (mesmo assinante/data/formato; ou a "manual"). */
function herdarValidacaoAssinaturas<T extends DfdTratavel>(novo: T, gravado: DfdTratavel): { dfd: T; herdados: string[] } {
  const herdados: string[] = [];
  let dfd = novo;
  // Validação da assinatura pela EQUIPE: a mesma assinatura (nome+data+formato) herda a validação; se o PDF
  // segue sem assinatura NOMEADA, a assinatura "manual" (equipe) do gravado continua valendo.
  const validadas = new Map(gravado.assinaturas.filter((a) => a.validacao?.por === "equipe").map((a) => [chaveAssinatura(a), a.validacao]));
  let mudouAss = false;
  let assinaturas = dfd.assinaturas.map((a) => {
    const v = !a.validacao ? validadas.get(chaveAssinatura(a)) : undefined;
    if (!v) return a;
    mudouAss = true;
    return { ...a, validacao: v };
  });
  const manual = gravado.assinaturas.find((a) => a.fonte === "manual" && a.validacao?.por === "equipe");
  if (manual && !assinaturas.some((a) => txt(a.nome) || a.validacao) && !assinaturas.some((a) => a.fonte === "manual")) {
    assinaturas = [...assinaturas, manual];
    mudouAss = true;
  }
  if (mudouAss) {
    dfd = { ...dfd, assinaturas };
    herdados.push("Validação da assinatura (equipe)");
  }
  return { dfd, herdados };
}
