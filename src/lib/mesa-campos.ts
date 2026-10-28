import { dfdsLegiveisNaMesa, type EscopoMesa, protocoloLegivel } from "./acesso-mesa";
import { chaveSecao } from "./comparar-protocolo";
import { getDb } from "./db";
import { parseSecoes } from "./dfd";
import { type CampoMesa, camposDoPedido, type EntidadeCampos, valorParaPapel } from "./mesa-campos-core";
import { consultaCamposDfds, consultaCamposProtocolos } from "./mesa-campos-sql";

export type TuplaCampos = [number, ...(string | number | null)[]];

/** O texto da seção padrão `chave` do DFD (a 1ª com esse título padronizado). */
function textoDaSecao(secoes: string | null, chave: string): string | null {
  const s = parseSecoes(secoes).find((x) => chaveSecao(x.titulo) === chave);
  return s?.texto.trim() ? s.texto : null;
}

/**
 * Os campos EXTRAS (colunas da Mesa sob demanda) de protocolos ou DFDs: SÓ dos que a pessoa LÊ (a unidade e as linhas —
 * `escopoMesa`; os demais somem da resposta, como nas conferências) e SÓ os campos que o PAPEL recebe (sem Valores, o
 * valor da capa não sai; com "Mascarar", os dados pessoais saem mascarados). Devolve `{campos, linhas: [id, ...valores]}`.
 */
export async function camposDaMesa(esc: EscopoMesa, entidade: EntidadeCampos, ids: readonly number[], pedidos: readonly string[]) {
  const campos: CampoMesa[] = camposDoPedido(entidade, pedidos, esc.vis);
  if (!campos.length || !ids.length) return { campos: campos.map((c) => c.chave), linhas: [] as TuplaCampos[] };
  const linha = (id: number, ler: (c: CampoMesa) => string | number | null): TuplaCampos => [id, ...campos.map((c) => valorParaPapel(c, ler(c), esc.vis))];
  if (entidade === "protocolo") {
    const rows = (await consultaCamposProtocolos(getDb(), ids)).filter((r) => protocoloLegivel(esc, r));
    return { campos: campos.map((c) => c.chave), linhas: rows.map((r) => linha(r.id, (c) => (r as Record<string, string | number | null>)[c.chave] ?? null)) };
  }
  const comSecoes = campos.some((c) => c.chave.startsWith("secao:"));
  const rows = await dfdsLegiveisNaMesa(esc, await consultaCamposDfds(getDb(), ids, comSecoes));
  return {
    campos: campos.map((c) => c.chave),
    linhas: rows.map((r) =>
      linha(r.id, (c) => (c.chave.startsWith("secao:") ? textoDaSecao(r.secoes, c.chave.slice(6)) : ((r as Record<string, string | number | null>)[c.chave] ?? null))),
    ),
  };
}
