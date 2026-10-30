import { urlAgendaValida } from "./ics-core";

/**
 * BUSCA SEGURA de um endereço público (só escopo de request): só HTTPS e nunca a rede interna (`urlAgendaValida` — também
 * em CADA redirecionamento, seguido à mão), com tempo e tamanho limitados (lidos em streaming). Lança `Error` com a
 * mensagem para a pessoa (`quem` = "A agenda", "O site"…). Usada pelas agendas externas, pela imagem de fundo do quadro e
 * pelo TESTE dos cards de empenhos (`post` = o corpo JSON; `comErro` = devolve também a resposta de erro, com o `status`).
 */

const TEMPO_MS = 8000;
const MAX_REDIRECIONAMENTOS = 3;

/** `bytes` = o corpo cru (só com `binario`); `nome` = o arquivo do Content-Disposition. */
export type Baixado = {
  texto: string;
  tipo: string;
  url: string;
  status: number;
  bytes?: Uint8Array;
  nome?: string;
  pedacos?: Uint8Array[];
  lidos?: number;
  /** Com `faixa`: a resposta acabou dentro da faixa (então `lidos` = o tamanho dela) e o Content-Length, se veio. */
  terminou?: boolean;
  comprimento?: number | null;
  /** Com `faixa` + `assinar`: o SHA-256 (hex) da resposta INTEIRA (lida até o fim, só a faixa guardada); null = o ambiente
   * não tem `crypto.DigestStream`. */
  assinatura?: string | null;
  /** Com `fluxo`: o corpo REPASSADO como chega (contado — passou do teto, o fluxo falha), sem guardar nada na memória. */
  corpo?: ReadableStream<Uint8Array>;
};

export async function baixarSeguro(bruta: string, o: { accept: string; maxBytes: number; quem: string; binario?: boolean; pedacos?: boolean; fluxo?: boolean; faixa?: { de: number; ate: number; assinar?: boolean }; tempoMs?: number; post?: string; comErro?: boolean }): Promise<Baixado> {
  const url = urlAgendaValida(bruta);
  if (!url) throw new Error("Link inválido: use um endereço https:// público.");
  const grande = `${o.quem} é grande demais (máx. ${Math.round(o.maxBytes / 1_000_000) || 1} MB).`;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), o.tempoMs ?? TEMPO_MS);
  let destino = url;
  let texto = "";
  // No FLUXO, o tempo vale até o fim do repasse (quem lê o corpo) — o `finally` não desarma.
  let repassando = false;
  try {
    let r: Response | null = null;
    for (let salto = 0; ; salto++) {
      r = await fetch(destino, {
        signal: ctl.signal,
        redirect: "manual",
        ...(o.post == null
          ? { headers: { accept: o.accept } }
          : { method: "POST", body: o.post, headers: { accept: o.accept, "content-type": "application/json" } }),
      });
      if (r.status < 300 || r.status >= 400) break;
      const local = r.headers.get("location");
      const proximo = local ? urlAgendaValida(new URL(local, destino).toString()) : null;
      if (!proximo) throw new Error(`${o.quem} redireciona para um endereço não permitido.`);
      if (salto >= MAX_REDIRECIONAMENTOS) throw new Error(`${o.quem} redireciona demais.`);
      destino = proximo;
    }
    if (!r.ok && !o.comErro) throw new Error(`${o.quem} respondeu ${r.status}.`);
    const tipo = (r.headers.get("content-type") ?? "").toLowerCase();
    // Uma imagem não precisa ser lida: o tipo basta.
    if (tipo.startsWith("image/")) {
      await r.body?.cancel();
      return { texto: "", tipo, url: destino, status: r.status };
    }
    const cl = r.headers.get("content-length");
    const comprimento = cl != null && /^\d+$/.test(cl) ? Number(cl) : null;
    if ((comprimento ?? 0) > o.maxBytes) throw new Error(grande);
    if (o.fluxo) {
      if (!r.body) throw new Error(`${o.quem} respondeu sem conteúdo.`);
      let lidos = 0;
      const contar = new TransformStream<Uint8Array, Uint8Array>({
        transform(pedaco, ctl) {
          lidos += pedaco.byteLength;
          if (lidos > o.maxBytes) {
            clearTimeout(t);
            ctl.error(new Error(grande));
            return;
          }
          ctl.enqueue(pedaco);
        },
        flush() {
          clearTimeout(t);
        },
      });
      repassando = true;
      // O tamanho informado só vale sem compressão (o corpo repassado já vem descomprimido).
      const semCompressao = !r.headers.get("content-encoding") || r.headers.get("content-encoding") === "identity";
      return { texto: "", tipo, url: destino, status: r.status, corpo: r.body.pipeThrough(contar), comprimento: semCompressao ? comprimento : null };
    }
    const leitor = r.body?.getReader();
    if (!leitor) throw new Error(`${o.quem} respondeu sem conteúdo.`);
    if (o.faixa) {
      // Só os bytes da FAIXA [de, ate) — o que vem antes é lido e descartado sem converter (quase nenhum trabalho de CPU);
      // ao chegar ao fim da faixa, a leitura para (o resto da resposta não é baixado).
      const { de, ate, assinar } = o.faixa;
      const pedacos: Uint8Array[] = [];
      let lidos = 0;
      let terminou = false;
      // ASSINAR: a resposta é lida até o FIM pelo SHA-256 nativo (`crypto.DigestStream` — sem decodificar nem guardar nada
      // além da faixa; quase nenhum trabalho de CPU), para decidir se a página mudou antes de capturar o resto.
      const Digest = (crypto as unknown as { DigestStream?: new (alg: string) => WritableStream<Uint8Array> & { digest: Promise<ArrayBuffer> } }).DigestStream;
      const digest = assinar && Digest ? new Digest("SHA-256") : null;
      const escritor = digest?.getWriter() ?? null;
      for (;;) {
        let parte: ReadableStreamReadResult<Uint8Array>;
        try {
          parte = await leitor.read();
        } catch (e) {
          // ASSINANDO, a faixa já guardada vale sem a assinatura: o tempo acabou no resto da resposta (enorme ou lenta) —
          // quem chama segue com a captura em fragmentos, como antes.
          if (escritor && lidos >= ate) {
            await escritor.abort().catch(() => {});
            break;
          }
          throw e;
        }
        const { done, value } = parte;
        if (done) {
          terminou = true;
          break;
        }
        const ini = lidos;
        lidos += value.byteLength;
        if (lidos > o.maxBytes) {
          await leitor.cancel();
          await escritor?.abort().catch(() => {});
          throw new Error(grande);
        }
        if (escritor) await escritor.write(value);
        if (lidos > de && ini < ate) pedacos.push(value.subarray(Math.max(0, de - ini), Math.min(value.byteLength, ate - ini)));
        if (lidos >= ate && !escritor) {
          await leitor.cancel();
          break;
        }
      }
      let assinatura: string | null = null;
      if (escritor && !terminou) await escritor.abort().catch(() => {});
      if (escritor && digest && terminou) {
        await escritor.close();
        assinatura = Array.from(new Uint8Array(await digest.digest), (b) => b.toString(16).padStart(2, "0")).join("");
      }
      const n = pedacos.reduce((t, p) => t + p.byteLength, 0);
      const bytes = new Uint8Array(n);
      let i = 0;
      for (const p of pedacos) {
        bytes.set(p, i);
        i += p.byteLength;
      }
      return { texto: "", tipo, url: destino, status: r.status, bytes, lidos, terminou, comprimento, ...(assinar ? { assinatura } : {}) };
    }
    const dec = new TextDecoder();
    const partes: Uint8Array[] = [];
    let lidos = 0;
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      lidos += value.byteLength;
      if (lidos > o.maxBytes) {
        await leitor.cancel();
        throw new Error(grande);
      }
      if (o.binario || o.pedacos) partes.push(value);
      else texto += dec.decode(value, { stream: true });
    }
    // Os PEDAÇOS como vieram (sem decodificar nem juntar — quase nenhum trabalho de CPU): quem chama repassa ao navegador.
    if (o.pedacos) return { texto: "", tipo, url: destino, status: r.status, pedacos: partes, lidos };
    if (o.binario) {
      const bytes = new Uint8Array(lidos);
      let i = 0;
      for (const p of partes) {
        bytes.set(p, i);
        i += p.byteLength;
      }
      const disp = r.headers.get("content-disposition") ?? "";
      const nome = /filename\*=UTF-8''([^;]+)/i.exec(disp)?.[1] ?? /filename="?([^";]+)"?/i.exec(disp)?.[1];
      return { texto: "", tipo, url: destino, status: r.status, bytes, nome: nome ? decodeURIComponent(nome) : undefined };
    }
    texto += dec.decode();
    return { texto, tipo, url: destino, status: r.status };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new Error(`${o.quem} demorou demais para responder.`);
    if (e instanceof Error && (e.message.startsWith(o.quem) || e.message.startsWith("Link"))) throw e;
    throw new Error(`Não foi possível acessar ${o.quem.replace(/^(A|O) /, (m) => m.toLowerCase())}.`);
  } finally {
    if (!repassando) clearTimeout(t);
  }
}
