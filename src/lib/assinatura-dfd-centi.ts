// O REGISTRO DAS SEÇÕES 8–10 DO DFD na Centi (núcleo PURO, testado): equipe, secretário demandante e autorização vêm do
// registro `IdPlanejamentoAssinaturaDFD` do PRÓPRIO planejamento. A tela da Centi o lê do planejamento aberto
// (`restauth/load?entity=101045&key=<planejamento>` → `Entity.Fields["IdPlanejamentoAssinaturaDFD"]` = a referência
// {Fields: [{Key: "Id", Value: 114}, Display, Object]}) e o manda no "Processar" do Emitir DFD — a janela NÃO pede escolha.
// A automação faz IGUAL: lê esse campo do load do planejamento. A Centi 3.0.216.217 abre só a PRÉVIA (sem o campo):
// então vale o id que a PRÓPRIA TELA mandou para aquele planejamento (o par que a extensão guarda a cada "Processar") e,
// sem ele, a consulta de onde a tela tira o id (a FONTE que a extensão aprendeu), executada para o planejamento. Nunca um
// id fixo nem o de outro planejamento: o mesmo id em todos trazia as seções 8–10 de um só registro.

/** As falhas que PARAM a execução inteira (as demais seriam iguais). */
export const PARA_TUDO = /interrompido|lote foi encerrado|recusou o Emitir DFD/i;

/** O campo do planejamento (e o parâmetro da emissão) com o registro das seções 8–10. */
export const CAMPO_ASSINATURA_DFD = "IdPlanejamentoAssinaturaDFD";

/** De ONDE a tela da Centi tira o registro das seções 8–10 de um planejamento (aprendido pela extensão no "Processar"). */
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

/** Os pares planejamento → registro que a TELA mandou (o "Processar" de cada emissão pela tela). Qualquer JSON → só dígitos. */
export function lerParesAssinatura(v: unknown): Record<string, string> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const ok = Object.entries(v as Record<string, unknown>)
    .map(([k, x]) => [String(k).replace(/^0+(?=\d)/, ""), String(x ?? "").trim()] as const)
    .filter(([k, x]) => /^\d{1,12}$/.test(k) && /^\d{1,12}$/.test(x) && Number(x) > 0);
  return Object.fromEntries(ok);
}

type Campo = { Key?: unknown; Value?: unknown };
const campos = (o: unknown): Campo[] => (o && typeof o === "object" && Array.isArray((o as { Fields?: unknown }).Fields) ? (o as { Fields: Campo[] }).Fields : []);
const doFields = (o: unknown, k: string) => campos(o).find((f) => f?.Key === k)?.Value;
const valorDe = (o: unknown, k: string) => (k.startsWith("@") ? doFields(o, k.slice(1)) : o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined);
function noCaminho(j: unknown, caminho: string[]): unknown {
  let v = j;
  for (const k of caminho) {
    if (v == null || typeof v !== "object") return undefined;
    v = valorDe(v, k);
  }
  return v;
}
const idTexto = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v > 0 ? String(v) : typeof v === "string" && /^\d{1,12}$/.test(v.trim()) && Number(v) > 0 ? v.trim().replace(/^0+(?=\d)/, "") : null);

/** O id do registro das seções 8–10 no load do planejamento: o campo `IdPlanejamentoAssinaturaDFD` da `Entity` (a
 * referência {Fields: [{Key: "Id"}]} ou o próprio número). Sem ele, o erro — o DFD não é emitido. */
export function assinaturaDoLoad(j: unknown, plan: string): { id: string } | { erro: string } {
  const entidade = j && typeof j === "object" ? (j as { Entity?: unknown }).Entity : undefined;
  const v = campos(entidade).find((f) => f?.Key === CAMPO_ASSINATURA_DFD)?.Value;
  const id = idTexto(v) ?? idTexto(campos(v).find((f) => f?.Key === "Id")?.Value);
  if (id) return { id };
  return {
    erro: `A Centi não trouxe, no planejamento ${plan}, o registro das seções 8 a 10 do DFD (equipe, secretário demandante, autorização — campo ${CAMPO_ASSINATURA_DFD}) — o DFD é emitido sem elas e a conferência não as compara (Convergente*).`,
  };
}

/**
 * O id do registro DESTE planejamento na resposta da fonte: uma opção = ela; várias = a marcada (`marca`) quando só uma
 * tem a marca; nenhuma ou incerto = erro (nunca chuta).
 */
export function escolherAssinatura(j: unknown, f: FonteAssinatura, plan: string): { id: string } | { erro: string } {
  if (f.campo) {
    const v = noCaminho(j, f.campo);
    const id = idTexto(v) ?? idTexto(doFields(v, "Id"));
    return id ? { id } : { erro: `A Centi não trouxe o registro das seções 8 a 10 do planejamento ${plan}.` };
  }
  const itens = noCaminho(j, f.lista ?? []);
  const lista = Array.isArray(itens) ? itens.filter((x) => x && typeof x === "object") : [];
  const ids = [...new Set(lista.map((x) => idTexto(valorDe(x, f.chave ?? ""))).filter((x): x is string => !!x))];
  if (ids.length === 1) return { id: ids[0] };
  if (!ids.length) return { erro: `O planejamento ${plan} não tem o registro das seções 8 a 10 na Centi.` };
  if (f.marca) {
    const marcados = [...new Set(lista.filter((x) => valorDe(x, f.marca as string) === true).map((x) => idTexto(valorDe(x, f.chave ?? ""))).filter((x): x is string => !!x))];
    if (marcados.length === 1) return { id: marcados[0] };
  }
  return { erro: `O planejamento ${plan} tem ${ids.length} registros das seções 8 a 10 na Centi — a automação não escolhe sozinha.` };
}
