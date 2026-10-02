import { normUnidadeMedida } from "./normalize.ts";
import { normalizarCodigo } from "./parse-catalogo-comum.ts";
import { normComparacao } from "./parse-dfd-comum.ts";

/**
 * PROTOCOLO INCORPORADO EDITÁVEL — núcleo PURO da numeração dos itens no PCA (sem `getDb` → testável). Editar o
 * protocolo incorporado regrava os itens (apaga + reinsere); o nº do item no PCA (`pca_itens`) tem de SEGUIR o item:
 * - o item editado MANTÉM o nº (`parearNumeros` reencontra o nº pelo RETRATO do item);
 * - o item novo ganha o PRÓXIMO nº do PCA (no fim da gravação, na ordem do DFD);
 * - o nº que ficou sem item é BAIXADO (inativo para sempre; nunca reaproveitado).
 * O DFD entra no PCA pelo protocolo INCORPORADO em que está e sai dele quando deixa esse protocolo (`planoVinculoDfd`).
 */

/** Os motivos gravados em `pca_itens.motivo` — a MESMA régua em toda escrita (a reativação lê o "não vigente"). */
export const MOTIVO_NUMERO = {
  retirado: "Retirado do PCA",
  naoVigente: "DFD substituído/excluído no PCA",
  itemRemovido: "Item removido do DFD",
  dfdSaiu: "DFD saiu do protocolo incorporado",
  dfdExcluido: "DFD excluído",
  protocoloDevolvido: "Protocolo devolvido à Mesa",
  protocoloExcluido: "Protocolo excluído",
} as const;

/** A identidade de um item — a linha que vai ser gravada ou o RETRATO guardado no nº. */
export type IdentidadeItem = {
  item?: number | null;
  codigo?: string | null;
  descricao?: string | null;
  unidade?: string | null;
};

/** Um nº do PCA que perdeu (ou vai perder) o item nesta gravação — com o retrato do item que ele tinha. */
export type NumeroLivre = IdentidadeItem & { pcaId: number; sequencial: number };

/** As chaves do pareamento, da mais forte à mais fraca (`null` = a chave não vale para o item — falta o dado). */
function chaves(x: IdentidadeItem): (string | null)[] {
  const c = normalizarCodigo(x.codigo);
  const d = normComparacao(x.descricao);
  const u0 = normUnidadeMedida(x.unidade);
  const u = u0 === "—" ? "" : u0;
  const n = x.item != null && Number.isFinite(x.item) ? String(x.item) : "";
  const conteudo = !!(c || d);
  return [
    conteudo && n ? `${c}|${d}|${u}|${n}` : null, // tudo igual (inclusive o nº do item): o MESMO item
    conteudo ? `${c}|${d}|${u}` : null, // o item mudou de posição (ex.: um removido antes dele)
    conteudo ? `${c}|${d}` : null, // a unidade foi corrigida
    n && c ? `${n}|${c}` : null, // a descrição foi corrigida
    n && d ? `${n}|${d}` : null, // o código foi corrigido
  ];
}
const PASSOS = 5;

/**
 * PAREIA as linhas novas de um DFD com os nºs LIVRES dele (os que a regravação desligou dos itens): cada nº vai a UMA
 * linha, pela chave mais forte que casar (`chaves`); na mesma chave, o menor nº vai à 1ª linha (ordem estável — itens
 * repetidos e unificados mantêm o nº do que fica). Devolve o nº de cada linha (`null` = item novo) e os nºs que sobraram
 * (o item foi removido — a gravação os BAIXA quando termina). Linear: um índice por chave e por passo.
 */
export function parearNumeros(
  linhas: IdentidadeItem[],
  livres: NumeroLivre[],
): { numeros: ({ pcaId: number; sequencial: number } | null)[]; sobra: NumeroLivre[] } {
  const numeros: ({ pcaId: number; sequencial: number } | null)[] = linhas.map(() => null);
  const ordem = livres.map((_, i) => i).sort((a, b) => livres[a].pcaId - livres[b].pcaId || livres[a].sequencial - livres[b].sequencial);
  const usado = new Array<boolean>(livres.length).fill(false);
  const kl = livres.map(chaves);
  const kn = linhas.map(chaves);
  for (let p = 0; p < PASSOS; p++) {
    const fila = new Map<string, { idx: number[]; pos: number }>();
    for (const i of ordem) {
      const k = kl[i][p];
      if (usado[i] || k == null) continue;
      const f = fila.get(k);
      if (f) f.idx.push(i);
      else fila.set(k, { idx: [i], pos: 0 });
    }
    if (fila.size === 0) continue;
    for (let j = 0; j < linhas.length; j++) {
      const k = kn[j][p];
      if (numeros[j] != null || k == null) continue;
      const f = fila.get(k);
      if (!f) continue;
      while (f.pos < f.idx.length && usado[f.idx[f.pos]]) f.pos++;
      if (f.pos >= f.idx.length) continue;
      const i = f.idx[f.pos++];
      usado[i] = true;
      numeros[j] = { pcaId: livres[i].pcaId, sequencial: livres[i].sequencial };
    }
  }
  return { numeros, sobra: ordem.filter((i) => !usado[i]).map((i) => livres[i]) };
}

/** Um vínculo de INCORPORAÇÃO do DFD com um PCA (o legado, sem protocolo, não entra). */
export type VinculoIncorporacao = { pcaId: number; protocoloId: number };

/**
 * O que muda nos vínculos de INCORPORAÇÃO do DFD — a partir do ESTADO (idempotente: rodar de novo não muda nada): o DFD
 * está no PCA do protocolo INCORPORADO em que ele está (`desejado`) e em nenhum outro por incorporação.
 * - `sai`: os PCAs que o DFD deixa (o vínculo sai e os nºs dos itens são BAIXADOS);
 * - `entra`: o PCA em que ele entra (a ação vem do protocolo; os itens ganham nºs no fim da gravação);
 * - `troca`: o MESMO PCA por outro protocolo incorporado a ele (o vínculo passa ao protocolo novo; os nºs ficam).
 */
export function planoVinculoDfd(
  atuais: VinculoIncorporacao[],
  desejado: VinculoIncorporacao | null,
): { sai: number[]; entra: VinculoIncorporacao | null; troca: VinculoIncorporacao | null } {
  const sai = [...new Set(atuais.filter((v) => !desejado || v.pcaId !== desejado.pcaId).map((v) => v.pcaId))];
  if (!desejado) return { sai, entra: null, troca: null };
  const mesmo = atuais.find((v) => v.pcaId === desejado.pcaId);
  if (!mesmo) return { sai, entra: desejado, troca: null };
  return { sai, entra: null, troca: mesmo.protocoloId === desejado.protocoloId ? null : desejado };
}

/** O protocolo em que o DFD está → o vínculo de incorporação que ele deve ter (`null` = o protocolo não está incorporado). */
export function vinculoDesejado(p: { protocoloId: number | null; pcaId: number | null; pcaIncorporadoEm: string | null } | null): VinculoIncorporacao | null {
  if (!p || p.protocoloId == null || p.pcaId == null || !p.pcaIncorporadoEm) return null;
  return { pcaId: p.pcaId, protocoloId: p.protocoloId };
}

/** O aviso do banner do protocolo/DFD incorporado (no lugar do antigo cadeado: tudo se edita, o PCA acompanha). */
export function avisoIncorporado(nomePca: string | null | undefined): string {
  return `Incorporado ao ${nomePca?.trim() || "PCA"} — as alterações entram no PCA na hora: o item editado mantém o nº, o novo ganha o próximo nº e o removido fica com o nº inativo.`;
}

/** O impacto de tirar protocolos/DFDs INCORPORADOS do PCA (excluir, devolver, mover) — a frase das confirmações. */
export function impactoSaidaPca(nomePca: string | null | undefined, itens: number): string {
  const pca = nomePca?.trim() || "PCA";
  if (itens <= 0) return `Sai do ${pca}.`;
  return `Sai do ${pca}: ${itens === 1 ? "o item perde o nº" : `os ${itens.toLocaleString("pt-BR")} itens perdem o nº`} no PCA (fica inativo, nunca reaproveitado; incorporar de novo dá números novos).`;
}
