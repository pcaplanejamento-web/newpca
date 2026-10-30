import { limparTexto } from "./normalize.ts";

/**
 * FROTAS — núcleo PURO da integração com a API da VÓLUS (cartão de combustível e de manutenção da frota). Sem `getDb`/env:
 * testável. Mapeia cada transação dos extratos para UMA linha de `frota_transacoes` (abastecimento ou manutenção), com a
 * placa padronizada, a data e a hora em BRASÍLIA, os valores em REAIS e a assinatura (`hash`) do que veio — a gravação só
 * escreve o que MUDOU.
 *
 * A API (estudada no código do Dattago e nos relatórios da integração — `volus-tools`):
 * - `POST https://auth.api.volus.com/v1/partners/auth/token` (form `grant_type=client_credentials`, `client_id`,
 *   `client_secret`) → `access_token` (JWE, 1 h), `companies[] {id, name}`, `scope[]`.
 * - `GET https://extrato.api.volus.com/v1/fleet/{fuel|maintenance}/statement?start_date=AAAA-MM-DD&end_date=…&company_id=…`
 *   → `{ response_code, message, data: { transactions: [...] } }` — SEM paginação (o período inteiro de uma vez; ~1 KB por
 *   transação: a Prefeitura passa de 2 mil abastecimentos por mês). Por isso o período é DIVIDIDO até caber.
 * - Combustível: `product[]` (no singular) com `name`, `quantity`, `unit_price`, `total_value` — em REAIS (o ÷100 antigo do
 *   Dattago estava errado: o preço por litro ficava 100× menor). Manutenção: `products[]` (no plural), `total_price` em
 *   reais (o `total_value` antigo, em centavos).
 * - Só responde a navegadores em `localhost` (CORS) e o erro 500 vem sem CORS: TUDO passa pelo servidor.
 */

export type TipoTransacao = "abastecimento" | "manutencao";
export const TIPOS_TRANSACAO: TipoTransacao[] = ["abastecimento", "manutencao"];
export const ROTULO_TIPO: Record<TipoTransacao, string> = { abastecimento: "Abastecimento", manutencao: "Manutenção" };

/** O produto do contrato na Vólus (o mesmo contrato pode ter os dois — a leitura pede cada um). */
export type ProdutoContrato = "combustivel" | "manutencao" | "ambos";
export const ROTULO_PRODUTO: Record<ProdutoContrato, string> = { combustivel: "Combustível", manutencao: "Manutenção", ambos: "Combustível e manutenção" };
export const tiposDoProduto = (p: ProdutoContrato): TipoTransacao[] =>
  p === "combustivel" ? ["abastecimento"] : p === "manutencao" ? ["manutencao"] : ["abastecimento", "manutencao"];

export const HOST_AUTH_VOLUS = "https://auth.api.volus.com";
export const HOST_EXTRATO_VOLUS = "https://extrato.api.volus.com";
export const caminhoExtrato = (t: TipoTransacao) => (t === "abastecimento" ? "/v1/fleet/fuel/statement" : "/v1/fleet/maintenance/statement");

/** O código da empresa (contrato) na Vólus: 12 dígitos ("000617000002"); aceita o "000617-000002" do portal. */
export function codigoEmpresa(v: unknown): string {
  const d = String(v ?? "").replace(/\D/g, "");
  return /^\d{12}$/.test(d) ? d : "";
}
export const codigoLegivel = (c: string) => (c.length === 12 ? `${c.slice(0, 6)}-${c.slice(6)}` : c);

/** O produto provável pelo código (000617 = combustível, 000600 = manutenção — os contratos da Prefeitura). */
export const produtoProvavel = (c: string): ProdutoContrato => (c.startsWith("000617") ? "combustivel" : c.startsWith("000600") ? "manutencao" : "ambos");

// ─── PLACA ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** A placa PADRONIZADA: maiúsculas, só letras e números ("abc-1d23" → "ABC1D23"); vazia = null. A MESMA régua em toda a frota
 * (importação, cadastro, planilha, pesquisa) — o Dattago usava duas e o hífen da planilha virava "placa inexistente". */
export function normalizarPlaca(v: unknown): string | null {
  const s = String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return s ? s.slice(0, 16) : null;
}
/** Placa no padrão brasileiro: a antiga (ABC1234) ou a Mercosul (ABC1D23). Fora dele = provável máquina/prefixo interno. */
export const placaValida = (p: string | null | undefined) => !!p && /^[A-Z]{3}[0-9][0-9A-Z][0-9]{2}$/.test(p);
/** A placa como se lê: "ABC-1234" (antiga) ou "ABC1D23" (Mercosul). */
export function placaLegivel(p: string | null | undefined): string {
  if (!p) return "—";
  return /^[A-Z]{3}\d{4}$/.test(p) ? `${p.slice(0, 3)}-${p.slice(3)}` : p;
}

// ─── NÚMEROS, TEXTOS, DATAS ─────────────────────────────────────────────────────────────────────────────────────

/** Número da Vólus: número, "1.234,56", "1,234.56" ou "R$ 10"; inválido = null (nunca NaN). */
export function numero(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/\s|R\$/g, "");
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
const arred = (n: number, casas: number) => Math.round(n * 10 ** casas) / 10 ** casas;

/** Texto limpo (sem controle, espaços juntos, até `max`); vazio = null. */
export function texto(v: unknown, max = 300): string | null {
  if (v == null) return null;
  const s = limparTexto(v);
  return s ? s.slice(0, max) : null;
}

const FMT_BR = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/**
 * A data e a hora em BRASÍLIA: "AAAA-MM-DDTHH:MM:SS". Com fuso ("Z", "-03:00") converte; SEM fuso, a hora já é a local (a
 * Vólus é brasileira) — nunca UTC: o abastecimento das 22h de 31/12 não pode cair no ano seguinte (o defeito do Dattago).
 */
export function dataHoraBrasilia(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i.exec(s);
  if (!m) {
    const br = /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
    if (!br) return null;
    return `${br[3]}-${br[2]}-${br[1]}T${br[4] ?? "00"}:${br[5] ?? "00"}:${br[6] ?? "00"}`;
  }
  if (!m[7]) return `${m[1]}-${m[2]}-${m[3]}T${m[4] ?? "00"}:${m[5] ?? "00"}:${m[6] ?? "00"}`;
  const d = new Date(s.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return null;
  const p = Object.fromEntries(FMT_BR.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

/** Dias (AAAA-MM-DD) — utilidades de período. */
export const diaValido = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);
export const diasEntre = (a: string, b: string) => Math.round((ms(b) - ms(a)) / 86_400_000) + 1;
export function somarDias(d: string, n: number): string {
  return new Date(ms(d) + n * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Divide [inicio, fim] em `partes` períodos contíguos (dias inteiros, sem buraco nem sobreposição) — a resposta grande
 * demais volta dividida pelo tamanho que veio (`partesPara`).
 */
export function dividirPeriodo(inicio: string, fim: string, partes: number): { inicio: string; fim: string }[] {
  const total = diasEntre(inicio, fim);
  const n = Math.max(1, Math.min(total, Math.floor(partes)));
  const out: { inicio: string; fim: string }[] = [];
  let ini = inicio;
  for (let i = 0; i < n; i++) {
    const dias = Math.floor(total / n) + (i < total % n ? 1 : 0);
    const f = somarDias(ini, dias - 1);
    out.push({ inicio: ini, fim: f });
    ini = somarDias(f, 1);
  }
  return out;
}

/** O teto de BYTES de uma resposta lida no servidor (o limite de CPU do Worker: ler o JSON custa ~20 ms por MB). */
export const MAX_BYTES_EXTRATO = 200_000;
/** O teto de UM DIA (não se divide mais): o dia movimentado passa dos 200 KB e tem de ser lido mesmo assim. */
export const MAX_BYTES_DIA_FROTA = 1_000_000;
/** O começo da mensagem do dia que nem com o teto de um dia cabe: a automática pula o dia (aviso) — nunca trava o par. */
export const MSG_DIA_GRANDE = "Um único dia";
/** Em quantas partes dividir quando a resposta passou do teto (`bytes` = o que já veio — pelo menos 2). */
export const partesPara = (bytes: number) => Math.max(2, Math.ceil((bytes * 1.25) / MAX_BYTES_EXTRATO));

/** Os meses (períodos) de um ano até `hoje` — a leitura começa por mês e divide o que não couber. */
export function mesesDoAno(ano: number, hoje: string): { inicio: string; fim: string }[] {
  const out: { inicio: string; fim: string }[] = [];
  for (let m = 1; m <= 12; m++) {
    const inicio = `${ano}-${String(m).padStart(2, "0")}-01`;
    if (inicio > hoje) break;
    const fimMes = somarDias(m === 12 ? `${ano + 1}-01-01` : `${ano}-${String(m + 1).padStart(2, "0")}-01`, -1);
    out.push({ inicio, fim: fimMes < hoje ? fimMes : hoje });
  }
  return out;
}

// ─── A RESPOSTA ─────────────────────────────────────────────────────────────────────────────────────────────────

/** As transações de uma resposta de extrato (`data.transactions` ou `transactions`); outra forma = erro com a mensagem. */
export function transacoesDaResposta(json: unknown): { transacoes: Record<string, unknown>[] } | { erro: string } {
  const j = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const data = (j.data && typeof j.data === "object" ? j.data : j) as Record<string, unknown>;
  if (Array.isArray(data.transactions)) return { transacoes: data.transactions.filter((t): t is Record<string, unknown> => !!t && typeof t === "object") };
  if (Array.isArray(j.transactions)) return { transacoes: (j.transactions as unknown[]).filter((t): t is Record<string, unknown> => !!t && typeof t === "object") };
  const msg = texto(j.message, 300);
  return { erro: msg ? `A Vólus respondeu sem transações: ${msg}` : "A Vólus respondeu num formato inesperado (sem a lista de transações)." };
}

/** A mensagem legível de um status de erro da Vólus (o corpo é `{response_code, message, data}`). */
export function mensagemStatusVolus(status: number, corpo: string): string {
  let motivo = corpo.trim();
  try {
    const j = JSON.parse(corpo) as { message?: unknown };
    if (typeof j?.message === "string") motivo = j.message;
  } catch {
    /* não é JSON */
  }
  motivo = motivo.replace(/\s+/g, " ").slice(0, 240);
  const de = motivo ? ` (Vólus: ${motivo})` : "";
  if (status === 400) return `A Vólus recusou o pedido${de}.`;
  if (status === 401) return `A Vólus recusou as credenciais — confira o Client ID e o Client Secret${de}.`;
  if (status === 403) return `Sem permissão nesse contrato ou produto na Vólus${de}.`;
  if (status === 404) return `Não encontrado na Vólus${de}.`;
  if (status === 429) return "Limite de pedidos da Vólus — tentando de novo em instantes.";
  if (status >= 500) return `A Vólus teve um erro interno${de}. Tente de novo; se persistir, informe o código ao suporte da Vólus.`;
  return motivo ? `Vólus: ${motivo}` : `A Vólus respondeu ${status}.`;
}

// ─── MAPEAMENTO ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * As COLUNAS de dados de uma transação, NA ORDEM da tupla gravada (a assinatura e o INSERT usam esta ordem). Mudar a ordem
 * ou acrescentar uma coluna muda a assinatura de TODAS as linhas (a próxima leitura regrava tudo uma vez) — acrescente no FIM.
 */
export const COLUNAS_TRANSACAO = [
  "tipo",
  "chave",
  "contrato",
  "ref_id",
  "data_hora",
  "dia",
  "ano",
  "placa",
  "placa_crua",
  "prefixo",
  "cartao",
  "marca",
  "modelo",
  "ano_fabricacao",
  "motorista",
  "motorista_cnh",
  "motorista_cpf",
  "estabelecimento",
  "estab_cnpj",
  "estab_endereco",
  "estab_bairro",
  "estab_cidade",
  "estab_uf",
  "estab_cep",
  "latitude",
  "longitude",
  "produtos",
  "itens",
  "qtd_itens",
  "litros",
  "preco_litro",
  "valor",
  "hodometro",
  "medidor_texto",
  "km_rodado",
  "consumo",
  "tipo_manutencao",
  "nota_fiscal",
  "nf_produtos",
  "nf_servicos",
  "valor_nota",
  "faturado",
  "empenho",
  "processo",
  "unidade_nome",
  "unidade_codigo",
] as const;
export type ColunaTransacao = (typeof COLUNAS_TRANSACAO)[number];
export type LinhaTransacao = Record<ColunaTransacao, string | number | null>;
/** As colunas NUMÉRICAS (o resto é texto). */
export const COLUNAS_NUMERICAS = new Set<ColunaTransacao>([
  "ano",
  "ano_fabricacao",
  "latitude",
  "longitude",
  "qtd_itens",
  "litros",
  "preco_litro",
  "valor",
  "hodometro",
  "km_rodado",
  "consumo",
  "valor_nota",
  "faturado",
]);

type Obj = Record<string, unknown>;
const o = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const lista = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter((x): x is Obj => !!x && typeof x === "object") : []);

/** Os valores DISTINTOS de um campo dos pedidos de compra (a manutenção pode ter vários: "306914/322687 | 306913"). */
function dosPedidos(tx: Obj, campo: string): string | null {
  const vals = [...new Set(lista(tx.purchase_orders).map((p) => texto(p[campo], 120)).filter((x): x is string => !!x))];
  if (vals.length) return vals.join(" | ").slice(0, 400);
  return texto(o(tx.purchase_order)[campo], 400) ?? texto(tx[campo], 400) ?? texto(o(tx.invoice)[campo], 400) ?? texto(o(lista(tx.products)[0]?.purchase_order)[campo], 400);
}

/** O total de um item de manutenção em REAIS (total_price; o total_value antigo vinha em centavos). */
function totalItemManutencao(p: Obj): number {
  const tp = numero(p.total_price);
  if (tp != null) return tp;
  const tv = numero(p.total_value);
  if (tv != null) return tv / 100;
  for (const f of ["cost", "value", "price", "amount", "gross_value", "net_value", "total"]) {
    const n = numero(p[f]);
    if (n != null) return n;
  }
  return 0;
}

function totalManutencao(tx: Obj, itens: Obj[]): number {
  const soma = itens.reduce((s, p) => s + totalItemManutencao(p), 0);
  if (soma > 0) return soma;
  const inv = o(tx.invoice);
  for (const v of [numero(tx.total_price), tx.total_value != null ? (numero(tx.total_value) ?? 0) / 100 : null, numero(tx.amount), numero(inv.total_price), inv.total_value != null ? (numero(inv.total_value) ?? 0) / 100 : null]) {
    if (v != null && v > 0) return v;
  }
  const nf = (numero(inv.product_invoice_value) ?? 0) + (numero(inv.service_invoice_value) ?? 0);
  return nf > 0 ? nf : 0;
}

/**
 * A LINHA de uma transação da Vólus (abastecimento ou manutenção) — `null` quando não dá para identificar a transação
 * (sem id, sem data e sem placa). `chave` = o id da Vólus (a transação ou a ordem); sem ele, uma chave sintética ESTÁVEL
 * (contrato · placa crua · data · total · CNPJ) — a mesma em toda leitura.
 */
export function linhaDaTransacao(tipo: TipoTransacao, contrato: string, tx: Obj): LinhaTransacao | null {
  const card = o(tx.card);
  const op = o(tx.operator);
  const est = o(tx.merchant);
  const end = o(est.address);
  const geo = o(est.geo_location);
  const placaCrua = texto(card.plate, 20) ?? texto(card.prefix, 20);
  const dataHora = dataHoraBrasilia(tipo === "abastecimento" ? tx.refuel_datetime : (tx.transaction_datetime ?? tx.datetime ?? tx.created_at));
  const ref = texto(tipo === "abastecimento" ? tx.id : (tx.order_id ?? tx.id), 80);
  if (!ref && !dataHora && !placaCrua) return null;

  let itens: (string | number | null)[][];
  let produtos: string | null;
  let litros: number | null = null;
  let precoLitro: number | null = null;
  let valor: number;
  if (tipo === "abastecimento") {
    const ps = lista(tx.product).length ? lista(tx.product) : lista(tx.products);
    itens = ps.map((p) => [texto(p.name ?? p.description, 120), numero(p.quantity), numero(p.unit_price), numero(p.total_value ?? p.total_price)]);
    valor = arred(
      ps.reduce((s, p) => s + (numero(p.total_value ?? p.total_price) ?? 0), 0),
      2,
    );
    const q = ps.reduce((s, p) => s + (numero(p.quantity) ?? 0), 0);
    litros = q > 0 ? arred(q, 3) : null;
    precoLitro = q > 0 ? arred(valor / q, 4) : null;
    produtos = [...new Set(ps.map((p) => texto(p.name ?? p.description, 120)).filter(Boolean))].join(", ").slice(0, 300) || null;
  } else {
    const ps = lista(tx.products);
    itens = ps.map((p) => [texto(p.description ?? p.name, 160), numero(p.quantity), numero(p.unit_price), arred(totalItemManutencao(p), 2), texto(p.type ?? p.product_type ?? p.category, 40)]);
    valor = arred(totalManutencao(tx, ps), 2);
    produtos = [...new Set(ps.map((p) => texto(p.description ?? p.name, 160)).filter(Boolean))].join(", ").slice(0, 500) || null;
  }
  const ctx = o(tx.maintenance_context);
  const medidorTexto = tipo === "manutencao" ? texto(ctx.usage_metric, 40) : null;
  const hodometro = tipo === "abastecimento" ? numero(tx.accumulated_distance) : numero(medidorTexto);
  const unidade = o(tx.unit);
  const inv = o(tx.invoice);
  const total = String(valor);
  const chave = ref ? `${contrato}|${ref}` : ["s", contrato, placaCrua ?? "", dataHora ?? "", total, texto(est.cnpj, 20) ?? ""].join("|");
  return {
    tipo,
    chave: chave.slice(0, 200),
    contrato,
    ref_id: ref,
    data_hora: dataHora,
    dia: dataHora ? dataHora.slice(0, 10) : null,
    ano: dataHora ? Number(dataHora.slice(0, 4)) : null,
    placa: normalizarPlaca(placaCrua),
    placa_crua: placaCrua,
    prefixo: texto(card.prefix, 40),
    cartao: texto(card.card_masked, 40),
    marca: texto(card.brand_name, 60),
    modelo: texto(card.model_name, 100),
    ano_fabricacao: (() => {
      const n = numero(card.manufacture_year);
      return n != null && n >= 1900 && n <= 2100 ? Math.trunc(n) : null;
    })(),
    motorista: texto(op.name, 120),
    motorista_cnh: texto(op.license, 40),
    motorista_cpf: texto(op.id_number, 40),
    estabelecimento: texto(est.name, 160),
    estab_cnpj: texto(est.cnpj, 30),
    estab_endereco: texto(end.street, 200),
    estab_bairro: texto(end.district, 100),
    estab_cidade: texto(end.city, 100),
    estab_uf: texto(end.state, 4),
    estab_cep: texto(end.zip_code, 12),
    latitude: numero(geo.latitude),
    longitude: numero(geo.longitude),
    produtos,
    itens: itens.length ? JSON.stringify(itens).slice(0, 20_000) : null,
    qtd_itens: itens.length,
    litros,
    preco_litro: precoLitro,
    valor,
    hodometro: hodometro != null && hodometro >= 0 ? arred(hodometro, 1) : null,
    medidor_texto: medidorTexto,
    km_rodado: tipo === "abastecimento" ? numero(tx.distance_traveled) : null,
    consumo: tipo === "abastecimento" ? numero(tx.average_consumption) : null,
    tipo_manutencao: tipo === "manutencao" ? texto(ctx.maintenance_type, 80) : null,
    nota_fiscal: texto(tx.fiscal_document, 80),
    nf_produtos: texto(inv.product_invoice_number, 80),
    nf_servicos: texto(inv.service_invoice_number, 80),
    valor_nota: numero(inv.total_price),
    faturado: typeof tx.is_billed === "boolean" ? (tx.is_billed ? 1 : 0) : null,
    empenho: dosPedidos(tx, "commitment_number"),
    processo: dosPedidos(tx, "process_number"),
    unidade_nome: texto(unidade.description ?? unidade.name ?? tx.unit_name ?? o(tx.organizational_unit).description ?? o(tx.organizational_unit).name, 160),
    unidade_codigo: texto(unidade.code, 40),
  };
}

/** A tupla da linha (na ordem de `COLUNAS_TRANSACAO`). */
export const tuplaDaLinha = (l: LinhaTransacao) => COLUNAS_TRANSACAO.map((c) => l[c]);

/** A ASSINATURA da linha (FNV-1a de 64 bits sobre a tupla — base36): igual = nada a gravar. */
export function assinaturaLinha(l: LinhaTransacao): string {
  const s = JSON.stringify(tuplaDaLinha(l));
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x9e3779b9;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x01000193) ^ (a >>> 13);
  }
  return (a >>> 0).toString(36) + (b >>> 0).toString(36).padStart(7, "0");
}

/**
 * As linhas de uma RESPOSTA, sem repetir a chave (a repetida no MESMO extrato fica com a última) e só as do período pedido
 * (a Vólus às vezes devolve a borda do dia seguinte — ela é lida no período dela). `fora` = as que caíram fora.
 */
export function linhasDoExtrato(tipo: TipoTransacao, contrato: string, transacoes: Obj[], inicio: string, fim: string): { linhas: LinhaTransacao[]; fora: number; invalidas: number; repetidas: number } {
  const porChave = new Map<string, LinhaTransacao>();
  let fora = 0;
  let invalidas = 0;
  let repetidas = 0;
  for (const tx of transacoes) {
    const l = linhaDaTransacao(tipo, contrato, tx);
    if (!l?.dia) {
      invalidas++;
      continue;
    }
    if ((l.dia as string) < inicio || (l.dia as string) > fim) {
      fora++;
      continue;
    }
    if (porChave.has(l.chave as string)) repetidas++;
    porChave.set(l.chave as string, l);
  }
  return { linhas: [...porChave.values()], fora, invalidas, repetidas };
}

// ─── CONTRATOS E UNIDADES ──────────────────────────────────────────────────────────────────────────────────────

/** A SIGLA de uma unidade da Vólus ("AMT - FISCALIZACAO" → "AMT"; "SECRETARIA DE ACAO URBANA" → "SAU"). */
export function siglaDaUnidade(nome: string | null | undefined): string {
  const s = String(nome ?? "").trim();
  if (!s) return "";
  const antes = s.split(/\s[-–]\s/)[0]?.trim() ?? "";
  if (antes.length <= 8 && antes === antes.toUpperCase() && /[A-Z]/.test(antes)) return antes;
  if (s.length <= 8) return s.toUpperCase();
  const ignora = new Set(["DE", "DA", "DO", "DAS", "DOS", "E"]);
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((w) => w && /^[A-Z]/.test(w) && !ignora.has(w))
    .map((w) => w[0])
    .join("")
    .slice(0, 10);
}

/** A chave de casamento de um texto (sem acento, caixa, pontuação nem espaços) — o vínculo da unidade da Vólus. */
export function chaveTexto(v: string | null | undefined): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}
