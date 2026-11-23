/**
 * LER DO SISTEMA (puro, testado em `tests/fluxo-ler-sistema.test.ts`): o nó que IDENTIFICA protocolos, DFDs e itens do
 * sistema — tudo (Geral) ou um recorte (Específico: os DFDs de um protocolo, os itens de um DFD, um produto…) — e os
 * entrega em LISTA ou UM POR VEZ (iterador com a porta "volta", como o Laço).
 */
import { interpolar, type Item } from "./fluxo-core.ts";
import { filtrarDfdsPelaTabela } from "./dfd-colunas-valor.ts";
import { dadosDfdDoItem, type TipoItemMesa, tipoDosItens } from "./fluxo-tipo-item.ts";
import type { FiltroValor } from "./tabela-filtros.ts";

export type ObjetoLeitura = "protocolos" | "dfds" | "itens";
/** Por onde o recorte é feito ("todos" = Geral). */
export const BUSCAS: Record<ObjetoLeitura, { valor: string; rotulo: string }[]> = {
  protocolos: [
    { valor: "todos", rotulo: "Todos (geral)" },
    { valor: "tabela", rotulo: "Os filtrados na tabela" },
    { valor: "numero", rotulo: "Nº do protocolo" },
    { valor: "id", rotulo: "Id do protocolo (capa)" },
  ],
  // O "Nº de planejamento" é o campo de "Os filtrados na tabela" (o mesmo filtro da coluna Nº Plan.) — sem opção própria.
  // O salvo antigo `buscaDfds: "planejamento"` segue valendo (`buscaDoNo`).
  dfds: [
    { valor: "todos", rotulo: "Todos (geral)" },
    { valor: "tabela", rotulo: "Os filtrados na tabela" },
    { valor: "numero", rotulo: "Nº do DFD" },
    { valor: "protocolo", rotulo: "Do protocolo (nº ou Id)" },
  ],
  itens: [
    { valor: "todos", rotulo: "Todos (geral)" },
    { valor: "tabela", rotulo: "Os filtrados na tabela" },
    { valor: "planejamento", rotulo: "Do DFD (nº de planejamento)" },
    { valor: "dfd", rotulo: "Do DFD (nº do DFD)" },
    { valor: "protocolo", rotulo: "Do protocolo (nº ou Id)" },
    { valor: "produto", rotulo: "Produto (código)" },
  ],
};

/**
 * "Os filtrados na tabela": a leitura traz TUDO e a automação segue só com o que passa nos filtros da tabela ao lado (a
 * aba do nó). Na config do nó: `filtrados` (os ids que passavam em TODOS os filtros da tabela quando ela foi vista; sem
 * filtro, ausente = todos) com `filtradosCom` (o campo "Nº de planejamento" daquele momento) e `planejamentos` (o campo —
 * o MESMO filtro da coluna Nº Plan.). A tabela é a verdade: com os ids do mesmo campo, valem eles; sem eles (o campo
 * mudou sem a tabela à vista), vale o campo.
 */
export const BUSCA_TABELA = "tabela";

/** Os números de planejamento do campo (sem repetir, só os dígitos antes da barra, sem zeros à esquerda). */
export const planejamentosDoCampo = (texto: unknown): string[] => valoresProcurados(String(texto ?? "").replace(/\s+/g, ":"), []);

/**
 * O recorte de "Os filtrados na tabela" sobre o que foi lido AGORA. Nos DFDs, os FILTROS gravados (`filtrosTabela`) são
 * reaplicados com a régua da planilha (`filtrarDfdsPelaTabela`) — o DFD que passou a divergir entra, o corrigido sai, a
 * execução agendada segue o filtro — e o campo "Nº de planejamento" (o filtro da coluna Nº Plan.) também. Só quando algum
 * filtro é de uma coluna sem régua (ou em protocolos/itens) vale a reserva: os ids vistos na tabela com o mesmo campo.
 */
export function filtrarPelaTabela(itens: Item[], c: Record<string, unknown>, objeto: ObjetoLeitura): Item[] {
  const campo = objeto === "dfds" ? String(c.planejamentos ?? "") : "";
  const filtros = c.filtrosTabela && typeof c.filtrosTabela === "object" && !Array.isArray(c.filtrosTabela) ? (c.filtrosTabela as Record<string, FiltroValor>) : {};
  const plan = new Set(planejamentosDoCampo(campo));
  const pelaColuna = plan.size ? itens.filter((it) => plan.has(chaveNum(it.planejamento))) : itens;
  if (objeto === "dfds") {
    const vivos = filtrarDfdsPelaTabela(
      pelaColuna.map((it) => ({ ...dadosDfdDoItem(it), it })),
      filtros,
    );
    if (vivos) return vivos.map((x) => x.it);
  }
  if (Array.isArray(c.filtrados) && String(c.filtradosCom ?? "") === campo) {
    const ids = new Set(c.filtrados.map(String));
    return itens.filter((it) => ids.has(String(it.id)));
  }
  return pelaColuna;
}

/** As fontes já carregadas (cada uma lida UMA vez por execução). */
export type FontesSistema = { protocolos: Item[]; dfds: Item[]; itens: Item[] };

/** O número comparável: só os dígitos ANTES da barra, sem zeros à esquerda ("0144756/2026" → "144756"). */
const chaveNum = (v: unknown) => String(v ?? "").split("/")[0].replace(/\D/g, "").replace(/^0+(?=\d)/, "");
/** O ano depois da barra ("200/2026" → "2026"); sem ele, "". */
const anoDe = (v: unknown) => {
  const a = String(v ?? "").split("/")[1]?.trim() ?? "";
  return /^\d{4}$/.test(a) ? a : "";
};
/** O valor procurado com o ano, quando há ("0200/2026" → "200/2026"). */
const chaveProcura = (v: unknown) => (chaveNum(v) && anoDe(v) ? `${chaveNum(v)}/${anoDe(v)}` : chaveNum(v));
/** Casa pelo número e, quando os DOIS lados têm ano, pelo ano também (200/2025 ≠ 200/2026). */
function casaNumero(valores: Iterable<string>): (v: unknown) => boolean {
  const anos = new Map<string, Set<string>>();
  for (const x of valores) {
    const n = chaveNum(x);
    if (!n) continue;
    const s = anos.get(n) ?? new Set<string>();
    s.add(anoDe(x));
    anos.set(n, s);
  }
  return (v) => {
    const s = anos.get(chaveNum(v));
    const a = anoDe(v);
    return !!s && (!a || s.has("") || s.has(a));
  };
}

/** Os valores procurados: o texto do campo (vários por ";", ":" ou ","), com {{campo}} trocado pelo dado de CADA item que
 * chega; sem item que chega, o texto como está. */
export function valoresProcurados(valor: string, entrada: Item[]): string[] {
  const textos = /\{\{/.test(valor) ? (entrada.length ? entrada : [{}]).map((it) => interpolar(valor, it)) : [valor];
  const vals = textos.flatMap((t) => t.split(/[;:,\n]/)).map(chaveProcura).filter(Boolean);
  return [...new Set(vals)];
}

/** A busca efetiva: com {{campo}} que NENHUM item que chega preenche (execução avulsa — o Início entrega um item sem
 * o campo —, a prévia da seleção), lê TODOS: a seleção mostra tudo e o usuário escolhe; com o campo nos itens (ex.: os
 * DFDs da Mesa), filtra pelo valor. Valor fixo vazio = `null` (erro). */
export function buscaEfetiva(busca: string, valor: string, valores: string[]): string | null {
  if (busca === "todos" || busca === BUSCA_TABELA || valores.length) return busca;
  return /\{\{/.test(valor) ? "todos" : null;
}

/** Os itens do recorte, na ordem da fonte (sem repetir). `todos` ignora os valores. */
export function lerDoSistema(f: FontesSistema, objeto: ObjetoLeitura, pedida: string, valores: string[]): Item[] {
  // "Os filtrados na tabela" lê TUDO: o recorte é o filtro da tabela (`filtrarPelaTabela`), aplicado depois.
  const busca = pedida === BUSCA_TABELA ? "todos" : pedida;
  const tem = casaNumero(valores);
  const protoQuer = (p: Item) => tem(p.numero) || tem(p.idExterno);
  if (objeto === "protocolos") {
    if (busca === "todos") return f.protocolos;
    return f.protocolos.filter((p) => (busca === "id" ? tem(p.idExterno) : tem(p.numero)));
  }
  if (objeto === "dfds") {
    if (busca === "todos") return f.dfds;
    if (busca === "protocolo") {
      const nums = new Set(f.protocolos.filter(protoQuer).flatMap((p) => (Array.isArray(p.dfds) ? p.dfds : []).map((d) => chaveNum((d as Item).numero))));
      return f.dfds.filter((d) => nums.has(chaveNum(d.numero)) || protoQuer({ numero: d.protocolo, idExterno: d.protocoloIdExterno }));
    }
    return f.dfds.filter((d) => tem(busca === "numero" ? d.numero : d.planejamento));
  }
  if (busca === "todos") return f.itens;
  if (busca === "produto") return f.itens.filter((i) => tem(i.codigo));
  if (busca === "dfd") return f.itens.filter((i) => tem(i.dfdNumero));
  if (busca === "planejamento") return f.itens.filter((i) => tem(i.dfdPlanejamento));
  const doProto = casaNumero(f.protocolos.filter(protoQuer).map((p) => String(p.numero ?? "")));
  return f.itens.filter((i) => doProto(i.protocoloNumero));
}

/** A porta "fim": os itens marcados `executado` (o fim do laço) — sem nenhum, um marcador só. */
export const marcarExecutado = (itens: Item[], total: number): Item[] =>
  (itens.length ? itens : [{}]).map((it) => ({ ...it, executado: true, totalLido: total }));

/** O TIPO de item que cada leitura entrega (a régua da tabela da Mesa). */
export const TIPO_DO_OBJETO: Record<ObjetoLeitura, TipoItemMesa> = { protocolos: "protocolo", dfds: "dfd", itens: "item" };

/** A busca ESCOLHIDA no nó (o campo "Quais" do objeto). */
export function buscaDoNo(c: Record<string, unknown>): { objeto: ObjetoLeitura; busca: string } {
  const objeto = (String(c.objeto ?? "dfds") as ObjetoLeitura) in BUSCAS ? (String(c.objeto ?? "dfds") as ObjetoLeitura) : "dfds";
  const v = objeto === "protocolos" ? c.buscaProtocolos : objeto === "dfds" ? c.buscaDfds : c.buscaItens;
  const busca = String(v ?? "") || "todos";
  // O salvo antigo "Nº de planejamento" com valor FIXO = os filtrados na tabela pelo campo (`configDaLeitura`).
  if (objeto === "dfds" && busca === "planejamento" && !/\{\{/.test(String(c.valor ?? ""))) return { objeto, busca: BUSCA_TABELA };
  return { objeto, busca };
}

/** A config efetiva do "Ler do sistema": o valor procurado só com uma busca que o usa (escondido, um valor velho não
 * restringe nada) e o salvo antigo "Nº de planejamento" fixo levado ao campo da tabela. */
export function configDaLeitura(c: Record<string, unknown>): Record<string, unknown> {
  const { objeto, busca } = buscaDoNo(c);
  const legado = objeto === "dfds" && String(c.buscaDfds ?? "") === "planejamento" && busca === BUSCA_TABELA;
  if (legado) return { ...c, buscaDfds: BUSCA_TABELA, planejamentos: String(c.planejamentos ?? "") || String(c.valor ?? ""), valor: "", filtrados: undefined, filtradosCom: undefined };
  return busca === "todos" || busca === BUSCA_TABELA ? { ...c, valor: "" } : c;
}

/**
 * Os itens que chegam DE FORA (a Mesa, ou "Executar com os selecionados") restringem a leitura sem valor procurado: se
 * são do MESMO tipo que o nó lê, só eles seguem (pelo id). De outro tipo, ou sem itens de fora, nada muda.
 */
export function restringirPelaEntrada(lidos: Item[], entrada: unknown, objeto: ObjetoLeitura, daMesa = false): Item[] {
  const itens = Array.isArray(entrada) ? (entrada as Item[]) : [];
  // A MESA sempre manda DFDs (pelo id): o recorte vale mesmo com um DFD sem nº de planejamento (que não seria
  // reconhecido como DFD) — senão a automação leria TODOS os DFDs do sistema.
  const mesaDfds = daMesa && objeto === "dfds" && itens.length > 0;
  if (!itens.length || (!mesaDfds && tipoDosItens(itens) !== TIPO_DO_OBJETO[objeto])) return lidos;
  const ids = new Set(itens.map((it) => String(it.id)));
  return lidos.filter((it) => ids.has(String(it.id)));
}

/** As OPÇÕES do valor procurado: os valores que existem no sistema para a busca escolhida (sem repetir, com um rótulo). */
export function opcoesDaBusca(f: FontesSistema, objeto: ObjetoLeitura, busca: string): { valor: string; rotulo: string }[] {
  const m = new Map<string, string>();
  const por = (v: unknown, rotulo: string) => {
    const k = String(v ?? "").trim();
    if (k && !m.has(k)) m.set(k, rotulo);
  };
  const t = (v: unknown) => String(v ?? "").trim();
  if (busca === "protocolo" || (objeto === "protocolos" && busca !== "todos")) {
    for (const p of f.protocolos) {
      if (busca === "id") por(p.idExterno, `Id ${t(p.idExterno)} · Protocolo ${t(p.numero)}`);
      else por(p.numero, `Protocolo ${t(p.numero)}${t(p.assunto) ? ` · ${t(p.assunto)}` : ""}`);
    }
  } else if (objeto === "dfds") {
    for (const d of f.dfds) {
      if (busca === "numero") por(d.numero, `DFD ${t(d.numero)} · Planej. ${t(d.planejamento) || "—"}${t(d.sigla) ? ` · ${t(d.sigla)}` : ""}`);
      else por(d.planejamento, `Planej. ${t(d.planejamento)} · DFD ${t(d.numero)}${t(d.sigla) ? ` · ${t(d.sigla)}` : ""}`);
    }
  } else if (objeto === "itens") {
    for (const i of f.itens) {
      if (busca === "produto") por(i.codigo, `${t(i.codigo)} · ${t(i.descricao).slice(0, 80)}`);
      else if (busca === "dfd") por(i.dfdNumero, `DFD ${t(i.dfdNumero)} · Planej. ${t(i.dfdPlanejamento) || "—"}`);
      else por(i.dfdPlanejamento, `Planej. ${t(i.dfdPlanejamento)} · DFD ${t(i.dfdNumero)}`);
    }
  }
  return [...m.entries()].map(([valor, rotulo]) => ({ valor, rotulo }));
}
