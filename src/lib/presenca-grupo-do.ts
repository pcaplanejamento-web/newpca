import {
  type ConexaoPresenca,
  INTERVALO_MSG_MS,
  lerMensagemAba,
  lerPrefsPresenca,
  listaPresenca,
  MAX_ABAS_PRESENCA,
  MAX_CONEXOES_GRUPO,
  vistosRecentes,
} from "./presenca-core";

/** O anexo de cada aba: quem é, o estado, o status e se o ADM mostra ausentes (vale o da conexão mais nova). */
type Anexo = ConexaoPresenca & { ausente: boolean; ultima: number };

/**
 * A PRESENÇA de UM grupo (Durable Object, um por grupo — `idFromName("g<id>")`): guarda os WebSockets das abas das
 * pessoas do grupo (HIBERNAÇÃO — parado, não custa) e, quando alguém entra, sai, fica ausente ou troca o status, manda a
 * todas a lista de quem está online + o "visto por último" (na MEMÓRIA do objeto — nada é gravado; depois de hibernar,
 * recomeça). O "ping" das abas é respondido sem acordar o objeto (auto-resposta). O `worker.ts` já conferiu a sessão, o
 * grupo e a config — chegam aqui só o id, o status gravado, se a pessoa fica invisível e se o ausente aparece.
 */
export class PresencaGrupo {
  private state: DurableObjectState;
  /** A última lista enviada (na memória; depois de hibernar, a próxima vai de novo — sem problema). */
  private ultima = "";
  /** Quando cada pessoa saiu (a última aba fechou) — o "visto por último", só na memória. */
  private vistos = new Map<number, number>();

  constructor(state: DurableObjectState, _env: unknown) {
    this.state = state;
    this.state.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(req: Request): Promise<Response> {
    const { pathname } = new URL(req.url);
    // O ADM "Online agora": quem está no grupo (só leitura; não acorda nenhuma aba).
    if (pathname === "/estado") return Response.json({ p: listaPresenca(this.anexos(), true) });
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
    };
    servidor.serializeAttachment(anexo);
    this.vistos.delete(id);
    // A nova aba recebe a lista mesmo que ela não tenha mudado (a pessoa invisível não muda a dos outros).
    this.enviar(null, servidor);
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
    const m = lerMensagemAba(texto);
    const anexo = ws.deserializeAttachment() as Anexo | null;
    if (!m || !anexo) return;
    // Uma mudança por segundo por aba (o resto é ignorado — a tela só manda quando muda).
    const agora = Date.now();
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
  }
}

function fechar(ws: WebSocket, code: number, motivo: string) {
  try {
    ws.close(code === 1005 || code === 1006 ? 1000 : code, motivo);
  } catch {
    /* já fechada */
  }
}
