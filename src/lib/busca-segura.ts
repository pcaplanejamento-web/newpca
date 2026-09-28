import { urlAgendaValida } from "./ics-core";

/**
 * BUSCA SEGURA de um endereço público (só escopo de request): só HTTPS e nunca a rede interna (`urlAgendaValida` — também
 * em CADA redirecionamento, seguido à mão), com tempo e tamanho limitados (lidos em streaming). Lança `Error` com a
 * mensagem para a pessoa (`quem` = "A agenda", "O site"…). Usada pelas agendas externas e pela imagem de fundo do quadro.
 */

const TEMPO_MS = 8000;
const MAX_REDIRECIONAMENTOS = 3;

export type Baixado = { texto: string; tipo: string; url: string };

export async function baixarSeguro(bruta: string, o: { accept: string; maxBytes: number; quem: string }): Promise<Baixado> {
  const url = urlAgendaValida(bruta);
  if (!url) throw new Error("Link inválido: use um endereço https:// público.");
  const grande = `${o.quem} é grande demais (máx. ${Math.round(o.maxBytes / 1_000_000) || 1} MB).`;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TEMPO_MS);
  let destino = url;
  let texto = "";
  try {
    let r: Response | null = null;
    for (let salto = 0; ; salto++) {
      r = await fetch(destino, { signal: ctl.signal, headers: { accept: o.accept }, redirect: "manual" });
      if (r.status < 300 || r.status >= 400) break;
      const local = r.headers.get("location");
      const proximo = local ? urlAgendaValida(new URL(local, destino).toString()) : null;
      if (!proximo) throw new Error(`${o.quem} redireciona para um endereço não permitido.`);
      if (salto >= MAX_REDIRECIONAMENTOS) throw new Error(`${o.quem} redireciona demais.`);
      destino = proximo;
    }
    if (!r.ok) throw new Error(`${o.quem} respondeu ${r.status}.`);
    const tipo = (r.headers.get("content-type") ?? "").toLowerCase();
    // Uma imagem não precisa ser lida: o tipo basta.
    if (tipo.startsWith("image/")) {
      await r.body?.cancel();
      return { texto: "", tipo, url: destino };
    }
    if (Number(r.headers.get("content-length") ?? 0) > o.maxBytes) throw new Error(grande);
    const leitor = r.body?.getReader();
    if (!leitor) throw new Error(`${o.quem} respondeu sem conteúdo.`);
    const dec = new TextDecoder();
    let lidos = 0;
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      lidos += value.byteLength;
      if (lidos > o.maxBytes) {
        await leitor.cancel();
        throw new Error(grande);
      }
      texto += dec.decode(value, { stream: true });
    }
    texto += dec.decode();
    return { texto, tipo, url: destino };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new Error(`${o.quem} demorou demais para responder.`);
    if (e instanceof Error && (e.message.startsWith(o.quem) || e.message.startsWith("Link"))) throw e;
    throw new Error(`Não foi possível acessar ${o.quem.replace(/^(A|O) /, (m) => m.toLowerCase())}.`);
  } finally {
    clearTimeout(t);
  }
}
