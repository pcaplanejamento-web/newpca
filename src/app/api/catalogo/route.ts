import { exigirAcesso, recusa } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import {
  atualizarCatalogo,
  codigosEmConflito,
  compartilharItensNoCatalogo,
  criarCatalogo,
  excluirCatalogo,
  getCatalogo,
  upsertCatalogoItens,
} from "@/lib/catalogo";
import { getPastaCatalogo, gravarComprasHistorico, gravarContratosHistorico } from "@/lib/catalogo-historico";
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
  const a = await exigirAcesso("catalogo", "visualizar");
  if ("erro" in a) return a.erro;

  const p = await parseCorpo(catalogoOpSchema, req);
  if ("resp" in p) return p.resp;
  const d = p.data;
  // Criar o catálogo à mão = Manipular; importar/atualizar = Importar (+ Excluir quando "substitui" itens de outro catálogo).
  const negado =
    d.mode === "criar-catalogo"
      ? recusa(a.acesso, "catalogo", "manipular")
      : (recusa(a.acesso, "catalogo", "importar") ?? (d.mode === "start-catalogo" && d.excluirItens.length > 0 ? recusa(a.acesso, "catalogo", "excluir") : null));
  if (negado) return negado;

  // A pasta de um catálogo NOVO tem de existir.
  const pastaId = "pastaId" in d ? d.pastaId : null;
  if (pastaId != null && !(await getPastaCatalogo(pastaId))) return erro("Pasta não encontrada.", 404);

  // HISTÓRICO DE COMPRA: cria o catálogo (tipo 'historico') + o 1º lote de contratos; os demais lotes (contratos e
  // itens) vêm pelo `append-historico`. Fora da unicidade global do código (é o registro do que foi comprado).
  if (d.mode === "start-historico") {
    const id = await criarCatalogo(d.nome, [], { tipo: "historico", pastaId });
    try {
      await gravarContratosHistorico(id, d.contratos);
    } catch (e) {
      await excluirCatalogo(id).catch(() => {});
      throw e;
    }
    await registrarAuditoria({
      usuario: a.u,
      acao: "importar",
      entidade: "catalogo",
      entidadeId: id,
      resumo: `Histórico de compra "${d.nome}" importado — ${d.totalItens} ${d.totalItens === 1 ? "item" : "itens"}`,
      depois: { nome: d.nome, tipo: "historico", itens: d.totalItens },
    });
    return ok({ catalogoId: id });
  }
  if (d.mode === "append-historico") {
    if (d.contratos.length === 0 && d.rows.length === 0) return erro("Nada para gravar.", 422);
    const cat = await getCatalogo(d.catalogoId);
    if (!cat) return erro("Catálogo não encontrado.", 404);
    if (cat.tipo !== "historico") return erro("Este catálogo não é um histórico de compra.", 422);
    if (d.contratos.length > 0) await gravarContratosHistorico(d.catalogoId, d.contratos);
    if (d.rows.length > 0) await gravarComprasHistorico(d.catalogoId, d.rows);
    return ok({ catalogoId: d.catalogoId });
  }

  // Criar catálogo VAZIO (manual) — só nome + tipos, sem itens.
  if (d.mode === "criar-catalogo") {
    const id = await criarCatalogo(d.nome, d.tiposPadrao, { pastaId });
    await registrarAuditoria({ usuario: a.u, acao: "criar", entidade: "catalogo", entidadeId: id, resumo: `Catálogo "${d.nome}" criado`, depois: { nome: d.nome } });
    return ok({ catalogoId: id, inserted: 0 });
  }

  if (d.mode === "append-catalogo-itens") {
    const cat = await getCatalogo(d.catalogoId);
    if (!cat) return erro("Catálogo não encontrado para acrescentar itens.", 404);
    if (cat.tipo !== "agenda") return erro("Um histórico de compra não recebe itens da agenda.", 422);
    const conf = await codigosEmConflito(d.rows.map((r) => r.codigo), d.catalogoId);
    if (conf.length > 0) return erro(mensagemConflito(conf), 422);
    const r = await upsertCatalogoItens(d.catalogoId, d.rows);
    return ok({ catalogoId: d.catalogoId, inserted: r.inserted });
  }

  // start-catalogo — novo (catalogoId nulo) ou atualização de um existente. Sem itens novos, só quando compartilha os
  // existentes (o "só compartilhar" também é importação).
  if (d.rows.length === 0 && d.compartilharItens.length === 0) return erro("Nada para importar.", 422);
  const alvo = d.catalogoId;
  const catAlvo = alvo != null ? await getCatalogo(alvo) : null;
  if (alvo != null && !catAlvo) return erro("Catálogo a atualizar não encontrado.", 404);
  if (catAlvo && catAlvo.tipo !== "agenda") return erro("Um histórico de compra não recebe itens da agenda.", 422);
  // Guarda da unicidade global: ignora os conflitos que o usuário RESOLVEU com "substituir"
  // (o existente será excluído no mesmo lote atômico); se sobrar algum → 422.
  const conf = (await codigosEmConflito(d.rows.map((r) => r.codigo), alvo)).filter((c) => !d.excluirItens.includes(c.id));
  if (conf.length > 0) return erro(mensagemConflito(conf), 422);

  if (alvo == null) {
    const id = await criarCatalogo(d.nome, d.tiposPadrao, { pastaId });
    try {
      const r = await upsertCatalogoItens(id, d.rows, { excluirItens: d.excluirItens });
      if (d.compartilharItens.length > 0) await compartilharItensNoCatalogo(id, d.compartilharItens);
      await registrarAuditoria({ usuario: a.u, acao: "importar", entidade: "catalogo", entidadeId: id, resumo: `Catálogo "${d.nome}" importado — ${r.inserted} ${r.inserted === 1 ? "item" : "itens"}`, depois: { nome: d.nome, itens: r.inserted } });
      return ok({ catalogoId: id, inserted: r.inserted });
    } catch (e) {
      await excluirCatalogo(id).catch(() => {}); // não deixa catálogo órfão vazio
      throw e;
    }
  }
  await atualizarCatalogo(alvo, { nome: d.nome, tiposPadrao: d.tiposPadrao });
  const r = await upsertCatalogoItens(alvo, d.rows, { excluirItens: d.excluirItens });
  if (d.compartilharItens.length > 0) await compartilharItensNoCatalogo(alvo, d.compartilharItens);
  await registrarAuditoria({ usuario: a.u, acao: "importar", entidade: "catalogo", entidadeId: alvo, resumo: `Catálogo "${d.nome}" atualizado — ${r.inserted} ${r.inserted === 1 ? "item" : "itens"}`, depois: { nome: d.nome, itens: r.inserted } });
  return ok({ catalogoId: alvo, inserted: r.inserted });
}
