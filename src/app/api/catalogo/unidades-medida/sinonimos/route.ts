import { exigirEditor } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { ok, parseCorpo } from "@/lib/http";
import { gravarSinonimos, listarUnidadesMedida } from "@/lib/padronizacao";
import { chaveUnidade, LIMITES_PADRONIZACAO, limparSinonimos, resolverUnidades } from "@/lib/padronizacao-core";
import { sinonimosUnidadesSchema } from "@/lib/padronizacao-validation";

export const dynamic = "force-dynamic";

type Falha = { texto: string; motivo: string };

/**
 * Grafias dos itens viram SINÔNIMOS de unidades cadastradas (a comparação: "Adicionar" na linha, "Adicionar N
 * sugestões"). Num lote atômico e CONDICIONAL (cada unidade só é gravada se a lista dela não mudou desde a leitura — nada
 * de sobrescrever outra pessoa); por grafia, a recusa não derruba as demais: vira `falhas` (com a grafia e o motivo
 * DELA) a unidade que não existe mais, a grafia sem letras/números, a que já é de OUTRA unidade, a mesma grafia pedida
 * para duas unidades, o excesso além do teto e a unidade alterada no meio. A grafia que já é da própria unidade é
 * ignorada (nada muda). Devolve SEMPRE o relatório `{adicionados, falhas}` — também quando nada entrou (quem chama
 * atribui cada recusa à grafia certa).
 */
export async function POST(req: Request) {
  const g = await exigirEditor();
  if ("erro" in g) return g.erro;
  const p = await parseCorpo(sinonimosUnidadesSchema, req);
  if ("resp" in p) return p.resp;
  const unidades = await listarUnidadesMedida();
  const porId = new Map(unidades.map((u) => [u.id, u]));
  const dono = resolverUnidades(unidades);
  const novos = new Map<number, string[]>();
  const noLote = new Map<string, number>(); // grafia → a unidade que a recebe NESTE lote (uma grafia, uma unidade)
  const falhas: Falha[] = [];
  for (const { unidadeId, texto } of p.data.itens) {
    const u = porId.get(unidadeId);
    if (!u) {
      falhas.push({ texto, motivo: "A unidade não existe mais." });
      continue;
    }
    const chave = chaveUnidade(texto);
    if (!chave) {
      falhas.push({ texto, motivo: "A grafia precisa ter letras ou números." });
      continue;
    }
    const atual = dono(texto);
    if (atual && atual.id !== unidadeId) {
      falhas.push({ texto, motivo: `Já é uma grafia da unidade ${atual.sigla}.` });
      continue;
    }
    if (atual) continue;
    const outra = noLote.get(chave);
    if (outra != null && outra !== unidadeId) {
      falhas.push({ texto, motivo: "A mesma grafia foi pedida para duas unidades." });
      continue;
    }
    noLote.set(chave, unidadeId);
    const l = novos.get(unidadeId) ?? [];
    l.push(texto);
    novos.set(unidadeId, l);
  }
  // A lista final de cada unidade (os atuais + os novos, sem repetir a mesma grafia — nem entre os do lote).
  const gravar = new Map<number, { lidos: string[]; novos: string[] }>();
  const adicionados = new Map<number, string[]>();
  for (const [id, textos] of novos) {
    const u = porId.get(id);
    if (!u) continue;
    const todas = limparSinonimos(u.sigla, u.nome, [...u.sinonimos, ...textos]);
    // O teto do cadastro (o mesmo do Zod da edição — senão a unidade não se editaria mais): o excesso vira falha.
    const lista = todas.slice(0, Math.max(LIMITES_PADRONIZACAO.sinonimos, u.sinonimos.length));
    for (const t of todas.slice(lista.length)) falhas.push({ texto: t, motivo: `A unidade ${u.sigla} já tem ${LIMITES_PADRONIZACAO.sinonimos} sinônimos.` });
    const antigas = new Set(u.sinonimos.map(chaveUnidade));
    const novas = lista.filter((t) => !antigas.has(chaveUnidade(t)));
    if (novas.length === 0) continue;
    gravar.set(id, { lidos: u.sinonimos, novos: lista });
    adicionados.set(id, novas);
  }
  const gravados = await gravarSinonimos(gravar);
  let total = 0;
  for (const [id, textos] of adicionados) {
    const u = porId.get(id);
    if (!gravados.has(id)) {
      for (const t of textos) falhas.push({ texto: t, motivo: `A unidade ${u?.sigla ?? id} foi alterada enquanto isso — tente de novo.` });
      continue;
    }
    total += textos.length;
    await registrarAuditoria({
      usuario: g.u,
      acao: "editar",
      entidade: "unidade_medida",
      entidadeId: id,
      resumo: `Unidade de medida ${u?.sigla ?? id}: sinônimos adicionados (${textos.join(", ")})`,
      antes: { sinonimos: u?.sinonimos ?? [] },
      depois: { sinonimos: gravar.get(id)?.novos ?? [] },
    });
  }
  return ok({ adicionados: total, falhas });
}
