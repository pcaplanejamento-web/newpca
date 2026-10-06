/**
 * CHAT AO VIVO — núcleo PURO (sem env/DOM → testável e usado pelo Durable Object do grupo, pela rota do privado e pela
 * tela). Regra do usuário: as conversas são SÓ AO VIVO — nada é gravado (nem banco, nem storage do objeto); a mensagem
 * existe só nas abas abertas enquanto estão abertas.
 */

/** A configuração do ADM (blob `configuracoes`, chave `chat`). Desligado por padrão. */
export type ConfigChat = { grupo: boolean; privado: boolean };
export const CONFIG_CHAT_PADRAO: ConfigChat = { grupo: false, privado: false };

export function lerConfigChat(v: unknown): ConfigChat {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  return { grupo: o.grupo === true, privado: o.privado === true };
}

export const chatLigado = (c: ConfigChat) => c.grupo || c.privado;

/** Tetos: texto da mensagem, trecho da resposta citada, mensagens por minuto por aba/pessoa e o "digitando". */
export const MAX_TEXTO_CHAT = 2000;
export const MAX_TRECHO_RESPOSTA = 140;
export const MSGS_POR_MINUTO = 30;
export const INTERVALO_DIGITANDO_MS = 3000;
/** Quanto tempo o "Ana está digitando…" fica sem um novo aviso. */
export const DIGITANDO_DURA_MS = 5000;
/** Mensagens guardadas na memória da aba por conversa (as mais antigas saem). */
export const MAX_MSGS_NA_TELA = 300;

/** A conversa: a do grupo ativo, a privada com uma pessoa (`p<id>`) ou uma CONVERSA EM GRUPO escolhida (`c<id>` — 2 a 20
 * pessoas, criada na aba; existe só enquanto alguém dela está com o sistema aberto). */
export type Conversa = "grupo" | `p${number}` | `c${string}`;
export const conversaPrivada = (id: number): Conversa => `p${id}`;
export function idDaConversa(c: string): number | null {
  const m = /^p(\d{1,9})$/.exec(c);
  return m ? Number(m[1]) : null;
}
/** É uma conversa em grupo escolhida (`c<id>`)? */
export const ehConversaEmGrupo = (c: unknown): c is `c${string}` => typeof c === "string" && /^c[a-z0-9]{6,20}$/.test(c);
export const conversaValida = (c: unknown): c is Conversa => c === "grupo" || ehConversaEmGrupo(c) || (typeof c === "string" && idDaConversa(c) != null);
/** Pessoas numa conversa em grupo (com você) e o tamanho do nome. */
export const MAX_MEMBROS_CONVERSA = 20;
export const MAX_NOME_CONVERSA = 60;
/** Um id novo de conversa em grupo (na aba). */
export function novaConversaEmGrupo(aleatorio: () => number = Math.random): `c${string}` {
  let s = "";
  while (s.length < 12) s += Math.floor(aleatorio() * 36).toString(36);
  return `c${s}`;
}
/** Os ids das pessoas (inteiros positivos, sem repetir, até o teto) — `null` se não é uma lista. */
export function lerIds(v: unknown, max = MAX_MEMBROS_CONVERSA): number[] | null {
  if (!Array.isArray(v)) return null;
  return [...new Set(v.filter((x): x is number => Number.isInteger(x) && (x as number) > 0))].slice(0, max);
}
/** O nome da conversa em grupo numa linha, até 60 (vazio = sem nome). */
export const limparNomeConversa = (v: unknown) =>
  typeof v === "string"
    ? v
        .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, MAX_NOME_CONVERSA)
    : "";

/** O id da mensagem (gerado na aba — liga o envio à confirmação). */
export const idMensagemValido = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{8,40}$/.test(v);

/** O texto limpo: sem controles/invisíveis (a quebra de linha fica, no máximo 2 seguidas), sem espaço nas pontas, até o
 * teto. Vazio = `null` (não se envia). */
export function limparTextoChat(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v
    .replace(/\r\n?/g, "\n")
    .replace(/[\p{Cf}\p{Zl}\p{Zp}]/gu, "")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\p{Cc}/gu, (c) => (c === "\n" ? c : ""))
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_TEXTO_CHAT);
  return t ? t : null;
}

/** A resposta citada: a mensagem a que se responde (id + autor + o começo do texto). */
export type RespostaChat = { id: string; de: number; trecho: string };
export function lerResposta(v: unknown): RespostaChat | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (!idMensagemValido(o.id) || !Number.isInteger(o.de)) return null;
  const trecho = limparTextoChat(o.trecho)?.replace(/\n/g, " ").slice(0, MAX_TRECHO_RESPOSTA) ?? "";
  return { id: o.id, de: o.de as number, trecho };
}

/** As mensagens que a ABA manda pelo socket do GRUPO (além das de presença). */
export type MensagemChatAba =
  | { t: "msg"; id: string; texto: string; resp: RespostaChat | null }
  | { t: "digitando"; conversa: Conversa; para?: number[] }
  | { t: "lida"; conversa: Conversa; ate: string; para?: number[] };

export function lerMensagemChatAba(msg: unknown): MensagemChatAba | null {
  if (typeof msg !== "string" || msg.length > MAX_TEXTO_CHAT * 3) return null;
  let o: Record<string, unknown>;
  try {
    const v = JSON.parse(msg);
    if (!v || typeof v !== "object") return null;
    o = v as Record<string, unknown>;
  } catch {
    return null;
  }
  if (o.t === "msg") {
    const texto = limparTextoChat(o.texto);
    return idMensagemValido(o.id) && texto ? { t: "msg", id: o.id, texto, resp: lerResposta(o.resp) } : null;
  }
  // Na conversa em grupo escolhida, `para` = os outros membros (o servidor entrega só às abas deles neste grupo).
  const para = ehConversaEmGrupo(o.conversa) ? lerIds(o.para, MAX_MEMBROS_CONVERSA - 1) : undefined;
  if (para === null || (para && !para.length)) return null;
  if (o.t === "digitando") return conversaValida(o.conversa) ? { t: "digitando", conversa: o.conversa, ...(para ? { para } : {}) } : null;
  if (o.t === "lida") return conversaValida(o.conversa) && idMensagemValido(o.ate) ? { t: "lida", conversa: o.conversa, ate: o.ate, ...(para ? { para } : {}) } : null;
  return null;
}

/** A janela do limite de mensagens (por aba, no anexo do objeto): pode enviar agora? Devolve a janela nova. */
export function contarNaJanela(janela: { inicio: number; n: number } | undefined, agora: number, max = MSGS_POR_MINUTO): { ok: boolean; janela: { inicio: number; n: number } } {
  const j = janela && agora - janela.inicio < 60_000 ? janela : { inicio: agora, n: 0 };
  if (j.n >= max) return { ok: false, janela: j };
  return { ok: true, janela: { inicio: j.inicio, n: j.n + 1 } };
}

/** A mensagem como chega à tela (do grupo ou privada). `autor` = só no privado (a pessoa pode ser de outro grupo). */
export type MensagemChat = {
  id: string;
  conversa: Conversa;
  de: number;
  em: number;
  texto: string;
  resp: RespostaChat | null;
  autor?: { id: number; nome: string; apelido: string | null; foto: string | null } | null;
  /** Conversa em grupo escolhida: todos os membros (com quem mandou) e o nome dado por quem criou. */
  membros?: number[];
  nome?: string;
};

/** Lê a mensagem que CHEGA (do objeto do grupo ou da caixa pessoal). Inválida = `null`. A conversa do privado é a do
 * ponto de vista de quem recebe (`conversa` já vem certa do servidor). */
export function lerMensagemRecebida(o: Record<string, unknown>): MensagemChat | null {
  const texto = limparTextoChat(o.texto);
  if (!idMensagemValido(o.id) || !texto || !Number.isInteger(o.de) || !Number.isFinite(o.em) || !conversaValida(o.conversa)) return null;
  const a = o.autor && typeof o.autor === "object" ? (o.autor as Record<string, unknown>) : null;
  const autor =
    a && Number.isInteger(a.id) && typeof a.nome === "string"
      ? { id: a.id as number, nome: a.nome.slice(0, 120), apelido: typeof a.apelido === "string" ? a.apelido.slice(0, 40) : null, foto: typeof a.foto === "string" && a.foto.startsWith("/") ? a.foto : null }
      : null;
  const extra = ehConversaEmGrupo(o.conversa) ? { membros: lerIds(o.membros) ?? [], nome: limparNomeConversa(o.nome) } : {};
  return { id: o.id, conversa: o.conversa, de: o.de as number, em: o.em as number, texto, resp: lerResposta(o.resp), autor, ...extra };
}

/** Os LINKS do sistema no texto viram CARTÕES (sem consulta): protocolo/DFD da Mesa, tarefa, PCA. Só caminho interno. */
export type CartaoLink = { tipo: "protocolo" | "dfd" | "tarefa" | "pca"; id: number; href: string; rotulo: string };
const ROTULO_CARTAO: Record<CartaoLink["tipo"], string> = { protocolo: "Protocolo", dfd: "DFD", tarefa: "Tarefa", pca: "PCA" };

export function cartoesDoTexto(texto: string, origem?: string): CartaoLink[] {
  const out: CartaoLink[] = [];
  const vistos = new Set<string>();
  const host = origem ? origem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "[^\\s/]+";
  // O link com o endereço do sistema ou o caminho solto (nunca o caminho dentro do link de OUTRO site).
  const re = new RegExp(`(?:https?://${host}|(?<![\\w./:-]))(/painel/(?:mesa\\?abrir=(protocolo|dfd):(\\d{1,9})|tarefas/abrir/(\\d{1,9})|pca/(\\d{1,9})))(?![\\w/:])`, "g");
  for (const m of texto.matchAll(re)) {
    const tipo = (m[2] as "protocolo" | "dfd" | undefined) ?? (m[4] ? "tarefa" : "pca");
    const id = Number(m[3] ?? m[4] ?? m[5]);
    const chave = `${tipo}:${id}`;
    if (vistos.has(chave) || out.length >= 3) continue;
    vistos.add(chave);
    out.push({ tipo, id, href: m[1], rotulo: `${ROTULO_CARTAO[tipo]} #${id}` });
  }
  return out;
}

/** Um id de mensagem novo (na aba). */
export function novoIdMensagem(aleatorio: () => number = Math.random): string {
  let s = Date.now().toString(36);
  while (s.length < 16) s += Math.floor(aleatorio() * 36).toString(36);
  return s.slice(0, 24);
}

/** "Hoje" · "Ontem" · "06/10" — o separador de dia da conversa (dia de Brasília). */
export function rotuloDiaChat(em: number, agora = Date.now()): string {
  const dia = (t: number) => new Date(t - 3 * 3600_000).toISOString().slice(0, 10);
  const d = dia(em);
  if (d === dia(agora)) return "Hoje";
  if (d === dia(agora - 86_400_000)) return "Ontem";
  return `${d.slice(8, 10)}/${d.slice(5, 7)}`;
}

/** "14:32" (Brasília). */
export const horaChat = (em: number) => new Date(em - 3 * 3600_000).toISOString().slice(11, 16);

/** Junta a mensagem na conversa: a MESMA (pelo id — a confirmação do servidor, o eco das outras abas) atualiza no lugar;
 * nova entra no fim; acima do teto, as mais antigas saem. */
export function juntarMensagem<T extends { id: string }>(lista: readonly T[], m: T, max = MAX_MSGS_NA_TELA): T[] {
  const i = lista.findIndex((x) => x.id === m.id);
  if (i >= 0) {
    const c = [...lista];
    c[i] = { ...c[i], ...m };
    return c;
  }
  const n = [...lista, m];
  return n.length > max ? n.slice(n.length - max) : n;
}

/** Quantas pessoas (fora `autor`) já leram até a mensagem de índice `idx` — pela última mensagem que cada uma marcou como
 * lida (`lidaAte`: pessoa → id da mensagem). Id que não está mais na tela (saiu pelo teto) conta como lida até o fim. */
export function quantosLeram(ids: readonly string[], lidaAte: ReadonlyMap<number, string>, idx: number, autor: number): number {
  let n = 0;
  for (const [quem, ate] of lidaAte) {
    if (quem === autor) continue;
    const j = ids.indexOf(ate);
    if (j >= idx || j < 0) n++;
  }
  return n;
}

/** A @menção que está sendo digitada no fim do texto (antes do cursor) — `null` sem "@" ativo. */
export function mencaoEmCurso(antesDoCursor: string): string | null {
  const m = /(?:^|\s)@([\p{L}\p{N}._-]{0,30})$/u.exec(antesDoCursor);
  return m ? m[1] : null;
}

/** O nome da conversa em grupo: o dado por quem criou ou os primeiros nomes dos outros ("Ana, Bruno e Carla", "+N"). */
export function rotuloConversa(nome: string | undefined, membros: readonly number[], meuId: number, nomeDe: (id: number) => string): string {
  if (nome) return nome;
  const outros = membros.filter((m) => m !== meuId).map(nomeDe);
  if (!outros.length) return "Conversa em grupo";
  if (outros.length <= 3) return outros.length === 1 ? outros[0] : `${outros.slice(0, -1).join(", ")} e ${outros.at(-1)}`;
  return `${outros.slice(0, 2).join(", ")} e mais ${outros.length - 2}`;
}

/** As BOLHAS do chat (estilo Messenger): a conversa aberta/ativada vai para o TOPO da pilha; à vista no máximo `max`, as
 * demais ficam no "+N". */
export const MAX_BOLHAS = 4;
export function abrirBolha<T>(lista: readonly T[], c: T): T[] {
  return [c, ...lista.filter((x) => x !== c)];
}
export function bolhasVisiveis<T>(lista: readonly T[], max = MAX_BOLHAS): { visiveis: T[]; extras: T[] } {
  return { visiveis: lista.slice(0, max), extras: lista.slice(max) };
}

/** Um ponto do arrasto (px e ms) — os últimos dão a VELOCIDADE do arremesso. */
export type AmostraArrasto = { x: number; y: number; t: number };
/** Janela (ms) das amostras que contam para a velocidade e o "empurrão" do arremesso (ms de inércia). */
export const ARREMESSO = { janela: 90, inercia: 260, maxPx: 1600 };
/** A VELOCIDADE (px/ms) no fim do arrasto: das amostras dos últimos `ARREMESSO.janela` ms (parado = 0). */
export function velocidadeArrasto(amostras: readonly AmostraArrasto[]): { vx: number; vy: number } {
  if (amostras.length < 2) return { vx: 0, vy: 0 };
  const fim = amostras[amostras.length - 1];
  const ini = amostras.find((a) => fim.t - a.t <= ARREMESSO.janela) ?? amostras[0];
  const dt = fim.t - ini.t;
  if (dt <= 0 || ini === fim) return { vx: 0, vy: 0 };
  return { vx: (fim.x - ini.x) / dt, vy: (fim.y - ini.y) / dt };
}
/** ARREMESSO: onde a bolha "cairia" com a inércia (o ponto solto + a velocidade × a inércia, até `maxPx`) — um peteleco
 * para o outro lado leva a bolha até lá. */
export function projetarArremesso(x: number, y: number, v: { vx: number; vy: number }): { x: number; y: number } {
  const lim = (n: number) => Math.max(-ARREMESSO.maxPx, Math.min(ARREMESSO.maxPx, n));
  return { x: x + lim(v.vx * ARREMESSO.inercia), y: y + lim(v.vy * ARREMESSO.inercia) };
}

/** O formato ANTIGO (até a v1.16.0, `chat:posicao`): a PILHA inteira numa posição — lido só para a migração. */
export type PosicaoBolhas = { lado: "esq" | "dir"; y: number };
export function lerPosicaoBolhas(v: unknown): PosicaoBolhas {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const y = Number(o.y);
  return { lado: o.lado === "esq" ? "esq" : "dir", y: Number.isFinite(y) ? Math.min(1, Math.max(0, y)) : 1 };
}
/** CADA BOLHA NO SEU LUGAR (v1.17.0): a posição de UMA bolha — o LADO em que encosta, a altura (fração da faixa livre,
 * 0 = topo · 1 = embaixo — resiste a trocar o tamanho da janela) e QUANDO foi mexida por último (a mais recente fica onde
 * está; as outras abrem espaço). A chave é a conversa (e "+" para a bolha das demais). */
export type PosicaoBolha = { lado: "esq" | "dir"; y: number; t: number };
export type PosicoesBolhas = Record<string, PosicaoBolha>;
/** As medidas da tela que importam às bolhas (px): a área livre vai de `topo` a `altura - base`. */
export type TelaBolhas = { largura: number; altura: number; topo: number; base: number; tam: number };
/** O vão entre duas bolhas (px). */
export const VAO_BOLHAS = 10;

function lerUma(v: unknown): PosicaoBolha | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const y = Number(o.y);
  const t = Number(o.t);
  if ((o.lado !== "esq" && o.lado !== "dir") || !Number.isFinite(y)) return null;
  return { lado: o.lado, y: Math.min(1, Math.max(0, y)), t: Number.isFinite(t) ? t : 0 };
}
/** Lê as posições guardadas no aparelho (qualquer coisa inválida some; até 40 bolhas). */
export function lerPosicoesBolhas(v: unknown): PosicoesBolhas {
  const r: PosicoesBolhas = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return r;
  for (const [k, x] of Object.entries(v as Record<string, unknown>).slice(0, 40)) {
    const p = lerUma(x);
    if (p && (k === "+" || conversaValida(k))) r[k] = p;
  }
  return r;
}
/** Do formato ANTIGO (a pilha inteira numa posição): cada bolha aberta ganha o mesmo lado e altura — a arrumação as
 * espalha como uma pilha, na ordem (a 1ª fica no lugar). */
export function migrarPosicoes(antiga: PosicaoBolhas, ordem: readonly string[]): PosicoesBolhas {
  const r: PosicoesBolhas = {};
  ordem.forEach((k, i) => {
    r[k] = { lado: antiga.lado, y: antiga.y, t: ordem.length - i };
  });
  return r;
}

/** O lugar (px) de cada bolha: o lado e o topo. */
export type LugarBolha = { lado: "esq" | "dir"; top: number };
const faixa = (tela: TelaBolhas) => ({ min: tela.topo, max: Math.max(tela.topo, tela.altura - tela.base - tela.tam) });
/** O topo (px) de uma posição. */
export function topoDaPosicao(p: Pick<PosicaoBolha, "y">, tela: TelaBolhas): number {
  const f = faixa(tela);
  return Math.round(f.min + (f.max - f.min) * p.y);
}
/** A esquerda (px) de uma bolha encostada no lado. */
export const esquerdaDoLado = (lado: "esq" | "dir", tela: TelaBolhas, margem = 12) => (lado === "esq" ? margem : tela.largura - margem - tela.tam);

/** ARRUMA as bolhas: cada uma no lugar dela; quando duas se cobrem NO MESMO LADO, a mexida por ÚLTIMO fica e as outras vão
 * ao lugar livre mais perto do desejado (nunca uma sobre a outra, dentro da área livre). A bolha sem posição guardada fica
 * à direita, embaixo (a 1ª da ordem mais embaixo — empilham para cima). Determinística: mesma entrada, mesmo resultado. */
export function arrumarBolhas(posicoes: PosicoesBolhas, ordem: readonly string[], tela: TelaBolhas): Record<string, LugarBolha> {
  const passo = tela.tam + VAO_BOLHAS;
  const f = faixa(tela);
  const itens = ordem.map((k, i) => {
    const p = posicoes[k] ?? { lado: "dir" as const, y: 1, t: -1 - i };
    return { k, i, lado: p.lado, t: p.t, quer: topoDaPosicao(p, tela) };
  });
  // A mais recente primeiro (empate: a que vem antes na ordem).
  itens.sort((a, b) => b.t - a.t || a.i - b.i);
  const r: Record<string, LugarBolha> = {};
  const postos: Record<"esq" | "dir", number[]> = { esq: [], dir: [] };
  for (const it of itens) {
    const ocupados = postos[it.lado];
    const livre = (y: number) => y >= f.min - 0.5 && y <= f.max + 0.5 && ocupados.every((o) => Math.abs(o - y) >= passo - 0.5);
    const quer = Math.min(f.max, Math.max(f.min, it.quer));
    let top = quer;
    if (!livre(quer)) {
      const candidatos = [f.min, f.max, ...ocupados.flatMap((o) => [o - passo, o + passo])].filter(livre);
      // Sem lugar livre (tela baixa demais): fica onde queria.
      if (candidatos.length) top = candidatos.reduce((m, c) => (Math.abs(c - quer) < Math.abs(m - quer) || (Math.abs(c - quer) === Math.abs(m - quer) && c > m) ? c : m));
    }
    ocupados.push(top);
    r[it.k] = { lado: it.lado, top: Math.round(top) };
  }
  return r;
}

/** Soltou a bolha com o CENTRO em `cx` e o TOPO em `topoPx`: encosta no lado mais perto, naquela altura (`agora` = quando). */
export function pousarBolha(cx: number, topoPx: number, tela: TelaBolhas, agora: number): PosicaoBolha {
  const f = faixa(tela);
  const y = f.max <= f.min ? 1 : Math.min(1, Math.max(0, (topoPx - f.min) / (f.max - f.min)));
  return { lado: cx < tela.largura / 2 ? "esq" : "dir", y, t: agora };
}

/** A fração (0..1) da faixa livre para um topo (px) — o inverso de `topoDaPosicao`. */
function fracaoDoTopo(top: number, tela: TelaBolhas): number {
  const f = faixa(tela);
  return f.max <= f.min ? 1 : Math.min(1, Math.max(0, (top - f.min) / (f.max - f.min)));
}

/** O ÍMÃ: até quantos px do ponto "colado" (logo acima ou abaixo de outra bolha do mesmo lado) a bolha é puxada para ele. */
export const RAIO_IMA = (tela: Pick<TelaBolhas, "tam">) => Math.round((tela.tam + VAO_BOLHAS) * 0.6);

/** ÍMÃ: perto de outra bolha do MESMO lado, o topo vai ao ponto COLADO a ela (acima ou abaixo — o mais perto); longe, fica
 * como veio. Preso à área livre. */
export function imaBolha(top: number, lado: "esq" | "dir", chave: string, lugares: Record<string, LugarBolha>, tela: TelaBolhas): number {
  const passo = tela.tam + VAO_BOLHAS;
  const f = faixa(tela);
  const raio = RAIO_IMA(tela);
  let melhor: number | null = null;
  for (const [k, l] of Object.entries(lugares)) {
    if (k === chave || l.lado !== lado) continue;
    for (const c of [l.top - passo, l.top + passo]) {
      if (c < f.min - 0.5 || c > f.max + 0.5) continue;
      if (Math.abs(c - top) <= raio && (melhor == null || Math.abs(c - top) < Math.abs(melhor - top))) melhor = c;
    }
  }
  return melhor ?? Math.min(f.max, Math.max(f.min, top));
}

/** A PRÉVIA de um arrasto (e o resultado de soltar — a MESMA conta): a bolha `chave` com o CENTRO em `cx` e o TOPO em `topo`
 * encosta no lado mais perto, o ímã a cola numa vizinha perto, e as outras abrem espaço (`lugares`). `alvo` = onde ela pousa;
 * `ima` = o ímã agiu. */
export function previaArrasto(
  posicoes: PosicoesBolhas,
  chaves: readonly string[],
  chave: string,
  cx: number,
  topo: number,
  tela: TelaBolhas,
): { posicao: PosicaoBolha; lugares: Record<string, LugarBolha>; alvo: LugarBolha; ima: boolean } {
  const outras = chaves.filter((k) => k !== chave);
  const semEla: PosicoesBolhas = { ...posicoes };
  delete semEla[chave];
  const lugaresOutras = arrumarBolhas(semEla, outras, tela);
  const solta = pousarBolha(cx, topo, tela, Number.MAX_SAFE_INTEGER);
  const topoSolto = topoDaPosicao(solta, tela);
  const topoIma = imaBolha(topoSolto, solta.lado, chave, lugaresOutras, tela);
  const posicao: PosicaoBolha = { ...solta, y: fracaoDoTopo(topoIma, tela) };
  const lugares = arrumarBolhas({ ...posicoes, [chave]: posicao }, chaves, tela);
  return { posicao, lugares, alvo: lugares[chave] ?? { lado: posicao.lado, top: topoIma }, ima: topoIma !== topoSolto };
}

/** Depois de soltar: a posição NOVA da bolha (`t` = agora) e a das que ABRIRAM ESPAÇO (no lugar novo, com o `t` de antes —
 * gravadas para que nada volte pulando depois). */
export function posicoesAposSoltar(
  posicoes: PosicoesBolhas,
  chaves: readonly string[],
  chave: string,
  previa: { posicao: PosicaoBolha; lugares: Record<string, LugarBolha> },
  tela: TelaBolhas,
  agora: number,
): PosicoesBolhas {
  const antes = arrumarBolhas(posicoes, chaves, tela);
  const r: PosicoesBolhas = { [chave]: { ...previa.posicao, t: agora } };
  for (const k of chaves) {
    if (k === chave) continue;
    const l = previa.lugares[k];
    const a = antes[k];
    if (!l || (a && a.lado === l.lado && a.top === l.top)) continue;
    r[k] = { lado: l.lado, y: fracaoDoTopo(l.top, tela), t: posicoes[k]?.t ?? 0 };
  }
  return r;
}

/** As conversas ficam GUARDADAS por 7 dias (v1.15.0); a limpeza do cron apaga o que passou disso. */
export const DIAS_CHAT = 7;
export const VALIDADE_CHAT_MS = DIAS_CHAT * 86_400_000;
/** Quantas mensagens o histórico de uma conversa traz por vez. */
export const MAX_HISTORICO = 200;

/** A CHAVE da conversa no banco (a mesma para todos): o chat do grupo `g<grupo>`, a privada `p<menor>-<maior>`, a em grupo
 * `c<id>`. `null` = conversa inválida (ou o grupo do chat sem grupo). */
export function chaveConversa(c: Conversa, eu: number, grupoId: number | null): string | null {
  if (c === "grupo") return grupoId != null && grupoId > 0 ? `g${grupoId}` : null;
  if (ehConversaEmGrupo(c)) return c;
  const outro = idDaConversa(c);
  if (outro == null || outro === eu) return null;
  return `p${Math.min(eu, outro)}-${Math.max(eu, outro)}`;
}

/** A conversa como a TELA de `eu` a vê, a partir da chave do banco (`null` = não é dela, ou o grupo não é o ativo). */
export function conversaDaChave(chave: string, eu: number, grupoAtivo: number | null): Conversa | null {
  if (chave === `g${grupoAtivo}`) return "grupo";
  if (ehConversaEmGrupo(chave)) return chave;
  const m = /^p(\d{1,9})-(\d{1,9})$/.exec(chave);
  if (!m) return null;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === eu) return conversaPrivada(b);
  if (b === eu) return conversaPrivada(a);
  return null;
}
