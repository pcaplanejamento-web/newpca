/**
 * A LEITURA FRAGMENTADA da resposta da Centi — o núcleo PURO (testado em `tests/fragmentos-centi.test.ts`) da atualização
 * AUTOMÁTICA (sem navegador). Ler e consertar o JSON da Centi custa ~20 ms de CPU por MB (medido) e o plano GRATUITO do
 * Worker dá ~10 ms por execução; o mês de pagamentos de um órgão grande chega a vários MB e não se divide (a Centi só
 * recorta por mês). Então a resposta é guardada CRUA em fragmentos e lida uma JANELA por execução:
 *  - a janela de `JANELA` caracteres é cortada no fim do ÚLTIMO registro completo (o "},\r\n  {" da Centi — com a busca
 *    genérica "} , {" de reserva); o pedaço do registro que ficou vai para a próxima janela (`resto`) — nada se perde;
 *  - a resposta que vem como TEXTO com o JSON dentro ("[\r\n {…") é desfeita na própria janela (`JSON.parse` nativo de um
 *    trecho — nunca no meio de um escape);
 *  - um registro maior que a janela simplesmente acumula no `resto` até o fim dele aparecer (até `MAX_RESTO`).
 * Cada janela vira a lista "[…]" que as MESMAS funções `lerPagina*` leem.
 */

/** Caracteres de UMA janela (~1–3 ms de CPU para ler, consertar e normalizar; ~6 ms no pior caso, com o JIT frio — medido). */
export const JANELA = 80_000;
/** Execuções seguidas que pegaram a leitura SEM avançar (a cortada pelo limite de CPU do Worker não grava nada — só a
 * tentativa contada antes do trabalho) até a leitura ser descartada com o erro (a espera e a desistência de sempre). */
export const MAX_TENTATIVAS_LEITURA = 6;
/** A janela da tentativa: a cada execução que não avançou, a METADE (até 1/8) — o trecho pesado demais encolhe até caber. */
export const janelaDaTentativa = (tentativa: number): number => JANELA >> Math.min(Math.max(0, tentativa - 1), 3);
/** Teto do pedaço de registro carregado entre as janelas (um registro maior que isso não é da Centi). */
export const MAX_RESTO = 1_000_000;

export type FormaResposta = "lista" | "texto";

export type EstadoJanela = { pos: number; tamanho: number; forma: FormaResposta | null; resto: string };

export type ResultadoJanela =
  | { ok: true; registros: string | null; estado: EstadoJanela; fim: boolean }
  | { ok: false; erro: string };

const ehEspaco = (c: number) => c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d || c === 0xfeff;

/** O fim do último registro completo do texto (o índice do "}" que o fecha) e onde começa o próximo ("{") — ou null. */
export function ultimoCorte(t: string): { fecha: number; abre: number } | null {
  for (const m of ["},\r\n  {", "},\n  {"]) {
    const i = t.lastIndexOf(m);
    if (i >= 0) return { fecha: i, abre: i + m.length - 1 };
  }
  // Reserva (JSON sem a indentação da Centi): o último "} , {" seguido de uma chave.
  const re = /\}\s*,\s*\{(?=\s*")/g;
  let ultimo: RegExpExecArray | null = null;
  for (let m = re.exec(t); m; m = re.exec(t)) ultimo = m;
  return ultimo ? { fecha: ultimo.index, abre: ultimo.index + ultimo[0].length - 1 } : null;
}

/**
 * Processa UMA janela crua (os caracteres [pos, pos + bruto.length) da resposta): devolve a lista "[…]" dos registros
 * completos (ou null, se nenhum terminou nesta janela) e o estado para a próxima. Na última janela, o que sobrou fecha a lista.
 */
export function processarJanela(estado: EstadoJanela, bruto: string): ResultadoJanela {
  let t = bruto;
  let consumidos = bruto.length;
  let forma = estado.forma;
  const ultimaBruta = estado.pos + bruto.length >= estado.tamanho;
  if (forma == null) {
    // O começo da resposta: a lista ("[") ou o TEXTO com o JSON dentro ('"[').
    let i = 0;
    while (i < t.length && ehEspaco(t.charCodeAt(i))) i++;
    if (t[i] === '"') forma = "texto";
    else if (t[i] === "[") forma = "lista";
    else return { ok: false, erro: `A resposta da Centi não é uma lista — começa com: ${t.slice(i, i + 120).replace(/\s+/g, " ") || "(vazio)"}` };
    t = t.slice(forma === "texto" ? i + 1 : i);
  }
  if (forma === "texto") {
    if (ultimaBruta) {
      t = t.replace(/[\s﻿]+$/, "");
      if (t.endsWith('"')) t = t.slice(0, -1);
    } else {
      // Nunca corta no meio de um escape: as barras do fim, se ímpares, ficam para a próxima janela (com o caractere
      // escapado); e um \uXXXX incompleto também.
      let barras = 0;
      while (barras < t.length && t.charCodeAt(t.length - 1 - barras) === 0x5c) barras++;
      let tirar = barras % 2;
      const u = t.slice(-6).lastIndexOf("\\u");
      if (!tirar && u >= 0) {
        const ini = t.length - 6 + u;
        let b = 0;
        while (ini - 1 - b >= 0 && t.charCodeAt(ini - 1 - b) === 0x5c) b++;
        if (b % 2 === 0 && t.length - ini < 6) tirar = t.length - ini;
      }
      if (tirar) {
        t = t.slice(0, t.length - tirar);
        consumidos -= tirar;
      }
    }
    try {
      t = JSON.parse(`"${t}"`) as string;
    } catch {
      return { ok: false, erro: "A resposta da Centi (texto com o JSON dentro) tem um trecho inválido." };
    }
  }
  let texto = estado.resto + t;
  if (estado.forma == null) {
    // A 1ª janela: tira o "[" da lista (no TEXTO, ele vem depois da aspa).
    const i = texto.search(/\S/);
    if (i < 0 || texto[i] !== "[") return { ok: false, erro: `A resposta da Centi não é uma lista — começa com: ${texto.slice(0, 120).replace(/\s+/g, " ") || "(vazio)"}` };
    texto = texto.slice(i + 1);
  }
  const pos = estado.pos + consumidos;
  const fim = pos >= estado.tamanho;
  if (fim) {
    const corpo = texto.replace(/[\s﻿]+$/, "");
    if (!corpo.endsWith("]")) return { ok: false, erro: "A resposta da Centi terminou no meio da lista (incompleta)." };
    return { ok: true, registros: `[${corpo.slice(0, -1)}]`, estado: { pos, tamanho: estado.tamanho, forma, resto: "" }, fim: true };
  }
  const c = ultimoCorte(texto);
  if (!c) {
    if (texto.length > MAX_RESTO) return { ok: false, erro: "Um registro da Centi passa de 1 MB — a resposta não está no formato esperado." };
    return { ok: true, registros: null, estado: { pos, tamanho: estado.tamanho, forma, resto: texto }, fim: false };
  }
  return { ok: true, registros: `[${texto.slice(0, c.fecha + 1)}]`, estado: { pos, tamanho: estado.tamanho, forma, resto: texto.slice(c.abre) }, fim: false };
}

/**
 * Tira das linhas de uma janela as que já vieram numa janela ANTERIOR da mesma resposta (a Centi às vezes repete um
 * registro; a leitura inteira o conta como repetido — a fragmentada também). `vistas` = as chaves já vistas, uma por linha.
 */
export function semRepetidos<L extends { chave: string }>(vistas: string, linhas: readonly L[]): { linhas: L[]; repetidos: number; vistas: string } {
  const ja = new Set(vistas ? vistas.split("\n") : []);
  const novas: L[] = [];
  for (const l of linhas) {
    if (ja.has(l.chave)) continue;
    ja.add(l.chave);
    novas.push(l);
  }
  const acrescentar = novas.map((l) => l.chave).join("\n");
  return { linhas: novas, repetidos: linhas.length - novas.length, vistas: acrescentar ? (vistas ? `${vistas}\n${acrescentar}` : acrescentar) : vistas };
}

// ---------------------------------------------------------------------------------------------------------------
// A CAPTURA: a resposta grande é baixada de novo a cada execução e só a FAIXA seguinte (~1 MB) é convertida em texto e
// guardada (converter bytes em texto custa ~3 ms por MB — medido). A CAUDA (os últimos bytes da faixa anterior) confere
// que a Centi devolveu a MESMA resposta; se mudou no meio, a captura recomeça.
// ---------------------------------------------------------------------------------------------------------------

/** Bytes capturados por execução. */
export const BYTES_CAPTURA = 1_000_000;
/** O fragmento da tentativa (a mesma régua da janela: a metade a cada execução que não avançou, até 1/8). */
export const capturaDaTentativa = (tentativa: number): number => BYTES_CAPTURA >> Math.min(Math.max(0, tentativa - 1), 3);
/** Bytes da cauda conferida entre as execuções. */
export const TAM_CAUDA = 32;
/** Recomeços da captura (a Centi mudando a resposta no meio) antes de desistir da página. */
export const MAX_REINICIOS = 3;

/**
 * O maior corte ≤ n que não cai no meio de um caractere UTF-8 (o byte do corte não é de continuação, 10xxxxxx). No FIM do
 * buffer (o fragmento capturado acaba onde a faixa acabou) confere se o último caractere veio inteiro — senão o corte
 * fica antes dele (o resto vem no próximo fragmento): um "ç" partido viraria "\uFFFD" e mudaria a chave do registro.
 */
export function corteUtf8(bytes: Uint8Array, n: number): number {
  if (n >= bytes.length) {
    const fim = bytes.length;
    for (let k = 1; k <= 3 && k <= fim; k++) {
      const b = bytes[fim - k];
      if ((b & 0xc0) === 0x80) continue;
      const tamanho = b >= 0xf0 ? 4 : b >= 0xe0 ? 3 : b >= 0xc0 ? 2 : 1;
      return tamanho > k ? fim - k : fim;
    }
    return fim;
  }
  let m = n;
  while (m > 0 && n - m < 4 && (bytes[m] & 0xc0) === 0x80) m--;
  return m;
}

/** Os bytes em hexadecimal (a cauda). */
export function hexDe(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

/** A janela [pos, pos + n) a partir dos pedaços dos fragmentos que a cobrem (`ini` = o início do fragmento; `texto` =
 * o fragmento a partir de `max(0, pos - ini)`). */
export function janelaDosPedacos(pos: number, n: number, pedacos: readonly { ini: number; texto: string }[]): string {
  let t = "";
  for (const p of [...pedacos].sort((a, b) => a.ini - b.ini)) {
    const de = Math.max(pos, p.ini);
    if (de - pos !== t.length) break;
    t += p.texto;
    if (t.length >= n) break;
  }
  return t.slice(0, n);
}
