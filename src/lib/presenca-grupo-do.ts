import { contarNaJanela, idDaConversa, INTERVALO_DIGITANDO_MS, lerMensagemChatAba } from "./chat-core";
import {
  type ConexaoPresenca,
  INTERVALO_MSG_MS,
  lerMensagemAba,
  lerPrefsPresenca,
  listaAtividade,
  listaPresenca,
  listaVendo,
  type TelaOnde,
  MAX_ABAS_PRESENCA,
  MAX_CONEXOES_GRUPO,
  vistosRecentes,
} from "./presenca-core";

/** O anexo de cada aba: quem é, o estado, o status, se o ADM mostra ausentes (vale o da conexão mais nova), o chat ligado
 * (grupo/privado) e os contadores do chat (mensagens por minuto, último "digitando"). */
type Anexo = ConexaoPresenca & {
  ausente: boolean;
  ultima: number;
  chatGrupo?: boolean;
  chatPrivado?: boolean;
  janela?: { inicio: number; n: number };
  dig?: number;
  /** O que a aba está vendo (os banners abertos) e onde tem alteração não salva. */
  vendo?: string[];
  editando?: string[];
  /** O rótulo de cada alvo do `vendo` (mesma ordem). */
  rotulos?: string[];
  janelaVendo?: { inicio: number; n: number };
  /** A TELA em que a aba está e quando mexeu por último (a atividade mostra a aba mais recente da pessoa). */
  onde?: { tela: TelaOnde; rotulo: string };
  mexeu?: number;
  /** O ADM mostra a atividade (vale o da conexão mais nova, como o "ausente"). */
  atividade?: boolean;
};

/**
 * A PRESENÇA de UM grupo (Durable Object, um por grupo — `idFromName("g<id>")`): guarda os WebSockets das abas das
 * pessoas do grupo (HIBERNAÇÃO — parado, não custa) e, quando alguém entra, sai, fica ausente ou troca o status, manda a
 * todas a lista de quem está online + o "visto por último" (na MEMÓRIA do objeto — nada é gravado; depois de hibernar,
 * recomeça). O "ping" das abas é respondido sem acordar o objeto (auto-resposta). O `worker.ts` já conferiu a sessão, o
 * grupo e a config — chegam aqui só o id, o status gravado, se a pessoa fica invisível e se o ausente aparece.
 *
 * O CHAT DO GRUPO passa por aqui SÓ AO VIVO (nada é gravado): a mensagem é validada (texto, 30/min por aba, o autor = o
 * anexo — nunca o que a aba diz) e retransmitida a todas as abas do grupo; o "digitando" e a "lida" vão ao grupo ou, no
 * privado, só às abas da outra pessoa que estiverem neste grupo.
 */
export class PresencaGrupo {
  private state: DurableObjectState;
  /** A última lista enviada (na memória; depois de hibernar, a próxima vai de novo — sem problema). */
  private ultima = "";
  /** Quando cada pessoa saiu (a última aba fechou) — o "visto por último", só na memória. */
  private vistos = new Map<number, number>();
  /** O último "vendo agora" enviado (só manda quando muda). */
  private ultimoVendo = "";

  constructor(state: DurableObjectState, _env: unknown) {
    this.state = state;
    this.state.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(req: Request): Promise<Response> {
    const { pathname } = new URL(req.url);
    // O ADM "Online agora": quem está no grupo (só leitura; não acorda nenhuma aba).
    if (pathname === "/estado") {
      const anexos = this.anexos();
      const atividade = anexos.length ? anexos[anexos.length - 1].atividade === true : false;
      return Response.json(atividade ? { p: listaPresenca(anexos, true), a: listaAtividade(anexos) } : { p: listaPresenca(anexos, true) });
    }
    if (pathname !== "/ws") return new Response("Não encontrado.", { status: 404 });
    if (req.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("Esperado WebSocket.", { status: 426 });
    const id = Number(req.headers.get("x-presenca-usuario"));
    if (!Number.isInteger(id) || id <= 0) return new Response("Pessoa inválida.", { status: 400 });
    if (this.state.getWebSockets().length >= MAX_CONEXOES_GRUPO) return new Response("Grupo cheio.", { status: 503 });
    const tag = `u${id}`;
    const daPessoa = this.state.getWebSockets(tag);
    for (const velha of daPessoa.slice(0, Math.max(0, daPessoa.length - MAX_ABAS_PRESENCA + 1))) fechar(velha, 4000, "Muitas abas abertas.");
    let st = lerPrefsPresenca(null);
    try {
      st = lerPrefsPresenca(decodeURIComponent(req.headers.get("x-presenca-status") ?? ""));
    } catch {
      /* status ilegível = Disponível */
    }
    const par = new WebSocketPair();
    const [cliente, servidor] = [par[0], par[1]];
    this.state.acceptWebSocket(servidor, [tag]);
    const anexo: Anexo = {
      id,
      estado: "online",
      invisivel: req.headers.get("x-presenca-invisivel") === "1",
      ausente: req.headers.get("x-presenca-ausente") !== "0",
      status: st.status,
      recado: st.recado,
      ate: st.ate,
      ultima: 0,
      chatGrupo: req.headers.get("x-chat-grupo") === "1",
      chatPrivado: req.headers.get("x-chat-privado") === "1",
      atividade: req.headers.get("x-presenca-atividade") === "1",
    };
    servidor.serializeAttachment(anexo);
    this.vistos.delete(id);
    // A nova aba recebe a lista mesmo que ela não tenha mudado (a pessoa invisível não muda a dos outros).
    this.enviar(null, servidor);
    this.enviarVendo(null, servidor);
    return new Response(null, { status: 101, webSocket: cliente });
  }

  private anexos(saindo: WebSocket | null = null): Anexo[] {
    return this.state
      .getWebSockets()
      .filter((ws) => ws !== saindo)
      .map((ws) => ws.deserializeAttachment() as Anexo | null)
      .filter((a): a is Anexo => !!a);
  }

  /** Manda a lista a todas as abas (só quando mudou) e, sempre, à aba `nova`. `saindo` = a aba que está fechando. */
  private enviar(saindo: WebSocket | null, nova?: WebSocket) {
    const abertas = this.state.getWebSockets().filter((ws) => ws !== saindo);
    const anexos = this.anexos(saindo);
    // "Mostrar ausente" é da config do ADM: vale o que a conexão mais nova trouxe.
    const mostrarAusente = anexos.length ? anexos[anexos.length - 1].ausente !== false : true;
    const presentes = new Set(anexos.filter((a) => !a.invisivel).map((a) => a.id));
    const msg = JSON.stringify({ t: "presenca", p: listaPresenca(anexos, mostrarAusente), v: vistosRecentes(this.vistos, presentes) });
    const mudou = msg !== this.ultima;
    this.ultima = msg;
    for (const ws of abertas) {
      if (!mudou && ws !== nova) continue;
      try {
        ws.send(msg);
      } catch {
        /* aba que caiu: o fechamento a tira */
      }
    }
  }

  webSocketMessage(ws: WebSocket, texto: string | ArrayBuffer) {
    const anexo = ws.deserializeAttachment() as Anexo | null;
    if (!anexo) return;
    const m = lerMensagemAba(texto);
    if (!m) {
      this.chat(ws, anexo, texto);
      return;
    }
    const agora = Date.now();
    if (m.t === "vendo" || m.t === "onde") {
      // Abrir/fechar banners e trocar de tela é rápido: até 60 por minuto por aba (vendo + onde).
      const conta = contarNaJanela(anexo.janelaVendo, agora, 60);
      if (!conta.ok) return;
      const novo: Anexo =
        m.t === "vendo"
          ? { ...anexo, vendo: m.alvos, editando: m.editando, rotulos: anexo.atividade ? m.rotulos : undefined, janelaVendo: conta.janela, mexeu: agora }
          : { ...anexo, onde: anexo.atividade ? { tela: m.tela, rotulo: m.rotulo } : undefined, janelaVendo: conta.janela, mexeu: agora };
      ws.serializeAttachment(novo);
      this.enviarVendo(null);
      return;
    }
    // Uma mudança por segundo por aba (o resto é ignorado — a tela só manda quando muda).
    if (agora - anexo.ultima < INTERVALO_MSG_MS) return;
    if (m.t === "estado") {
      if (m.estado === anexo.estado) return;
      ws.serializeAttachment({ ...anexo, estado: m.estado, ultima: agora });
    } else {
      // O status vale para TODAS as abas da pessoa (é dela, não da aba).
      for (const outra of this.state.getWebSockets(`u${anexo.id}`)) {
        const a = outra.deserializeAttachment() as Anexo | null;
        if (a) outra.serializeAttachment({ ...a, status: m.status, recado: m.recado, ate: m.ate, ultima: outra === ws ? agora : a.ultima });
      }
    }
    this.enviar(null);
  }

  /** O CHAT (só ao vivo): mensagem do grupo, "digitando" e "lida". */
  private chat(ws: WebSocket, anexo: Anexo, texto: string | ArrayBuffer) {
    const m = lerMensagemChatAba(texto);
    if (!m) return;
    const agora = Date.now();
    if (m.t === "msg") {
      if (!anexo.chatGrupo) return enviarA([ws], { t: "msg-recusada", id: m.id, motivo: "O chat do grupo está desligado." });
      const conta = contarNaJanela(anexo.janela, agora);
      ws.serializeAttachment({ ...anexo, janela: conta.janela });
      if (!conta.ok) return enviarA([ws], { t: "msg-recusada", id: m.id, motivo: "Muitas mensagens seguidas — aguarde um instante." });
      enviarA(this.state.getWebSockets(), { t: "msg", conversa: "grupo", id: m.id, de: anexo.id, em: agora, texto: m.texto, resp: m.resp });
      return;
    }
    // "digitando" (1 a cada 3 s por aba) e "lida": ao grupo (menos a própria pessoa) ou às abas da outra pessoa.
    if (m.t === "digitando") {
      if (agora - (anexo.dig ?? 0) < INTERVALO_DIGITANDO_MS) return;
      ws.serializeAttachment({ ...anexo, dig: agora });
    }
    const outro = idDaConversa(m.conversa);
    if (outro == null ? !anexo.chatGrupo : !anexo.chatPrivado || outro === anexo.id) return;
    const alvo = outro == null ? this.state.getWebSockets().filter((o) => !this.state.getTags(o).includes(`u${anexo.id}`)) : this.state.getWebSockets(`u${outro}`);
    const conversa = outro == null ? "grupo" : `p${anexo.id}`;
    enviarA(alvo, m.t === "lida" ? { t: "lida", de: anexo.id, conversa, ate: m.ate } : { t: "digitando", de: anexo.id, conversa });
  }

  webSocketClose(ws: WebSocket, code: number, motivo: string) {
    fechar(ws, code, motivo);
    this.saiu(ws);
  }

  webSocketError(ws: WebSocket) {
    this.saiu(ws);
  }

  /** A aba fechou: se era a última da pessoa (e ela não estava invisível), guarda o "visto por último". */
  private saiu(ws: WebSocket) {
    const a = ws.deserializeAttachment() as Anexo | null;
    if (a && !a.invisivel && !this.state.getWebSockets(`u${a.id}`).some((o) => o !== ws)) this.vistos.set(a.id, Date.now());
    this.enviar(ws);
    this.enviarVendo(ws);
  }

  /** O "VENDO AGORA": quem está com cada protocolo/DFD/tarefa aberto (e editando) e, com o ADM permitindo, ONDE cada
   * pessoa está (`a`) — a todas as abas, só quando muda. */
  private enviarVendo(saindo: WebSocket | null, nova?: WebSocket) {
    const anexos = this.anexos(saindo);
    const atividade = anexos.length ? anexos[anexos.length - 1].atividade === true : false;
    const msg = JSON.stringify(atividade ? { t: "vendo", m: listaVendo(anexos), a: listaAtividade(anexos) } : { t: "vendo", m: listaVendo(anexos) });
    const mudou = msg !== this.ultimoVendo;
    this.ultimoVendo = msg;
    if (mudou) enviarA(this.state.getWebSockets().filter((o) => o !== saindo), JSON.parse(msg));
    else if (nova) enviarA([nova], JSON.parse(msg));
  }
}

function fechar(ws: WebSocket, code: number, motivo: string) {
  try {
    ws.close(code === 1005 || code === 1006 ? 1000 : code, motivo);
  } catch {
    /* já fechada */
  }
}

function enviarA(abas: WebSocket[], msg: Record<string, unknown>) {
  const texto = JSON.stringify(msg);
  for (const ws of abas) {
    try {
      ws.send(texto);
    } catch {
      /* aba que caiu */
    }
  }
}
