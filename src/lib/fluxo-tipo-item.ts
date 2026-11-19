/**
 * O TIPO dos itens que passam por uma automação — para mostrar a MESMA tabela da Mesa (protocolos · DFDs · itens) e abrir o
 * MESMO banner ao tocar na linha. Puro (testado em `tests/fluxo-tipo-item.test.ts`).
 */
import type { Grafo } from "./fluxo-core.ts";
import { conferenciaDesatualizada } from "./conferencia-dfd-centi.ts";
import { tipoCurtoDfd } from "./parse-dfd-comum.ts";

type Item = Record<string, unknown>;
export type TipoItemMesa = "protocolo" | "dfd" | "item";
/** O mesmo formato da `AberturaMesa` (a pilha de banners da Mesa). */
export type AberturaItem = { tipo: "protocolo"; id: number } | { tipo: "dfd"; id: number; corrigirCenti?: boolean } | { tipo: "item"; dfdId: number; itemId: number; item: { item: number | null; codigo: string | null } };

const txt = (v: unknown) => (v == null ? "" : String(v).trim());
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number(txt(v));
  return Number.isFinite(n) && txt(v) !== "" ? n : null;
};
const idPositivo = (v: unknown) => {
  const n = num(v);
  return n != null && n > 0 && Number.isInteger(n) ? n : null;
};

/** O tipo de UM item (ou `null` = outro dado: repartição, linha da CM002, tabela salva…). */
export function tipoDoItem(it: Item): TipoItemMesa | null {
  if (idPositivo(it.dfdId) != null && idPositivo(it.id) != null && "descricao" in it) return "item";
  if (idPositivo(it.id) != null && txt(it.numero) && txt(it.planejamento)) return "dfd";
  if (idPositivo(it.id) != null && (Array.isArray(it.dfds) || (txt(it.numero) && "idExterno" in it && !("planejamento" in it)))) return "protocolo";
  return null;
}

/** O tipo da LISTA: todos do mesmo tipo (a amostra dos primeiros); misturado ou vazio = `null` (a tabela genérica). */
export function tipoDosItens(itens: readonly Item[], amostra = 50): TipoItemMesa | null {
  const lista = itens.slice(0, amostra);
  if (!lista.length) return null;
  const t = tipoDoItem(lista[0]);
  return t && lista.every((it) => tipoDoItem(it) === t) ? t : null;
}

/** O banner que a linha abre na pilha da Mesa (`null` = nenhum). */
export function aberturaDoItem(it: Item): AberturaItem | null {
  const t = tipoDoItem(it);
  if (t === "item") return { tipo: "item", dfdId: idPositivo(it.dfdId) as number, itemId: idPositivo(it.id) as number, item: { item: num(it.item), codigo: txt(it.codigo) || null } };
  if (t === "dfd") return { tipo: "dfd", id: idPositivo(it.id) as number };
  if (t === "protocolo") return { tipo: "protocolo", id: idPositivo(it.id) as number };
  return null;
}

/** Os dados de um DFD para a planilha de DFDs da Mesa (`LinhaDfd` sem o estado — a automação não confere). */
export function dadosDfdDoItem(it: Item) {
  // A situação gravada AGORA pela verificação (`situacaoGravada`) vale mais que a lida do sistema antes dela.
  const execucao = txt(it.situacaoGravada) || txt(it.execucaoCenti);
  // O DFD cuja verificação FALHOU nesta execução não mostra a conferência gravada antes (seria um "Convergente" de outra
  // vez ao lado de "Falhou"): a coluna fica sem conferência.
  const falhou = !!it.subfluxo && typeof it.subfluxo === "object" && (it.subfluxo as Item).estado === "falhou";
  const conferencia = falhou ? "" : txt(it.conferenciaCenti);
  // O centro de custo: o lido na Centi AGORA (`centroCustoCenti`; "" = a Centi não tem) ou o gravado no DFD (`centroCusto`);
  // a leitura que falhou (`centroNaoLido`) mostra o gravado. Sem nenhum dos dois campos, a coluna não existe.
  const centro = "centroCustoCenti" in it && it.centroNaoLido !== true ? it.centroCustoCenti : "centroCusto" in it ? it.centroCusto : undefined;
  return {
    key: idPositivo(it.id) as number,
    numero: txt(it.numero),
    planejamento: txt(it.planejamento) || null,
    sigla: txt(it.sigla),
    tipo: tipoCurtoDfd(txt(it.tipo) || null),
    itens: num(it.totalItens ?? it.itens),
    valor: num(it.valor ?? it.valorTotal),
    protocolo: txt(it.protocolo) || null,
    ...(execucao ? { execucao, execucaoEm: txt(it.situacaoGravada) ? null : txt(it.execucaoCentiEm) || null } : {}),
    // O id do DFD e a data da conferência: com eles, o selo da coluna Centi abre as ações (reconferir, corrigir, aceitar).
    dfdId: idPositivo(it.id) ?? undefined,
    ...(centro !== undefined ? { centroCusto: { texto: txt(centro) || null } } : {}),
    ...(conferencia
      ? {
          conferencia: {
            status: conferencia,
            motivo: txt(it.conferenciaCentiMotivo) || null,
            em: txt(it.conferenciaCentiEm) || null,
            aceite: txt(it.conferenciaCentiAceite) || null,
            desatualizada: conferenciaDesatualizada(txt(it.conferenciaCentiEm) || null, txt(it.atualizadoEm) || null),
          },
        }
      : {}),
  };
}

const TIPO_LIDO: Record<string, TipoItemMesa> = { protocolos: "protocolo", dfds: "dfd", itens: "item" };

/**
 * O fluxo RECEBE estes itens de fora ("Executar com os selecionados")? Olha o que o Início alimenta: o "Ler do sistema"
 * sem valor procurado aceita itens do MESMO tipo que lê (só eles seguem); com `{{campo}}`, qualquer item; com valor fixo,
 * nenhum. Componentes da Centi ignoram a entrada. Os demais processam os itens que chegam.
 */
export function aceitaItensDeFora(g: Grafo, itens: readonly Item[], categoria: (tipo: string) => string | undefined): boolean {
  if (!itens.length) return false;
  const inicio = g.nos.find((n) => n.tipo === "gatilho.inicio");
  if (!inicio) return false;
  const tipo = tipoDosItens(itens);
  return g.conexoes
    .filter((c) => c.de === inicio.id)
    .map((c) => g.nos.find((n) => n.id === c.para))
    .some((n) => {
      if (!n || n.desativado) return false;
      if (n.tipo === "sistema.ler") {
        const valor = txt(n.config.valor);
        if (!valor) return tipo === TIPO_LIDO[txt(n.config.objeto) || "dfds"];
        return /\{\{/.test(valor);
      }
      return categoria(n.tipo) !== "centi";
    });
}
