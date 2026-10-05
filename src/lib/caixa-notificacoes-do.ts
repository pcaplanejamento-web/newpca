import { MAX_ABAS_AO_VIVO } from "./ao-vivo-core";

/**
 * A CAIXA de notificações de UMA pessoa (Durable Object, um por usuário — `idFromName("u<id>")`): guarda os WebSockets
 * das abas abertas (HIBERNAÇÃO — parado, não custa) e, a cada `POST /ping` (gravou-se um aviso, leu-se, limpou-se), avisa
 * todas: a tela busca o que mudou. O "ping" das abas é respondido sem acordar o objeto (auto-resposta).
 */
export class CaixaNotificacoes {
  private state: DurableObjectState;

  constructor(state: DurableObjectState, _env: unknown) {
    this.state = state;
    this.state.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(req: Request): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (pathname === "/ws") {
      if (req.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("Esperado WebSocket.", { status: 426 });
      const abertas = this.state.getWebSockets();
      for (const velha of abertas.slice(0, Math.max(0, abertas.length - MAX_ABAS_AO_VIVO + 1))) {
        try {
          velha.close(4000, "Muitas abas abertas.");
        } catch {
          /* já fechada */
        }
      }
      const par = new WebSocketPair();
      const [cliente, servidor] = [par[0], par[1]];
      this.state.acceptWebSocket(servidor);
      return new Response(null, { status: 101, webSocket: cliente });
    }
    if (pathname === "/ping" && req.method === "POST") {
      const msg = JSON.stringify({ t: "mudou", em: Date.now() });
      for (const ws of this.state.getWebSockets()) {
        try {
          ws.send(msg);
        } catch {
          /* aba que caiu: o fechamento a tira */
        }
      }
      return new Response("ok");
    }
    return new Response("Não encontrado.", { status: 404 });
  }

  webSocketMessage() {
    /* as abas só mandam o "ping" (auto-resposta) */
  }

  webSocketClose(ws: WebSocket, code: number, motivo: string) {
    try {
      ws.close(code, motivo);
    } catch {
      /* já fechada */
    }
  }

  webSocketError() {
    /* o fechamento cuida */
  }
}
