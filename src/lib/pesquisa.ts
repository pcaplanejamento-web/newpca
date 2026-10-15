import { and, desc, eq, isNull, like, or, sql } from "drizzle-orm";
import {
  automacaoFluxos,
  cargos,
  catalogoCompras,
  catalogoItens,
  catalogos,
  feriados,
  grupos,
  orcamentoItens,
  orcamentos,
  orgaos,
  papeis,
  protocoloSituacoes,
  reparticoes,
  usuarios,
} from "@/db/schema";
import { type Acesso, componenteLibera, podeTela } from "./acesso";
import { linkEvento } from "./calendario-core";
import { getDb } from "./db";
import { dataIsoBrasilia, dataBR } from "./format";
import type { ResultadoPesquisa, TipoPesquisa } from "./pesquisa-core";
import { buscarNoCalendario } from "./tarefas";
import { quadrosDoCalendario } from "./tarefas-dados";

/**
 * PESQUISA DO SISTEMA — os dados das telas além da Mesa (orçamento, catálogo, histórico de compra, calendário e a
 * ADMINISTRAÇÃO). REGRA: cada tipo só sai para quem ABRE a tela (e a aba/visão) em que o dado está — a administração, só o
 * ADM — e o link é o da tela/aba que abre o registro (`?abrir=`). Sem permissão = nenhum resultado (`null`).
 */
export async function pesquisarOutros(a: Acesso, tipo: TipoPesquisa, q: string, limite: number): Promise<ResultadoPesquisa[] | null> {
  const db = getDb();
  const termo = `%${q.trim().replace(/[%_]/g, "")}%`;
  const LIM = Math.min(50, limite);
  const admin = a.u.admin;
  const enc = encodeURIComponent;

  if (tipo === "lancamento") {
    if (!podeTela(a, "orcamento").visualizar || !componenteLibera(a, "orcamento.lancamentos")) return null;
    const ls = await db
      .select({
        id: orcamentoItens.id,
        orcamentoId: orcamentoItens.orcamentoId,
        ano: orcamentos.ano,
        ficha: orcamentoItens.ficha,
        acao: orcamentoItens.acao,
        elemento: orcamentoItens.nomeElemento,
        codigo: orcamentoItens.codigoElemento,
        unidade: orcamentoItens.unidade,
      })
      .from(orcamentoItens)
      .innerJoin(orcamentos, eq(orcamentos.id, orcamentoItens.orcamentoId))
      .where(
        or(
          like(orcamentoItens.ficha, termo),
          like(orcamentoItens.acao, termo),
          like(orcamentoItens.nomeElemento, termo),
          like(orcamentoItens.codigoElemento, termo),
          like(orcamentoItens.unidade, termo),
          like(orcamentoItens.orgao, termo),
          like(orcamentoItens.funcao, termo),
          like(orcamentoItens.programa, termo),
          like(orcamentoItens.fonte, termo),
        ),
      )
      .orderBy(desc(orcamentos.ano), orcamentoItens.sequencial)
      .limit(LIM);
    return ls.map((l) => ({
      id: l.id,
      rotulo: `${l.ficha ? `Ficha ${l.ficha} · ` : ""}${l.acao ?? l.elemento ?? "Lançamento"}`,
      detalhe: [`Orçamento ${l.ano}`, l.codigo ?? "", l.unidade ?? ""].filter(Boolean).join(" · "),
      href: `/painel/orcamento/${l.orcamentoId}?aba=lancamentos&abrir=${l.id}`,
    }));
  }

  if (tipo === "catalogo") {
    if (!podeTela(a, "catalogo").visualizar || !componenteLibera(a, "catalogo.catalogos")) return null;
    const ls = await db
      .select({ id: catalogoItens.id, catalogoId: catalogoItens.catalogoId, codigo: catalogoItens.codigo, descricao: catalogoItens.descricao, catalogo: catalogos.nome })
      .from(catalogoItens)
      .innerJoin(catalogos, eq(catalogos.id, catalogoItens.catalogoId))
      .where(or(like(catalogoItens.codigo, termo), like(catalogoItens.descricao, termo)))
      .orderBy(desc(catalogoItens.id))
      .limit(LIM);
    return ls.map((l) => ({
      id: l.id,
      rotulo: `${l.codigo} · ${l.descricao.slice(0, 90)}`,
      detalhe: l.catalogo,
      href: `/painel/catalogo?abrir=${enc(`catalogo:${l.catalogoId}:${l.codigo}`)}`,
    }));
  }

  if (tipo === "historico") {
    if (!podeTela(a, "catalogo").visualizar || !componenteLibera(a, "catalogo.historico")) return null;
    const ls = await db
      .select({
        id: catalogoCompras.id,
        catalogoId: catalogoCompras.catalogoId,
        codigo: catalogoCompras.codigo,
        descricao: catalogoCompras.descricao,
        contrato: catalogoCompras.idContrato,
        catalogo: catalogos.nome,
      })
      .from(catalogoCompras)
      .innerJoin(catalogos, eq(catalogos.id, catalogoCompras.catalogoId))
      .where(or(like(catalogoCompras.codigo, termo), like(catalogoCompras.descricao, termo), like(catalogoCompras.idContrato, termo), like(catalogoCompras.processo, termo)))
      .orderBy(desc(catalogoCompras.id))
      .limit(LIM);
    return ls.map((l) => ({
      id: l.id,
      rotulo: `${l.codigo} · ${l.descricao.slice(0, 90)}`,
      detalhe: `${l.catalogo} · Contrato ${l.contrato}`,
      href: `/painel/catalogo?abrir=${enc(`historico:${l.catalogoId}`)}`,
    }));
  }

  if (tipo === "evento") {
    if (!podeTela(a, "calendario").visualizar) return null;
    const hoje = dataIsoBrasilia(new Date().toISOString());
    // A MESMA busca do Calendário (os quadros da pessoa; o privado de quem não participa não entra).
    const rs = (await buscarNoCalendario(await quadrosDoCalendario(a), q, a.u.id, hoje)).filter((r) => r.tipo === "evento").slice(0, LIM);
    return rs.map((r, i) => ({
      id: i + 1,
      rotulo: r.titulo,
      detalhe: [dataBR(r.data), r.hora ?? "", r.local ?? ""].filter(Boolean).join(" · "),
      href: linkEvento(r.data, r.chave),
    }));
  }

  // ─── ADMINISTRAÇÃO (só o ADM) ───
  if (!admin) return null;

  if (tipo === "usuario") {
    const ls = await db
      .select({ id: usuarios.id, nome: usuarios.nome, apelido: usuarios.apelido, email: usuarios.email, matricula: usuarios.matricula, status: usuarios.status })
      .from(usuarios)
      .where(or(like(usuarios.nome, termo), like(usuarios.apelido, termo), like(usuarios.email, termo), like(usuarios.matricula, termo)))
      .orderBy(usuarios.nome)
      .limit(LIM);
    return ls.map((l) => ({
      id: l.id,
      rotulo: l.apelido ? `${l.apelido} (${l.nome})` : l.nome,
      detalhe: [l.email, l.matricula ? `Mat. ${l.matricula}` : "", l.status === "ativo" ? "" : l.status].filter(Boolean).join(" · "),
      href: `/painel/usuarios?abrir=${l.id}`,
    }));
  }
  if (tipo === "orgao") {
    const ls = await db
      .select({ id: orgaos.id, nome: orgaos.nome, sigla: orgaos.sigla })
      .from(orgaos)
      .where(or(like(orgaos.nome, termo), like(orgaos.sigla, termo), like(orgaos.entidadeCenti, termo)))
      .orderBy(orgaos.nome)
      .limit(LIM);
    return ls.map((l) => ({ id: l.id, rotulo: `${l.sigla} · ${l.nome}`, detalhe: "Órgão", href: `/painel/orgaos?abrir=${l.id}` }));
  }
  if (tipo === "unidade") {
    const ls = await db
      .select({ id: reparticoes.id, nome: reparticoes.nome, codigo: reparticoes.codigo, orgaoId: reparticoes.orgaoId, orgao: orgaos.sigla })
      .from(reparticoes)
      .innerJoin(orgaos, eq(orgaos.id, reparticoes.orgaoId))
      .where(and(sql`${reparticoes.codigo} <> 'GERAL'`, or(like(reparticoes.nome, termo), like(reparticoes.codigo, termo))))
      .orderBy(reparticoes.nome)
      .limit(LIM);
    return ls.map((l) => ({ id: l.id, rotulo: `${l.codigo} · ${l.nome}`, detalhe: `Unidade · ${l.orgao}`, href: `/painel/orgaos/${l.orgaoId}?abrir=${l.id}` }));
  }
  if (tipo === "grupo") {
    const ls = await db.select({ id: grupos.id, nome: grupos.nome }).from(grupos).where(like(grupos.nome, termo)).orderBy(grupos.nome).limit(LIM);
    return ls.map((l) => ({ id: l.id, rotulo: l.nome, detalhe: "Grupo de acesso", href: `/painel/grupos?abrir=${l.id}` }));
  }
  if (tipo === "cadastro") {
    // Os cadastros das abas de Configurações: o link leva à aba (o cadastro está na lista dela).
    const [ps, cs, ss, fs] = await Promise.all([
      db.select({ id: papeis.id, nome: papeis.nome }).from(papeis).where(like(papeis.nome, termo)).limit(LIM),
      db.select({ id: cargos.id, nome: cargos.nome }).from(cargos).where(like(cargos.nome, termo)).limit(LIM),
      db.select({ id: protocoloSituacoes.id, nome: protocoloSituacoes.nome }).from(protocoloSituacoes).where(like(protocoloSituacoes.nome, termo)).limit(LIM),
      db.select({ id: feriados.id, nome: feriados.nome, data: feriados.data }).from(feriados).where(like(feriados.nome, termo)).limit(LIM),
    ]);
    const cfg = (aba: string) => `/painel/configuracoes?aba=${aba}`;
    return [
      ...ps.map((l) => ({ id: l.id, rotulo: l.nome, detalhe: "Papel · Configurações", href: cfg("papeis") })),
      ...cs.map((l) => ({ id: 100_000 + l.id, rotulo: l.nome, detalhe: "Cargo ou função · Configurações", href: cfg("cargos") })),
      ...ss.map((l) => ({ id: 200_000 + l.id, rotulo: l.nome, detalhe: "Situação do protocolo · Configurações", href: cfg("situacoes") })),
      ...fs.map((l) => ({ id: 300_000 + l.id, rotulo: l.nome, detalhe: `Feriado ${dataBR(l.data)} · Configurações`, href: cfg("feriados") })),
    ].slice(0, LIM);
  }
  if (tipo === "fluxo") {
    // As automações do PAINEL da pessoa (as dela e as sem dono — a mesma regra da tela).
    const ls = await db
      .select({ id: automacaoFluxos.id, nome: automacaoFluxos.nome, descricao: automacaoFluxos.descricao })
      .from(automacaoFluxos)
      .where(and(or(eq(automacaoFluxos.criadoPor, a.u.id), isNull(automacaoFluxos.criadoPor)), or(like(automacaoFluxos.nome, termo), like(automacaoFluxos.descricao, termo))))
      .orderBy(automacaoFluxos.nome)
      .limit(LIM);
    return ls.map((l) => ({ id: l.id, rotulo: l.nome, detalhe: (l.descricao ?? "Automação").slice(0, 120), href: `/painel/automacao?abrir=${l.id}` }));
  }
  return null;
}
