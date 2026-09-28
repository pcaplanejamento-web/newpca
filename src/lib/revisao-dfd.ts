import { comportamentoNo, type RegrasAvaliacao, regrasPadrao } from "./avaliacao-core.ts";
import type { CapaEditavel } from "./dfd-edicao.ts";
import { normalizarSecoesDfd, semValorUnitario } from "./dfd-tratamento.ts";
import { limparTexto } from "./normalize.ts";
import { type DfdParseado, extrairRefsDfd, limparDescricaoItem, norm, tipoCurtoDfd } from "./parse-dfd-comum.ts";
import { larguraVisual, refluirTexto } from "./texto-corrido.ts";

/**
 * REVISÃO dos dados GRAVADOS (botão Atualizar dos banners de DFD, item e protocolo): os MESMOS tratamentos automáticos
 * da importação, aplicados ao que já está no banco — o que foi importado antes deles volta tratado. Nunca mexe em
 * identificadores (nº, planejamento, ano do PCA), valores, quantidades, assinaturas nem na unidade. Idempotente
 * (revisar de novo não muda nada). Puro/testável.
 */

/** O TIPO de ajuste (agrupa o aviso de um protocolo inteiro: "texto em parágrafos em 12 DFDs"). */
export type TipoAjusteRevisao = "paragrafos" | "cabecalhoPagina" | "cabecalho" | "padronizacao" | "referencias" | "itens" | "capa";
/** Um ajuste feito pela revisão e em quantos lugares (o aviso resume: "texto de 3 seções em parágrafos"). */
export type AjusteRevisao = { tipo: TipoAjusteRevisao; rotulo: string; qtd: number };
const ROTULO_LOTE: Record<TipoAjusteRevisao, string> = {
  paragrafos: "texto em parágrafos",
  cabecalhoPagina: "cabeçalho de página fora das seções",
  cabecalho: "campos do cabeçalho limpos",
  padronizacao: "padronização automática",
  referencias: "referências da renovação lidas do texto",
  itens: "itens com a descrição/unidade limpa",
  capa: "capa com o texto limpo",
};
export type RevisaoDfd = { dfd: DfdParseado; ajustes: AjusteRevisao[]; itensAlterados: boolean };

// Campos de texto do cabeçalho do DFD (os identificadores ficam de fora).
const CAMPOS_TEXTO = ["objeto", "orgaoEntidade", "setorRequisitante", "responsavel", "matricula", "email", "telefone"] as const;

/** Texto limpo de um campo de UMA linha: sem letras nem números (ex.: o ":" de uma "Matrícula:" vazia) = vazio. */
function campoLimpo(v: string | null): string | null {
  const t = limparTexto(v);
  return /[\p{L}\p{N}]/u.test(t) ? t : null;
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * Revisa UM DFD gravado:
 * 1) SEÇÕES em TEXTO CORRIDO (`refluirTexto` — as quebras que eram só a largura da linha do PDF somem; parágrafos,
 *    listas e rótulos ficam) e sem a linha do ÓRGÃO emissor que o cabeçalho de página deixava no meio;
 * 2) campos do cabeçalho com o texto limpo (uma "Matrícula:" vazia lida como ":" volta a vazia);
 * 3) a PADRONIZAÇÃO automática do ADM (prioridade/previsão/sinônimos — `normalizarSecoesDfd`);
 * 4) DFD-R sem nenhuma referência: contrato/ARP/licitação lidos do texto (`extrairRefsDfd`);
 * 5) descrição/unidade dos ITENS limpas (marcadores de lista, TAB, invisíveis) — só com `itens` (o host desliga quando
 *    o servidor recusaria regravar os itens).
 */
export function revisarDfd(
  d: DfdParseado,
  opts: { regras?: RegrasAvaliacao; anoPca?: number | null; itens?: boolean } = {},
): RevisaoDfd {
  const ajustes: AjusteRevisao[] = [];
  let dfd = d;

  // 1) Seções: a linha do órgão emissor (cabeçalho de página) sai; o resto vira texto corrido.
  const orgao = norm(d.orgaoEntidade);
  let removidas = 0;
  const limpas = d.secoes.map((s) => {
    const linhas = String(s.texto ?? "")
      .split(/\r?\n/)
      .map((l) => limparTexto(l));
    const sem = orgao ? linhas.filter((l) => norm(l) !== orgao) : linhas;
    // Só quando sobra texto — uma seção que é SÓ o nome do órgão é conteúdo, não vazamento.
    if (sem.length < linhas.length && sem.some((l) => l)) {
      removidas += linhas.length - sem.length;
      return sem.join("\n");
    }
    return linhas.join("\n");
  });
  const largura = larguraVisual(limpas);
  let emParagrafos = 0;
  const secoes = d.secoes.map((s, i) => {
    const texto = refluirTexto(limpas[i], largura);
    if (texto === s.texto) return s;
    emParagrafos++;
    return { ...s, texto };
  });
  if (emParagrafos > 0) dfd = { ...dfd, secoes };
  if (emParagrafos > 0) ajustes.push({ tipo: "paragrafos", rotulo: `texto de ${plural(emParagrafos, "seção", "seções")} em parágrafos`, qtd: emParagrafos });
  if (removidas > 0)
    ajustes.push({ tipo: "cabecalhoPagina", rotulo: `${plural(removidas, "linha", "linhas")} do cabeçalho de página fora das seções`, qtd: removidas });

  // 2) Cabeçalho.
  let campos = 0;
  for (const k of CAMPOS_TEXTO) {
    const v = campoLimpo(dfd[k]);
    if (v !== (dfd[k] ?? null)) {
      dfd = { ...dfd, [k]: v };
      campos++;
    }
  }
  if (campos > 0) ajustes.push({ tipo: "cabecalho", rotulo: `${plural(campos, "campo", "campos")} do cabeçalho com o texto limpo`, qtd: campos });

  // 3) Padronização automática do ADM (a mesma da importação).
  const norm3 = normalizarSecoesDfd(dfd, opts.regras ?? regrasPadrao(), opts.anoPca ?? dfd.anoPca);
  const padronizadas = norm3.dfd.secoes.filter((s, i) => s.texto !== dfd.secoes[i]?.texto || s.titulo !== dfd.secoes[i]?.titulo).length +
    Math.max(0, norm3.dfd.secoes.length - dfd.secoes.length);
  if (padronizadas > 0) {
    dfd = norm3.dfd;
    ajustes.push({ tipo: "padronizacao", rotulo: `padronização automática em ${plural(padronizadas, "seção", "seções")}`, qtd: padronizadas });
  }

  // 4) DFD-R sem nenhuma referência de renovação: as do texto.
  if (tipoCurtoDfd(dfd.tipo) === "DFD-R" && !dfd.numeroContrato && !dfd.numeroAta && !dfd.numeroLicitacao) {
    const r = extrairRefsDfd(dfd.secoes, dfd.objeto);
    if (r.numeroContrato || r.numeroAta || r.numeroLicitacao) {
      dfd = { ...dfd, numeroContrato: r.numeroContrato, numeroAta: r.numeroAta, numeroLicitacao: r.numeroLicitacao };
      ajustes.push({ tipo: "referencias", rotulo: "referências da renovação lidas do texto", qtd: 1 });
    }
  }

  // 5) Itens: descrição/unidade limpas.
  let itens = 0;
  if (opts.itens !== false) {
    const novos = dfd.itens.map((it) => {
      const descricao = limparDescricaoItem(it.descricao) || null;
      const unidade = limparTexto(it.unidade) || null;
      if (descricao === (it.descricao ?? null) && unidade === (it.unidade ?? null)) return it;
      itens++;
      return { ...it, descricao, unidade };
    });
    if (itens > 0) {
      dfd = { ...dfd, itens: novos };
      ajustes.push({ tipo: "itens", rotulo: `${plural(itens, "item", "itens")} com a descrição/unidade limpa`, qtd: itens });
    }
  }
  return { dfd, ajustes, itensAlterados: itens > 0 };
}

/**
 * Os itens do DFD podem ser REGRAVADOS pela revisão? Não quando o servidor recusaria: algum item sem valor unitário e o
 * ponto "valor unitário" bloqueante para este DFD (a mesma régua do `PATCH /api/dfd/[id]`).
 */
export function podeRevisarItens(d: DfdParseado, regras: RegrasAvaliacao, categoria: string | null): boolean {
  if (!d.itens.some((it) => semValorUnitario(it.valorUnitario))) return true;
  return comportamentoNo(regras, "item.valorUnitario", { dfdTipo: tipoCurtoDfd(d.tipo), categoria }) !== "bloqueia";
}

/** Revisa a CAPA do protocolo gravado: os campos de conteúdo com o texto limpo (uma linha, sem quebras soltas). */
export function revisarCapa(capa: CapaEditavel): { capa: CapaEditavel; ajustes: AjusteRevisao[] } {
  let out = capa;
  let n = 0;
  for (const k of ["interessado", "documento", "assunto", "observacao", "localReparticao"] as const) {
    const v = campoLimpo(capa[k]);
    if (v !== (capa[k] ?? null)) {
      out = { ...out, [k]: v };
      n++;
    }
  }
  return { capa: out, ajustes: n > 0 ? [{ tipo: "capa", rotulo: `${plural(n, "campo", "campos")} da capa com o texto limpo`, qtd: n }] : [] };
}

/** Frase do aviso: os ajustes juntos ("texto de 2 seções em parágrafos; 1 item com a descrição/unidade limpa"). */
export function resumoRevisao(ajustes: AjusteRevisao[]): string {
  return ajustes.map((a) => a.rotulo).join("; ");
}

/** Frase do aviso de um PROTOCOLO: cada tipo de ajuste com quantos DFDs o tiveram ("texto em parágrafos em 12 DFDs"). */
export function resumoRevisaoLote(porDfd: AjusteRevisao[][]): string {
  const n = new Map<TipoAjusteRevisao, number>();
  for (const ajustes of porDfd) for (const t of new Set(ajustes.map((a) => a.tipo))) n.set(t, (n.get(t) ?? 0) + 1);
  return [...n].map(([t, q]) => `${ROTULO_LOTE[t]} em ${plural(q, "DFD", "DFDs")}`).join("; ");
}
