import { type ConexaoPresenca, INTERVALO_MSG_MS, lerEstadoMensagem, listaPresenca, MAX_ABAS_PRESENCA, MAX_CONEXOES_GRUPO } from "./presenca-core";

type Anexo = ConexaoPresenca & { ultima: number };

/**
 * A PRESENÇA de UM grupo (Durable Object, um por grupo — `idFromName("g<id>")`): guarda os WebSockets das abas das
 * pessoas do grupo (HIBERNAÇÃO — parado, não custa) e, quando alguém entra, sai ou troca a aba de estado, manda a todas a
 * lista de quem está online. O "ping" das abas é respondido sem acordar o objeto (auto-resposta). O `worker.ts` já
 * conferiu a sessão, o grupo e a config — chega aqui só o id da pessoa, se ela fica invisível e se o ausente aparece.
 */
export class PresencaGrupo {
  private state: DurableObjectState;
  /** A última lista enviada (na memória; depois de hibernar, a próxima vai de novo — sem problema). */
  private ultima = "";

  constructor(state: DurableObjectState, _env: unknown) {
    this.state = state;
    this.state.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(req: Request): Promise<Response> {
    if (new URL(req.url).pathname !== "/ws") return new Response("Não encontrado.", { status: 404 });
    if (req.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("Esperado WebSocket.", { status: 426 });
    const id = Number(req.headers.get("x-presenca-usuario"));
    if (!Number.isInteger(id) || id <= 0) return new Response("Pessoa inválida.", { status: 400 });
    if (this.state.getWebSockets().length >= MAX_CONEXOES_GRUPO) return new Response("Grupo cheio.", { status: 503 });
    const tag = `u${id}`;
    const daPessoa = this.state.getWebSockets(tag);
    for (const velha of daPessoa.slice(0, Math.max(0, daPessoa.length - MAX_ABAS_PRESENCA + 1))) fechar(velha, 4000, "Muitas abas abertas.");
    const par = new WebSocketPair();
    const [cliente, servidor] = [par[0], par[1]];
    this.state.acceptWebSocket(servidor, [tag]);
    const anexo: Anexo = { id, estado: "online", invisivel: req.headers.get("x-presenca-invisivel") === "1", ultima: 0 };
    servidor.serializeAttachment({ ...anexo, ausente: req.headers.get("x-presenca-ausente") !== "0" });
    // A nova aba recebe a lista mesmo que ela não tenha mudado (a pessoa invisível não muda a dos outros).
    this.enviar(null, servidor);
    return new Response(null, { status: 101, webSocket: cliente });
  }

  /** Manda a lista a todas as abas (só quando mudou) e, sempre, à aba `nova`. `saindo` = a aba que está fechando. */
  private enviar(saindo: WebSocket | null, nova?: WebSocket) {
    const abertas = this.state.getWebSockets().filter((ws) => ws !== saindo);
    const anexos = abertas.map((ws) => ws.deserializeAttachment() as (Anexo & { ausente?: boolean }) | null).filter((a): a is Anexo & { ausente?: boolean } => !!a);
    // "Mostrar ausente" é da config do ADM: vale o que a conexão mais nova trouxe.
    const mostrarAusente = anexos.length ? anexos[anexos.length - 1].ausente !== false : true;
    const msg = JSON.stringify({ t: "presenca", p: listaPresenca(anexos, mostrarAusente) });
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

  webSocketMessage(ws: WebSocket, msg: string | ArrayBuffer) {
    const estado = lerEstadoMensagem(msg);
    const anexo = ws.deserializeAttachment() as (Anexo & { ausente?: boolean }) | null;
    if (!estado || !anexo || estado === anexo.estado) return;
    // Uma mensagem por segundo por aba (o resto é ignorado — a tela só manda quando muda).
    const agora = Date.now();
    if (agora - anexo.ultima < INTERVALO_MSG_MS) return;
    ws.serializeAttachment({ ...anexo, estado, ultima: agora });
    this.enviar(null);
  }

  webSocketClose(ws: WebSocket, code: number, motivo: string) {
    fechar(ws, code, motivo);
    this.enviar(ws);
  }

  webSocketError(ws: WebSocket) {
    this.enviar(ws);
  }
}

function fechar(ws: WebSocket, code: number, motivo: string) {
  try {
    ws.close(code === 1005 || code === 1006 ? 1000 : code, motivo);
  } catch {
    /* já fechada */
  }
}
