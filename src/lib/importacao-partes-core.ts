import { chaveEmpenho, type LinhaEmpenho } from "./empenhos-core.ts";
import { chaveLiquidacao, type LinhaLiquidacao } from "./liquidacoes-core.ts";
import { chavePagamento, type LinhaPagamento } from "./pagamentos-core.ts";

/**
 * A IMPORTAÇÃO EM PARTES — o núcleo PURO (testado em `tests/importacao-partes.test.ts`) que mantém CADA requisição da
 * importação dentro do plano GRATUITO do Worker (~10 ms de CPU e 50 consultas ao D1 por requisição): ler e consertar o JSON
 * da Centi custa ~20 ms por MB (medido) e o mês de pagamentos de um órgão grande chega a vários MB — por isso o JSON é lido
 * no NAVEGADOR (as MESMAS funções `lerPagina*`) e o servidor só recebe as linhas JÁ lidas, em PARTES de tamanho FIXO
 * (`MAX_LINHAS_PARTE`/`MAX_BYTES_PARTE`): cada parte = um lote de comandos de tamanho fixo, qualquer que seja o mês.
 * O servidor confere cada linha (`linhasDaParte`: tipos, tamanhos, a chave refeita dos campos, o ano do lote) antes de gravar.
 */

export type ModoParte = "empenhos" | "liquidacoes" | "pagamentos";

/** Teto de linhas e de caracteres (o JSON das linhas) de UMA parte — o servidor recusa acima disso. */
export const MAX_LINHAS_PARTE = 1500;
export const MAX_BYTES_PARTE = 80_000;
/** O corpo da requisição de uma parte em BYTES (as linhas + o resumo; um acento ocupa 2 bytes) — acima disso a rota responde 413 sem ler. */
export const MAX_CORPO_PARTE = 1_000_000;
/** Texto livre (histórico) — o mesmo teto dos textos longos do sistema. */
const MAX_TEXTO = 20_000;

type Tipo = "txt" | "txt0" | "txtN" | "int" | "intN" | "num" | "dataN" | "bit";

/** Os campos de cada modo, NA ORDEM em que a parte os manda (cada linha = uma tupla). */
const ESPEC_EMPENHO = [
  ["chave", "txt"],
  ["ano", "int"],
  ["srcId", "intN"],
  ["numero", "txt"],
  ["data", "dataN"],
  ["orgaoGestor", "txt0"],
  ["unidadeOrcamentaria", "txtN"],
  ["fornecedor", "txtN"],
  ["cpfCnpj", "txtN"],
  ["modalidade", "txtN"],
  ["licitacao", "txtN"],
  ["funcao", "txtN"],
  ["subfuncao", "txtN"],
  ["programa", "txtN"],
  ["acao", "txtN"],
  ["elemento", "txtN"],
  ["subelemento", "txtN"],
  ["fonte", "txtN"],
  ["valorEmpenhado", "num"],
  ["valorAnulado", "num"],
  ["valorLiquidado", "num"],
  ["valorPago", "num"],
  ["saldoPagar", "num"],
  ["historico", "txtN"],
] as const satisfies readonly (readonly [keyof LinhaEmpenho, Tipo])[];

const ESPEC_LIQUIDACAO = [
  ["chave", "txt"],
  ["ano", "int"],
  ["srcId", "intN"],
  ["numero", "txtN"],
  ["data", "dataN"],
  ["numeroEmpenho", "txt0"],
  ["orgao", "txt0"],
  ["credor", "txtN"],
  ["cpfCnpj", "txtN"],
  ["historico", "txtN"],
  ["valor", "num"],
  ["valorAnulado", "num"],
  ["valorLiquido", "num"],
  ["valorPago", "num"],
  ["saldo", "num"],
] as const satisfies readonly (readonly [keyof LinhaLiquidacao, Tipo])[];

const ESPEC_PAGAMENTO = [
  ["chave", "txt"],
  ["ano", "int"],
  ["srcId", "intN"],
  ["data", "dataN"],
  ["numeroEmpenho", "txt0"],
  ["orgao", "txt0"],
  ["credor", "txtN"],
  ["cpfCnpj", "txtN"],
  ["historico", "txtN"],
  ["valor", "num"],
  ["valorRetencao", "num"],
  ["valorLiquido", "num"],
  ["anulado", "bit"],
  ["motivoAnulacao", "txtN"],
] as const satisfies readonly (readonly [keyof LinhaPagamento, Tipo])[];

export const ESPEC_PARTE = { empenhos: ESPEC_EMPENHO, liquidacoes: ESPEC_LIQUIDACAO, pagamentos: ESPEC_PAGAMENTO } as const;

export type LinhaDoModo<M extends ModoParte> = M extends "empenhos" ? LinhaEmpenho : M extends "liquidacoes" ? LinhaLiquidacao : LinhaPagamento;

/** Uma linha lida → a tupla da parte (os campos na ordem do modo). */
export function tuplaDaLinha(modo: ModoParte, l: object): unknown[] {
  const r = l as Record<string, unknown>;
  return ESPEC_PARTE[modo].map(([c]) => r[c] ?? null);
}

/**
 * A ASSINATURA de uma linha (o "hash"): FNV-1a de 64 bits (duas faixas de 32) sobre a tupla canônica + a versão do leitor —
 * a MESMA no navegador (que decide o que mandar) e no servidor (que grava a do registro e confere a que chega). Mudou um
 * campo (ou o leitor), muda a assinatura; igual, o registro não é escrito de novo.
 */
export function hashTupla(tupla: readonly unknown[], leitor: number): string {
  const s = `${JSON.stringify(tupla)}|${leitor}`;
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x9e3779b9;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x01000193) ^ (a >>> 13);
  }
  return (a >>> 0).toString(36) + (b >>> 0).toString(36).padStart(7, "0");
}

/** A assinatura de uma linha lida (`tuplaDaLinha` + o leitor). */
export const hashLinha = (modo: ModoParte, l: object, leitor: number) => hashTupla(tuplaDaLinha(modo, l), leitor);

/** Um registro IGUAL ao gravado, como vai na parte: a chave e a assinatura (nenhum dado). */
export type ParIgual = [chave: string, hash: string];

/** Teto de pares (chave + assinatura) por parte — ~45 caracteres cada. */
export const MAX_PARES_PARTE = 5000;

/** Uma PARTE: as tuplas (os registros NOVOS ou DIFERENTES do gravado, inteiros) e os pares dos IGUAIS. */
export type Parte = { tuplas: unknown[][]; iguais: ParIgual[] };

/** O tamanho de UM par no JSON da parte (`["chave","hash"],`) — a MESMA conta no navegador e no servidor. */
export const bytesDoPar = (p: ParIgual) => JSON.stringify(p).length + 1;

/**
 * As PARTES de uma página lida (no navegador), já separando o que MUDOU: a linha cuja assinatura é a gravada (`gravados`,
 * chave → assinatura, baixado no começo da importação) vai só como o PAR (chave + assinatura) — o servidor confere no banco;
 * as demais vão inteiras (`partesDaPagina`). O ORÇAMENTO de cada parte é em BYTES somando as linhas e os pares (≤
 * `MAX_BYTES_PARTE`): os pares completam as partes de linhas e o que sobra vai em partes só de pares do mesmo tamanho — a
 * CPU de cada requisição fica fixa, qualquer que seja o tamanho das chaves. Página vazia = UMA parte vazia.
 */
export function partesComIguais(modo: ModoParte, linhas: readonly object[], gravados: ReadonlyMap<string, string>, leitor: number, o: { maxLinhas?: number; maxBytes?: number; maxPares?: number } = {}): Parte[] {
  const inteiras: object[] = [];
  const iguais: ParIgual[] = [];
  for (const l of linhas) {
    const chave = (l as { chave: string }).chave;
    const g = gravados.get(chave);
    const h = g == null ? null : hashLinha(modo, l, leitor);
    if (h != null && h === g) iguais.push([chave, h]);
    else inteiras.push(l);
  }
  const maxPares = o.maxPares ?? MAX_PARES_PARTE;
  const maxBytes = o.maxBytes ?? MAX_BYTES_PARTE;
  const tuplas = inteiras.length ? partesDaPagina(modo, inteiras, o) : [];
  const partes: (Parte & { bytes: number })[] = tuplas.map((t) => ({ tuplas: t, iguais: [], bytes: JSON.stringify(t).length }));
  let k = 0;
  for (const par of iguais) {
    const n = bytesDoPar(par);
    // A 1ª parte com espaço (linhas + pares ≤ o teto; pares ≤ o teto de quantidade); nenhuma = uma parte só de pares.
    while (k < partes.length && (partes[k].bytes + n > maxBytes || partes[k].iguais.length >= maxPares)) k++;
    if (k === partes.length) partes.push({ tuplas: [], iguais: [], bytes: 2 });
    partes[k].iguais.push(par);
    partes[k].bytes += n;
  }
  return partes.length ? partes.map(({ tuplas: t, iguais: i }) => ({ tuplas: t, iguais: i })) : [{ tuplas: [], iguais: [] }];
}

/** Confere os PARES de uma parte (no servidor): chave e assinatura válidas, sem chave repetida nem já entre as linhas. */
export function paresDaParte(pares: unknown, chavesDasLinhas: ReadonlySet<string>): { ok: true; pares: ParIgual[] } | { ok: false; motivo: string } {
  if (pares == null) return { ok: true, pares: [] };
  if (!Array.isArray(pares) || pares.length > MAX_PARES_PARTE) return { ok: false, motivo: `Os iguais da parte passam de ${MAX_PARES_PARTE}.` };
  const vistas = new Set<string>();
  let bytes = 0;
  for (let i = 0; i < pares.length; i++) {
    const p = pares[i];
    if (!Array.isArray(p) || p.length !== 2 || typeof p[0] !== "string" || !p[0] || p[0].length > 200 || typeof p[1] !== "string" || !/^[0-9a-z]{2,16}$/.test(p[1])) {
      return { ok: false, motivo: `Igual ${i + 1}: chave ou assinatura inválida.` };
    }
    if (vistas.has(p[0]) || chavesDasLinhas.has(p[0])) return { ok: false, motivo: `Igual ${i + 1}: chave repetida na parte.` };
    vistas.add(p[0]);
    bytes += bytesDoPar(p as ParIgual);
    if (bytes > MAX_BYTES_PARTE) return { ok: false, motivo: `Os iguais da parte passam de ${Math.round(MAX_BYTES_PARTE / 1000)} KB.` };
  }
  return { ok: true, pares: pares as ParIgual[] };
}

/**
 * As PARTES de uma página lida (no navegador): as tuplas em pedaços de até `MAX_LINHAS_PARTE` linhas e `MAX_BYTES_PARTE`
 * caracteres. Página vazia = UMA parte vazia (o passo também se registra). Uma linha maior que o teto vai sozinha.
 */
export function partesDaPagina(modo: ModoParte, linhas: readonly object[], o: { maxLinhas?: number; maxBytes?: number } = {}): unknown[][][] {
  const maxLinhas = o.maxLinhas ?? MAX_LINHAS_PARTE;
  const maxBytes = o.maxBytes ?? MAX_BYTES_PARTE;
  const partes: unknown[][][] = [];
  let atual: unknown[][] = [];
  let tamanho = 2;
  for (const l of linhas) {
    const t = tuplaDaLinha(modo, l);
    const n = JSON.stringify(t).length + 1;
    if (atual.length && (atual.length >= maxLinhas || tamanho + n > maxBytes)) {
      partes.push(atual);
      atual = [];
      tamanho = 2;
    }
    atual.push(t);
    tamanho += n;
  }
  if (atual.length || !partes.length) partes.push(atual);
  return partes;
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;

function valeTipo(tipo: Tipo, v: unknown): boolean {
  switch (tipo) {
    case "txt":
      return typeof v === "string" && v.length > 0 && v.length <= MAX_TEXTO;
    case "txt0":
      return typeof v === "string" && v.length <= MAX_TEXTO;
    case "txtN":
      return v === null || (typeof v === "string" && v.length > 0 && v.length <= MAX_TEXTO);
    case "int":
      return Number.isInteger(v);
    case "intN":
      return v === null || (Number.isInteger(v) && (v as number) > 0);
    case "num":
      return typeof v === "number" && Number.isFinite(v);
    case "dataN":
      return v === null || (typeof v === "string" && DATA.test(v));
    case "bit":
      return v === 0 || v === 1;
  }
}

/** A chave refeita dos campos (a mesma régua da leitura) — a parte não escolhe a chave. */
function chaveDe(modo: ModoParte, r: Record<string, unknown>): string | null {
  if (modo === "empenhos") return chaveEmpenho(r.ano as number, r.orgaoGestor as string, r.numero as string);
  return r.srcId == null ? null : modo === "liquidacoes" ? chaveLiquidacao(r.srcId as number) : chavePagamento(r.srcId as number);
}

/**
 * CONFERE uma parte (no servidor) e devolve as linhas — ou o motivo da recusa (a 1ª linha errada). Cada tupla: o número de
 * campos do modo, o tipo de cada um, o ANO do lote, a chave refeita dos campos e sem chave repetida na parte.
 */
export function linhasDaParte<M extends ModoParte>(modo: M, ano: number, tuplas: readonly unknown[]): { ok: true; linhas: LinhaDoModo<M>[] } | { ok: false; motivo: string } {
  const espec = ESPEC_PARTE[modo];
  if (tuplas.length > MAX_LINHAS_PARTE) return { ok: false, motivo: `Parte com mais de ${MAX_LINHAS_PARTE} linhas.` };
  const vistas = new Set<string>();
  const linhas: LinhaDoModo<M>[] = [];
  for (let i = 0; i < tuplas.length; i++) {
    const t = tuplas[i];
    if (!Array.isArray(t) || t.length !== espec.length) return { ok: false, motivo: `Linha ${i + 1}: esperava ${espec.length} campos.` };
    const r: Record<string, unknown> = {};
    for (let k = 0; k < espec.length; k++) {
      const [campo, tipo] = espec[k];
      if (!valeTipo(tipo, t[k])) return { ok: false, motivo: `Linha ${i + 1}: o campo "${campo}" não vale.` };
      r[campo] = t[k];
    }
    if (r.ano !== ano) return { ok: false, motivo: `Linha ${i + 1}: o ano não é o da importação (${ano}).` };
    if (chaveDe(modo, r) !== r.chave) return { ok: false, motivo: `Linha ${i + 1}: a chave não confere com os campos.` };
    if (vistas.has(r.chave as string)) return { ok: false, motivo: `Linha ${i + 1}: chave repetida na parte.` };
    vistas.add(r.chave as string);
    linhas.push(r as LinhaDoModo<M>);
  }
  return { ok: true, linhas };
}

/** O valor da linha que entra na SOMA do passo (a mesma régua da leitura): empenhado · liquidado · pago líquido das não anuladas. */
export function somaDaLinha(modo: ModoParte, l: object): number {
  const r = l as Record<string, number>;
  if (modo === "empenhos") return r.valorEmpenhado;
  if (modo === "liquidacoes") return r.valor;
  return r.anulado ? 0 : r.valorLiquido;
}

/** O RESUMO da página lida (vai na ÚLTIMA parte): o que a Centi respondeu e as contagens da leitura (a soma e as linhas o
 * servidor conta das próprias partes). */
export type ResumoPagina = {
  status: number | null;
  bytes: number | null;
  ms: number | null;
  recebidos: number;
  recusados: number;
  repetidos: number;
  /** O `TotalRegistros` da Centi (empenhos); nas liquidações e nos pagamentos o servidor calcula. */
  total: number | null;
  reparado: boolean;
};

/** Confere o resumo contra as linhas que o servidor recebeu da página: inteiros não negativos e recebidos = linhas +
 * recusados + repetidos. */
export function resumoValido(r: ResumoPagina, linhasDaPagina: number): boolean {
  const inteiro = (n: unknown) => Number.isInteger(n) && (n as number) >= 0;
  return (
    inteiro(r.recebidos) &&
    inteiro(r.recusados) &&
    inteiro(r.repetidos) &&
    (r.total === null || inteiro(r.total)) &&
    (r.status === null || inteiro(r.status)) &&
    (r.bytes === null || inteiro(r.bytes)) &&
    (r.ms === null || inteiro(r.ms)) &&
    r.recebidos === linhasDaPagina + r.recusados + r.repetidos
  );
}
