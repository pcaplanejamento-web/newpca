import { MAX_ABAS_AO_VIVO } from "./ao-vivo-core";

/** Sem ping há mais que isto (a aba manda a cada 45 s), a aba não conta como "entregue". */
const SINAL_ENTREGA_MS = 120_000;

/**
 * A CAIXA de notificações de UMA pessoa (Durable Object, um por usuário — `idFromName("u<id>")`): guarda os WebSockets
 * das abas abertas (HIBERNAÇÃO — parado, não custa) e, a cada `POST /ping` (gravou-se um aviso, leu-se, limpou-se), avisa
 * todas: a tela busca o que mudou. `POST /chat` repassa a mensagem PRIVADA do chat ao vivo (nada é gravado). O "ping" das abas é respondido sem acordar o objeto (auto-resposta).
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
      servidor.serializeAttachment({ desde: Date.now() });
      return new Response(null, { status: 101, webSocket: cliente });
    }
    // O CHAT PRIVADO (só ao vivo — nada é gravado): repassa a mensagem às abas abertas e diz quantas receberam (0 = a pessoa
    // não está com o sistema aberto: a rota responde "não entregue").
    if (pathname === "/chat" && req.method === "POST") {
      const texto = await req.text();
      if (texto.length > 16_000) return new Response("Grande demais.", { status: 413 });
      // "Entregue" só conta a aba com SINAL recente (o ping de 45 s, ou conectou há pouco): a que caiu sem fechar a conexão
      // (internet perdida) recebe, mas não conta — senão o remetente veria "entregue" para quem não está mais lá.
      const agora = Date.now();
      let n = 0;
      for (const ws of this.state.getWebSockets()) {
        const ping = this.state.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? 0;
        const desde = (ws.deserializeAttachment() as { desde?: number } | null)?.desde ?? 0;
        try {
          ws.send(texto);
          if (agora - Math.max(ping, desde) <= SINAL_ENTREGA_MS) n++;
        } catch {
          /* aba que caiu */
        }
      }
      return Response.json({ n });
    }
    if (pathname === "/ping" && req.method === "POST") {
      this.avisar();
      return new Response("ok");
    }
    // O aviso ADIADO volta na hora: o alarme mais cedo pedido (um por caixa) avisa as abas.
    if (pathname === "/alarme" && req.method === "POST") {
      const em = Number(new URL(req.url).searchParams.get("em"));
      if (!Number.isFinite(em) || em <= Date.now()) return new Response("Instante inválido.", { status: 422 });
      const atual = await this.state.storage.getAlarm();
      if (atual == null || em < atual) await this.state.storage.setAlarm(em);
      return new Response("ok");
    }
    return new Response("Não encontrado.", { status: 404 });
  }

  /** Avisa todas as abas abertas: algo mudou na caixa (a tela busca o que é). */
  private avisar() {
    const msg = JSON.stringify({ t: "mudou", em: Date.now() });
    for (const ws of this.state.getWebSockets()) {
      try {
        ws.send(msg);
      } catch {
        /* aba que caiu: o fechamento a tira */
      }
    }
  }

  async alarm() {
    this.avisar();
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
