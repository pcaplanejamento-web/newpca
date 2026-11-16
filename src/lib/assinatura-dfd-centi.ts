// A ASSINATURA DO DFD na Centi (núcleo PURO, testado): as seções 8–10 do DFD (equipe, secretário demandante, autorização)
// vêm do registro de assinatura escolhido na janela "Emitir DFD" (IdPlanejamentoAssinaturaDFD) — e cada planejamento tem
// as SUAS. Mandar o id de um planejamento na emissão de outro devolve o DFD do outro com as seções 8–10 do primeiro (o
// erro que embaralhou os DFDs). Por isso o id é lido A CADA emissão, do próprio planejamento, pela FONTE que a extensão
// aprendeu da tela (o pedido + onde ler — nunca um valor fixo). Sem fonte, ou com o id incerto, NÃO se emite.

export type FonteAssinatura = {
  metodo: "GET" | "POST";
  /** O caminho da API com o nº do planejamento trocado por {id}. */
  caminho: string;
  /** O corpo (POST) com o nº do planejamento como {id} (texto) ou {id:n} (número). */
  corpo: unknown;
  /** As opções numa LISTA: o caminho até ela ("@K" = o campo K do padrão Fields) e a chave do id no item. */
  lista?: string[];
  chave?: string;
  /** Ou o id num CAMPO único. */
  campo?: string[];
  /** Com várias opções: o sim/não que marca a escolhida (ex.: "Padrao"). */
  marca?: string;
};

export const MSG_SEM_FONTE =
  "A automação ainda não aprendeu de onde vem a assinatura de cada planejamento na Centi (seções 8 a 10 do DFD) — emita UM DFD pela tela da Centi (Emitir DFD → escolher a assinatura → Processar) com a extensão instalada e execute de novo. Nada foi emitido.";
/** As falhas que PARAM a execução inteira (as demais seriam iguais). */
export const PARA_TUDO = /interrompido|lote foi encerrado|recusou o Emitir DFD|aprendeu de onde vem a assinatura/i;

const MARCA_ID = "{id}";
const MARCA_NUM = "{id:n}";
const caminhoOk = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 12 && v.every((k) => typeof k === "string" && k.length > 0 && k.length <= 120 && k !== "*");

/** Qualquer JSON → fonte válida ou null. */
export function coerceFonteAssinatura(v: unknown): FonteAssinatura | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const metodo = o.metodo === "POST" ? "POST" : o.metodo === "GET" ? "GET" : null;
  const caminho = typeof o.caminho === "string" ? o.caminho.trim() : "";
  if (!metodo || !caminho || caminho.length > 600 || !/^restauth\//i.test(caminho)) return null;
  const corpo = metodo === "POST" ? (o.corpo ?? null) : null;
  if (!caminho.includes(MARCA_ID) && !/\{id(:n)?\}/.test(JSON.stringify(corpo ?? ""))) return null;
  if (JSON.stringify(corpo ?? null).length > 16384) return null;
  const base = { metodo, caminho, corpo } as FonteAssinatura;
  if (caminhoOk(o.lista) && typeof o.chave === "string" && o.chave && o.chave.length <= 120)
    return { ...base, lista: o.lista, chave: o.chave, ...(typeof o.marca === "string" && o.marca.length <= 120 ? { marca: o.marca } : {}) };
  if (caminhoOk(o.campo) && o.campo.length) return { ...base, campo: o.campo };
  return null;
}

/** O pedido da fonte para UM planejamento (só dígitos). */
export function pedidoDaFonte(f: FonteAssinatura, plan: string): { metodo: "GET" | "POST"; caminho: string; corpo: unknown } | null {
  const p = String(plan ?? "").replace(/\D/g, "");
  if (!p) return null;
  const preencher = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(preencher)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, preencher(x)]))
        : v === MARCA_NUM
          ? Number(p)
          : v === MARCA_ID
            ? p
            : v;
  return { metodo: f.metodo, caminho: f.caminho.split(MARCA_ID).join(p), corpo: f.metodo === "POST" ? preencher(f.corpo) : null };
}

type Campo = { Key?: unknown; Value?: unknown };
const doFields = (o: unknown, k: string) =>
  o && typeof o === "object" && Array.isArray((o as { Fields?: unknown }).Fields) ? ((o as { Fields: Campo[] }).Fields.find((f) => f?.Key === k)?.Value ?? undefined) : undefined;
const valorDe = (o: unknown, k: string) => (k.startsWith("@") ? doFields(o, k.slice(1)) : o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined);
function noCaminho(j: unknown, caminho: string[]): unknown {
  let v = j;
  for (const k of caminho) {
    if (v == null || typeof v !== "object") return undefined;
    v = valorDe(v, k);
  }
  return v;
}
const idTexto = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v > 0 ? String(v) : typeof v === "string" && /^\d{1,12}$/.test(v.trim()) && Number(v) > 0 ? v.trim() : null);

/**
 * O id da assinatura DESTE planejamento na resposta da fonte: uma opção = ela; várias = a marcada (`marca`) quando só uma
 * tem a marca; nenhuma ou incerto = erro (o DFD não é emitido — nunca chuta).
 */
export function escolherAssinatura(j: unknown, f: FonteAssinatura, plan: string): { id: string } | { erro: string } {
  const onde = `do planejamento ${plan} na Centi`;
  if (f.campo) {
    const id = idTexto(noCaminho(j, f.campo));
    return id ? { id } : { erro: `Sem a assinatura do DFD ${onde} (seções 8 a 10) — confira a aba de assinaturas do planejamento.` };
  }
  const itens = noCaminho(j, f.lista ?? []);
  const lista = Array.isArray(itens) ? itens.filter((x) => x && typeof x === "object") : [];
  const ids = [...new Set(lista.map((x) => idTexto(valorDe(x, f.chave ?? ""))).filter((x): x is string => !!x))];
  if (ids.length === 1) return { id: ids[0] };
  if (!ids.length) return { erro: `O planejamento ${plan} não tem assinatura do DFD cadastrada na Centi (seções 8 a 10) — cadastre na aba de assinaturas do planejamento.` };
  if (f.marca) {
    const marcados = [...new Set(lista.filter((x) => valorDe(x, f.marca as string) === true).map((x) => idTexto(valorDe(x, f.chave ?? ""))).filter((x): x is string => !!x))];
    if (marcados.length === 1) return { id: marcados[0] };
  }
  return { erro: `O planejamento ${plan} tem ${ids.length} assinaturas do DFD na Centi — a automação não escolhe sozinha; deixe só a certa no planejamento.` };
}
