/**
 * Núcleo PURO da `Selecao` (o dropdown do sistema no lugar da lista nativa do `<select>`): as opções lidas do select
 * escondido, o movimento pelo teclado, o "digitar para saltar" e a busca. Sem DOM — testado.
 */
import { predicadoBusca } from "./tabela-filtros.ts";

/**
 * Uma opção lida do `<select>` nativo: o valor, o texto, o grupo (`optgroup`), desabilitada e a dica (`title`) + os
 * extras pelos atributos `data-*` da `<option>`: `detalhe` (a 2ª linha), `aviso` (o ponto âmbar com o motivo) e `cor`
 * (o ponto na cor — ex.: a da situação).
 */
export type OpcaoSelecao = {
  valor: string;
  texto: string;
  grupo?: string;
  desabilitada?: boolean;
  dica?: string;
  detalhe?: string;
  aviso?: string;
  cor?: string;
};

/** Acima disso a lista ganha a BUSCA no topo. */
export const MIN_BUSCA_SELECAO = 12;
/** Acima disso, numa tela estreita, a lista abre como FOLHA que sobe de baixo. */
export const MIN_FOLHA_SELECAO = 8;

/** Só uma cor SEGURA vira estilo (hex, `var(--token)`, rgb/hsl) — nada de texto livre num `style`. */
export function corSegura(cor: string | undefined): string | undefined {
  if (!cor) return undefined;
  const c = cor.trim();
  return /^#[0-9a-f]{3,8}$/i.test(c) || /^var\(--[a-z0-9-]+\)$/i.test(c) || /^(rgb|hsl)a?\([\d\s.,%/]+\)$/i.test(c) ? c : undefined;
}

/** A dica da opção: o `title` e o aviso, juntos. */
export function dicaDaOpcao(o: OpcaoSelecao): string | undefined {
  const partes = [o.dica, o.aviso].filter(Boolean);
  return partes.length ? partes.join(" — ") : undefined;
}

/**
 * A próxima opção HABILITADA a partir de `i` andando `passo` (1/-1); sem sair das pontas (fica na última habilitada).
 * `i` = -1 com passo 1 começa na 1ª; `i` = tamanho com passo -1, na última. Nenhuma habilitada = -1.
 */
export function proximaHabilitada(opcoes: readonly OpcaoSelecao[], i: number, passo: 1 | -1): number {
  for (let j = i + passo; j >= 0 && j < opcoes.length; j += passo) if (!opcoes[j].desabilitada) return j;
  if (i >= 0 && i < opcoes.length && !opcoes[i].desabilitada) return i;
  // Saiu da ponta sem achar: a habilitada mais perto no sentido contrário.
  for (let j = Math.min(Math.max(i, 0), opcoes.length - 1); j >= 0 && j < opcoes.length; j -= passo) if (!opcoes[j].desabilitada) return j;
  return -1;
}

const semAcento = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/**
 * DIGITAR PARA SALTAR: a 1ª opção habilitada, DEPOIS de `desde` (e voltando ao começo), cujo texto começa com `texto`
 * (sem acento/caixa). A mesma letra repetida ("aaa") percorre as que começam com ela, como no select nativo. -1 = nada.
 */
export function typeahead(opcoes: readonly OpcaoSelecao[], texto: string, desde: number): number {
  const t = semAcento(texto);
  if (!t || opcoes.length === 0) return -1;
  const mesmaLetra = t.length > 1 && [...t].every((c) => c === t[0]);
  const alvo = mesmaLetra ? t[0] : t;
  // Com a mesma letra repetida (ou uma letra só), anda a partir da próxima; com um prefixo, a atual ainda vale.
  const inicio = mesmaLetra || t.length === 1 ? desde + 1 : Math.max(desde, 0);
  for (let k = 0; k < opcoes.length; k++) {
    const j = (inicio + k) % opcoes.length;
    if (!opcoes[j].desabilitada && semAcento(opcoes[j].texto).startsWith(alvo)) return j;
  }
  return -1;
}

/** A BUSCA da lista (sem acento/caixa; vários termos com ":"), pelo texto, o grupo e o detalhe. Vazia = todas. */
export function filtrarOpcoes(opcoes: readonly OpcaoSelecao[], busca: string): OpcaoSelecao[] {
  const casa = predicadoBusca(busca);
  return casa ? opcoes.filter((o) => casa([o.texto, o.grupo, o.detalhe])) : [...opcoes];
}

/** Iguais em conteúdo (a leitura do select a cada render só troca o estado quando algo mudou). */
export function opcoesIguais(a: readonly OpcaoSelecao[], b: readonly OpcaoSelecao[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((o, i) => {
    const p = b[i];
    return (
      o.valor === p.valor &&
      o.texto === p.texto &&
      o.grupo === p.grupo &&
      !!o.desabilitada === !!p.desabilitada &&
      o.dica === p.dica &&
      o.detalhe === p.detalhe &&
      o.aviso === p.aviso &&
      o.cor === p.cor
    );
  });
}
