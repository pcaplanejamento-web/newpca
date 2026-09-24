import { exigirEditor } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { gravarSinonimos, listarUnidadesMedida } from "@/lib/padronizacao";
import { chaveUnidade, LIMITES_PADRONIZACAO, limparSinonimos, resolverUnidades } from "@/lib/padronizacao-core";
import { sinonimosUnidadesSchema } from "@/lib/padronizacao-validation";

export const dynamic = "force-dynamic";

/**
 * Grafias dos itens viram SINÔNIMOS de unidades cadastradas (a comparação: "Adicionar a UN", "Aceitar as sugestões").
 * Num lote atômico; por grafia, a recusa não derruba as demais: a unidade que não existe mais e a grafia que já é de
 * OUTRA unidade viram `falhas` (a que já é da própria unidade é ignorada — nada muda).
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
  const falhas: { texto: string; motivo: string }[] = [];
  for (const { unidadeId, texto } of p.data.itens) {
    const u = porId.get(unidadeId);
    if (!u) {
      falhas.push({ texto, motivo: "A unidade não existe mais." });
      continue;
    }
    const chave = chaveUnidade(texto);
    const atual = dono(texto);
    if (atual && atual.id !== unidadeId) {
      falhas.push({ texto, motivo: `Já é uma grafia da unidade ${atual.sigla}.` });
      continue;
    }
    if (atual || !chave) continue;
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
  const gravar = new Map<number, string[]>();
  const adicionados: { unidadeId: number; textos: string[] }[] = [];
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
    gravar.set(id, lista);
    adicionados.push({ unidadeId: id, textos: novas });
  }
  if (gravar.size === 0 && falhas.length > 0) return erro(falhas[0].motivo, 409);
  await gravarSinonimos(gravar);
  for (const a of adicionados) {
    const u = porId.get(a.unidadeId);
    await registrarAuditoria({
      usuario: g.u,
      acao: "editar",
      entidade: "unidade_medida",
      entidadeId: a.unidadeId,
      resumo: `Unidade de medida ${u?.sigla ?? a.unidadeId}: sinônimos adicionados (${a.textos.join(", ")})`,
      antes: { sinonimos: u?.sinonimos ?? [] },
      depois: { sinonimos: gravar.get(a.unidadeId) ?? [] },
    });
  }
  return ok({ adicionados: adicionados.reduce((s, a) => s + a.textos.length, 0), falhas });
}
