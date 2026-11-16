import { chaveSecao } from "./comparar-protocolo.ts";

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

/** As falhas que PARAM a execução inteira (as demais seriam iguais). */
export const PARA_TUDO = /interrompido|lote foi encerrado|recusou o Emitir DFD/i;

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

/** Uma LISTA do load (o caminho legível, o nome e os itens). */
type ListaDoLoad = { nome: string; caminho: string; itens: Record<string, unknown>[] };
const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const NOME_ASSINATURA = /assinatura/i;
const MARCA_ESCOLHIDA = /padr|selecion|escolh|princip|default|atual|vigent/i;

/** As listas de objetos do load do planejamento (pelas chaves e pelo padrão Fields), sem entrar em listas dentro de listas. */
export function listasDoLoad(j: unknown): ListaDoLoad[] {
  const achadas: ListaDoLoad[] = [];
  const ir = (v: unknown, caminho: string[], prof: number) => {
    if (prof > 8 || v == null || typeof v !== "object") return;
    if (Array.isArray(v)) {
      const itens = v.filter(ehObjeto);
      if (itens.length) achadas.push({ nome: caminho[caminho.length - 1] ?? "", caminho: caminho.join("."), itens });
      return;
    }
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.Fields)) for (const f of o.Fields as Campo[]) if (f && typeof f.Key === "string") ir(f.Value, [...caminho, f.Key], prof + 1);
    for (const [k, x] of Object.entries(o)) if (k !== "Fields") ir(x, [...caminho, k], prof + 1);
  };
  ir(j, [], 0);
  return achadas;
}

const idDoItem = (x: unknown) => idTexto(valorDe(x, "Id")) ?? idTexto(valorDe(x, "@Id")) ?? idTexto(valorDe(x, "id"));
/** O item em "chave → valor" (as próprias e as do padrão Fields "@K"). */
function planoDoItem(x: Record<string, unknown>): Record<string, unknown> {
  const r: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(x)) if (k !== "Fields") r[k] = v;
  if (Array.isArray(x.Fields)) for (const f of x.Fields as Campo[]) if (f && typeof f.Key === "string") r[`@${f.Key}`] = f.Value;
  return r;
}

/**
 * Os REGISTROS DAS SEÇÕES 8–10 ("assinaturas" do DFD) no load do PRÓPRIO planejamento — o load é dele, então qualquer id da
 * lista é dele (nunca o de outro planejamento). `ids` = todos; `id` = o que vale (uma opção, ou a única marcada); null =
 * o load não traz a lista (`listas` = os nomes das listas que trouxe, para o diagnóstico).
 */
export function assinaturasDoLoad(j: unknown): { ids: string[]; id: string | null; nome: string } | { listas: string[] } {
  const todas = listasDoLoad(j);
  let cand = todas.filter((l) => NOME_ASSINATURA.test(l.nome) && l.itens.some((x) => idDoItem(x)));
  if (cand.length > 1) {
    const dfd = cand.filter((l) => /dfd/i.test(l.nome));
    if (dfd.length) cand = dfd;
  }
  if (cand.length !== 1) return { listas: [...new Set(todas.map((l) => l.caminho || "(raiz)"))].slice(0, 40) };
  const l = cand[0];
  const ids = [...new Set(l.itens.map(idDoItem).filter((x): x is string => !!x))];
  if (ids.length === 1) return { ids, id: ids[0], nome: l.caminho };
  // Várias: só a que um sim/não marca SOZINHA (e, entre várias marcas, a de nome de "padrão/selecionada").
  const planos = l.itens.map((x) => ({ id: idDoItem(x), p: planoDoItem(x) }));
  const chaves = [...new Set(planos.flatMap((x) => Object.keys(x.p)))];
  let marcas = chaves.filter((k) => planos.filter((x) => x.p[k] === true).length === 1);
  if (marcas.length > 1) marcas = marcas.filter((k) => MARCA_ESCOLHIDA.test(k));
  const id = marcas.length === 1 ? (planos.find((x) => x.p[marcas[0]] === true)?.id ?? null) : null;
  return { ids, id, nome: l.caminho };
}

/** O id das seções 8–10 do planejamento pelo próprio load (sem fonte aprendida); erro = o DFD não é emitido. */
export function assinaturaDoLoad(j: unknown, plan: string): { id: string } | { erro: string } {
  const a = assinaturasDoLoad(j);
  if ("listas" in a)
    return {
      erro: `Não achei, no planejamento ${plan} aberto na Centi, a lista das seções 8 a 10 do DFD (equipe, secretário demandante, autorização)${a.listas.length ? ` — listas lidas: ${a.listas.join(", ")}` : ""}. Nada foi emitido.`,
    };
  if (a.id) return { id: a.id };
  return { erro: `O planejamento ${plan} tem ${a.ids.length} registros das seções 8 a 10 do DFD na Centi e nenhum marcado como o escolhido — a automação não escolhe sozinha; deixe só o certo no planejamento.` };
}

/** As seções do DFD que vêm do registro da "assinatura" (8 a 10). */
export const SECOES_DA_ASSINATURA = new Set(["equipe", "demandante", "autorizacao"]);
type ComSecoes = { secoes: { titulo: string; texto: string }[]; assinaturaIncerta?: boolean };
/**
 * O DFD lido na Centi com as seções 8–10 do SISTEMA quando o registro dele não foi confirmado (`assinaturaIncerta`):
 * a comparação não as acusa e a correção/substituição nunca as troca. Sem a marca, devolve o mesmo DFD. Pura.
 */
export function comSecoesDaAssinaturaDoSistema<T extends ComSecoes>(centi: T, sistema: ComSecoes): T {
  if (!centi.assinaturaIncerta) return centi;
  const da = (s: { titulo: string }) => SECOES_DA_ASSINATURA.has(chaveSecao(s.titulo));
  return { ...centi, secoes: [...centi.secoes.filter((s) => !da(s)), ...sistema.secoes.filter(da)] };
}
