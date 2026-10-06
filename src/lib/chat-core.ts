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

/** A posição da pilha de bolhas: encostada num LADO, numa altura (fração da área livre, 0 = topo · 1 = embaixo) — resiste
 * a trocar o tamanho da janela. */
export type PosicaoBolhas = { lado: "esq" | "dir"; y: number };
export const POSICAO_BOLHAS_PADRAO: PosicaoBolhas = { lado: "dir", y: 1 };
export function lerPosicaoBolhas(v: unknown): PosicaoBolhas {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const y = Number(o.y);
  return { lado: o.lado === "esq" ? "esq" : "dir", y: Number.isFinite(y) ? Math.min(1, Math.max(0, y)) : 1 };
}
/** Soltou a pilha com o CENTRO em `cx` e o TOPO em `topoPx`: encosta no lado mais perto, mantendo a altura dentro da área
 * livre (`topo`..`altura - base`, descontando a altura da pilha). */
export function encostarBolhas(cx: number, topoPx: number, tela: { largura: number; altura: number; topo: number; base: number }, alturaPilha: number): PosicaoBolhas {
  const livre = tela.altura - tela.topo - tela.base - alturaPilha;
  return { lado: cx < tela.largura / 2 ? "esq" : "dir", y: livre <= 0 ? 1 : Math.min(1, Math.max(0, (topoPx - tela.topo) / livre)) };
}
/** O topo (px) da pilha para a posição gravada. */
export function topoDasBolhas(p: PosicaoBolhas, tela: { altura: number; topo: number; base: number }, alturaPilha: number): number {
  const livre = Math.max(0, tela.altura - tela.topo - tela.base - alturaPilha);
  return Math.round(tela.topo + livre * p.y);
}
