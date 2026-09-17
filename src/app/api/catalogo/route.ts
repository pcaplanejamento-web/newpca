import { exigirEditor } from "@/lib/api-auth";
import {
  atualizarCatalogo,
  codigosEmConflito,
  criarCatalogo,
  excluirCatalogo,
  getCatalogo,
  upsertCatalogoItens,
} from "@/lib/catalogo";
import { catalogoOpSchema } from "@/lib/catalogo-validation";
import { erro, ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Escrita de CATÁLOGO em LOTES (só editor). `start-catalogo` cria um catálogo novo OU
 * atualiza um existente (`catalogoId`) e grava o 1º lote; `append-catalogo-itens`
 * acrescenta os demais. Em TODO lote confere a UNICIDADE GLOBAL do código: um código
 * já presente em OUTRO catálogo é conflito (422) — sem isso o upsert por código
 * poderia sobrescrever, em silêncio, um item de outro catálogo. Merge preservando os
 * tipos já configurados (ver `upsertCatalogoItens`).
 */
function mensagemConflito(conf: { codigo: string; catalogoNome: string }[]): string {
  const amostra = conf.slice(0, 5).map((c) => `${c.codigo} (${c.catalogoNome})`).join(", ");
  return `Código(s) já cadastrado(s) em outro catálogo: ${amostra}${conf.length > 5 ? "…" : ""}.`;
}

export async function POST(req: Request) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;

  const p = await parseCorpo(catalogoOpSchema, req);
  if ("resp" in p) return p.resp;
  const d = p.data;

  // Criar catálogo VAZIO (manual) — só nome + tipos, sem itens.
  if (d.mode === "criar-catalogo") {
    const id = await criarCatalogo(d.nome, d.tiposPadrao);
    return ok({ catalogoId: id, inserted: 0 });
  }

  if (d.mode === "append-catalogo-itens") {
    const cat = await getCatalogo(d.catalogoId);
    if (!cat) return erro("Catálogo não encontrado para acrescentar itens.", 404);
    const conf = await codigosEmConflito(d.rows.map((r) => r.codigo), d.catalogoId);
    if (conf.length > 0) return erro(mensagemConflito(conf), 422);
    const r = await upsertCatalogoItens(d.catalogoId, d.rows);
    return ok({ catalogoId: d.catalogoId, inserted: r.inserted });
  }

  // start-catalogo — novo (catalogoId nulo) ou atualização de um existente.
  const alvo = d.catalogoId;
  if (alvo != null && !(await getCatalogo(alvo))) return erro("Catálogo a atualizar não encontrado.", 404);
  // Guarda da unicidade global: ignora os conflitos que o usuário RESOLVEU com "substituir"
  // (o existente será excluído no mesmo lote atômico); se sobrar algum → 422.
  const conf = (await codigosEmConflito(d.rows.map((r) => r.codigo), alvo)).filter((c) => !d.excluirItens.includes(c.id));
  if (conf.length > 0) return erro(mensagemConflito(conf), 422);

  if (alvo == null) {
    const id = await criarCatalogo(d.nome, d.tiposPadrao);
    try {
      const r = await upsertCatalogoItens(id, d.rows, { excluirItens: d.excluirItens });
      return ok({ catalogoId: id, inserted: r.inserted });
    } catch (e) {
      await excluirCatalogo(id).catch(() => {}); // não deixa catálogo órfão vazio
      throw e;
    }
  }
  await atualizarCatalogo(alvo, { nome: d.nome, tiposPadrao: d.tiposPadrao });
  const r = await upsertCatalogoItens(alvo, d.rows, { excluirItens: d.excluirItens });
  return ok({ catalogoId: alvo, inserted: r.inserted });
}
