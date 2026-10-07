/**
 * NÓS DE DADOS dos fluxos — núcleo PURO (testado em `tests/fluxo-dados.test.ts`): escolher COLUNAS (as da Centi ou de
 * qualquer item), PROCURAR um valor nas linhas de uma tabela (numa coluna ou em todas), a REGRA "se encontrar X grava Y" e
 * as VARIÁVEIS (o estado guardado para terminar laços).
 */
import { comparar, interpolar, type Item, normTexto, numeroDe, resolverCaminho } from "./fluxo-core.ts";

/** A chave de igualdade — a MESMA régua do operador "igual" (número compara como número). */
const chaveIgual = (v: unknown) => {
  const n = numeroDe(v);
  return n != null ? `#${n}` : normTexto(v);
};

// ———————————————————————————————————————————————— colunas

/** Uma linha por coluna: "caminho" ou "caminho => novo nome". */
export type ColunaEscolhida = { de: string; para: string };
export function lerColunas(texto: string): ColunaEscolhida[] {
  const out: ColunaEscolhida[] = [];
  const vistos = new Set<string>();
  for (const l of texto.split(/\n|;/)) {
    const [de, para] = l.split("=>").map((x) => x.trim());
    if (!de) continue;
    const nome = para || de.split(".").pop() || de;
    if (vistos.has(nome)) continue;
    vistos.add(nome);
    out.push({ de, para: nome });
  }
  return out;
}
/** Os itens só com as colunas escolhidas (com o nome novo); `manter` = os outros campos ficam. */
export function escolherColunas(itens: Item[], colunas: ColunaEscolhida[], manter: boolean): Item[] {
  return itens.map((it) => {
    const novo: Item = manter ? { ...it } : {};
    for (const c of colunas) novo[c.para] = resolverCaminho(it, c.de) ?? "";
    return novo;
  });
}

// ———————————————————————————————————————————————— procurar

export type OpcoesProcura = {
  /** O valor procurado ({{campo}} do item que chega). */
  valor: string;
  /** A coluna da tabela (vazia = TODAS as colunas da linha, inclusive as de dentro). */
  coluna: string;
  operador: string;
  /** "primeiro" = a 1ª linha que casa; "todas" = a lista das linhas. */
  resultado: "primeiro" | "todas";
};

/** Os textos de TODAS as colunas de uma linha (objetos de dentro também, até 3 níveis). */
function textosDaLinha(l: unknown, prof = 0, out: unknown[] = []): unknown[] {
  if (l == null || prof > 3) return out;
  if (Array.isArray(l)) for (const x of l) textosDaLinha(x, prof + 1, out);
  else if (typeof l === "object") for (const x of Object.values(l)) textosDaLinha(x, prof + 1, out);
  else out.push(l);
  return out;
}
/** A linha casa o valor procurado (na coluna, ou em qualquer coluna). */
export const linhaCasa = (linha: Item, valor: string, coluna: string, operador: string) =>
  coluna.trim() ? comparar(resolverCaminho(linha, coluna), operador, valor) : textosDaLinha(linha).some((v) => comparar(v, operador, valor));

/**
 * Procura cada item que chega nas linhas da tabela. Encontrado = o item + `encontrado` (a linha, ou a lista em "todas") +
 * `encontrados` (quantas); não encontrado = o item como chegou. Sem itens que chegam, procura o valor como está (um item).
 * Linear na tabela por item (a coluna exata "igual" usa um índice — milhares de linhas × milhares de itens).
 */
export function procurarNaTabela(itens: Item[], tabela: Item[], o: OpcoesProcura): { encontrados: Item[]; naoEncontrados: Item[] } {
  const base = itens.length ? itens : [{}];
  const indice =
    o.coluna.trim() && o.operador === "igual"
      ? (() => {
          const m = new Map<string, Item[]>();
          for (const l of tabela) {
            const k = chaveIgual(resolverCaminho(l, o.coluna));
            m.set(k, [...(m.get(k) ?? []), l]);
          }
          return m;
        })()
      : null;
  const encontrados: Item[] = [];
  const naoEncontrados: Item[] = [];
  for (const it of base) {
    const valor = interpolar(o.valor, it);
    if (!valor.trim()) {
      naoEncontrados.push(it);
      continue;
    }
    const casam = indice ? (indice.get(chaveIgual(valor)) ?? []) : tabela.filter((l) => linhaCasa(l, valor, o.coluna, o.operador));
    if (!casam.length) naoEncontrados.push(it);
    else encontrados.push({ ...it, encontrado: o.resultado === "todas" ? casam : casam[0], encontrados: casam.length });
  }
  return { encontrados, naoEncontrados };
}

// ———————————————————————————————————————————————— regra (se encontrar X, grava Y)

export type Regra = { se: string; grava: string };
/** Uma regra por linha: "X => Y" (Y aceita {{campo}}). */
export const lerRegras = (texto: string): Regra[] =>
  texto
    .split("\n")
    .map((l) => l.split("=>"))
    .filter((p) => p.length >= 2 && p[0].trim())
    .map((p) => ({ se: p[0].trim(), grava: p.slice(1).join("=>").trim() }));

export type OpcoesRegra = {
  origem: string;
  regras: Regra[];
  operador: string;
  /** Sem regra que case: "valor" = o próprio valor; "fixo" = `senaoValor`; "vazio"; "manter" = não mexe no destino. */
  senao: "valor" | "fixo" | "vazio" | "manter";
  senaoValor: string;
  destino: string;
};
/** O valor que cada item grava no destino: a 1ª regra que casa (na ordem), senão o "senão". Marca `regra` (qual casou). */
export function aplicarRegra(itens: Item[], o: OpcoesRegra): Item[] {
  const destino = o.destino.trim() || "valor";
  return itens.map((it) => {
    const v = resolverCaminho(it, o.origem);
    const r = o.regras.find((x) => comparar(v, o.operador, interpolar(x.se, it)));
    if (r) return { ...it, [destino]: interpolar(r.grava, it), regra: r.se };
    if (o.senao === "manter") return { ...it, regra: "" };
    const valor = o.senao === "valor" ? (v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v)) : o.senao === "fixo" ? interpolar(o.senaoValor, it) : "";
    return { ...it, [destino]: valor, regra: "" };
  });
}

// ———————————————————————————————————————————————— variáveis

export type AcaoVariavel = "definir" | "somar" | "contar" | "acrescentar" | "ler" | "limpar";
/** O valor novo da variável. `definir` = o texto (número quando é número); `somar` = Σ do valor de cada item; `contar` =
 * + nº de itens; `acrescentar` = a lista + o valor de cada item (até 5000); `limpar` = vazio. */
export function operarVariavel(atual: unknown, acao: AcaoVariavel, valor: string, itens: Item[]): unknown {
  const num = (x: unknown) => {
    const n = Number(String(x ?? "").replace(/\./g, "").replace(",", "."));
    return typeof x === "number" ? x : Number.isFinite(n) ? n : 0;
  };
  const base = itens.length ? itens : [{}];
  switch (acao) {
    case "definir": {
      const t = interpolar(valor, base[0]);
      return t.trim() !== "" && Number.isFinite(Number(t)) ? Number(t) : t;
    }
    case "somar":
      return num(atual) + base.reduce((s, it) => s + num(interpolar(valor, it)), 0);
    case "contar":
      return num(atual) + itens.length;
    case "acrescentar":
      return [...(Array.isArray(atual) ? atual : []), ...base.map((it) => interpolar(valor, it))].slice(-5000);
    case "limpar":
      return "";
    default:
      return atual;
  }
}
