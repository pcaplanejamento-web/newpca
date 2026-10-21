import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
  automacaoFluxos,
  cargos,
  catalogoCompras,
  catalogoItens,
  catalogos,
  dfdProtocolos,
  dfds,
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
import { type Acesso, componenteLibera, orcamentosDoAcesso, podeTela } from "./acesso";
import { linkEvento } from "./calendario-core";
import { getDb } from "./db";
import { dataIsoBrasilia, dataBR } from "./format";
import { padroesLike, type ResultadoPesquisa, type TipoPesquisa } from "./pesquisa-core";
import { casaTermos } from "./pesquisa-sql";
import { buscarNoCalendario } from "./tarefas";
import { quadrosDoCalendario } from "./tarefas-dados";

/**
 * PESQUISA DO SISTEMA — os dados das telas além da Mesa (orçamento, catálogo, histórico de compra, calendário e a
 * ADMINISTRAÇÃO). REGRA: cada tipo só sai para quem ABRE a tela (e a aba/visão) em que o dado está — a administração, só o
 * ADM — e o link é o da tela/aba que abre o registro (`?abrir=`). Sem permissão = nenhum resultado (`null`).
 */
export async function pesquisarOutros(a: Acesso, tipo: TipoPesquisa, q: string, limite: number): Promise<ResultadoPesquisa[] | null> {
  const db = getDb();
  const padroes = padroesLike(q);
  const LIM = Math.min(50, limite);
  const admin = a.u.admin;
  const enc = encodeURIComponent;

  if (tipo === "lancamento") {
    if (!podeTela(a, "orcamento").visualizar || !componenteLibera(a, "orcamento.lancamentos")) return null;
    const orcs = orcamentosDoAcesso(a);
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
        and(
          orcs ? inArray(orcamentoItens.orcamentoId, [...orcs, 0]) : undefined,
          casaTermos([orcamentoItens.ficha, orcamentoItens.acao, orcamentoItens.nomeElemento, orcamentoItens.codigoElemento, orcamentoItens.unidade, orcamentoItens.orgao, orcamentoItens.funcao, orcamentoItens.programa, orcamentoItens.fonte], padroes),
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
      .where(casaTermos([catalogoItens.codigo, catalogoItens.descricao], padroes))
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
      .where(casaTermos([catalogoCompras.codigo, catalogoCompras.descricao, catalogoCompras.idContrato, catalogoCompras.processo], padroes))
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
      .where(casaTermos([usuarios.nome, usuarios.apelido, usuarios.email, usuarios.matricula], padroes))
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
      .where(casaTermos([orgaos.nome, orgaos.sigla, orgaos.entidadeCenti], padroes))
      .orderBy(orgaos.nome)
      .limit(LIM);
    return ls.map((l) => ({ id: l.id, rotulo: `${l.sigla} · ${l.nome}`, detalhe: "Órgão", href: `/painel/orgaos?abrir=${l.id}` }));
  }
  if (tipo === "unidade") {
    const ls = await db
      .select({ id: reparticoes.id, nome: reparticoes.nome, codigo: reparticoes.codigo, orgaoId: reparticoes.orgaoId, orgao: orgaos.sigla })
      .from(reparticoes)
      .innerJoin(orgaos, eq(orgaos.id, reparticoes.orgaoId))
      .where(and(sql`${reparticoes.codigo} <> 'GERAL'`, casaTermos([reparticoes.nome, reparticoes.codigo], padroes)))
      .orderBy(reparticoes.nome)
      .limit(LIM);
    return ls.map((l) => ({ id: l.id, rotulo: `${l.codigo} · ${l.nome}`, detalhe: `Unidade · ${l.orgao}`, href: `/painel/orgaos/${l.orgaoId}?abrir=${l.id}` }));
  }
  if (tipo === "grupo") {
    const ls = await db.select({ id: grupos.id, nome: grupos.nome }).from(grupos).where(casaTermos([grupos.nome], padroes)).orderBy(grupos.nome).limit(LIM);
    return ls.map((l) => ({ id: l.id, rotulo: l.nome, detalhe: "Grupo de acesso", href: `/painel/grupos?abrir=${l.id}` }));
  }
  if (tipo === "cadastro") {
    // Os cadastros das abas de Configurações: o link leva à aba (o cadastro está na lista dela).
    const [ps, cs, ss, fs] = await Promise.all([
      db.select({ id: papeis.id, nome: papeis.nome }).from(papeis).where(casaTermos([papeis.nome], padroes)).limit(LIM),
      db.select({ id: cargos.id, nome: cargos.nome }).from(cargos).where(casaTermos([cargos.nome], padroes)).limit(LIM),
      db.select({ id: protocoloSituacoes.id, nome: protocoloSituacoes.nome }).from(protocoloSituacoes).where(casaTermos([protocoloSituacoes.nome], padroes)).limit(LIM),
      db.select({ id: feriados.id, nome: feriados.nome, data: feriados.data }).from(feriados).where(casaTermos([feriados.nome], padroes)).limit(LIM),
    ]);
    const cfg = (aba: string) => `/painel/configuracoes?aba=${aba}`;
    return [
      ...ps.map((l) => ({ id: l.id, rotulo: l.nome, detalhe: "Papel · Configurações", href: `${cfg("papeis")}&abrir=${l.id}` })),
      ...cs.map((l) => ({ id: 100_000 + l.id, rotulo: l.nome, detalhe: "Cargo ou função · Configurações", href: `${cfg("cargos")}&abrir=${l.id}` })),
      ...ss.map((l) => ({ id: 200_000 + l.id, rotulo: l.nome, detalhe: "Situação do protocolo · Configurações", href: `${cfg("situacoes")}&abrir=${l.id}` })),
      ...fs.map((l) => ({ id: 300_000 + l.id, rotulo: l.nome, detalhe: `Feriado ${dataBR(l.data)} · Configurações`, href: `${cfg("feriados")}&abrir=${l.id}` })),
    ].slice(0, LIM);
  }
  if (tipo === "fluxo") {
    // As automações do PAINEL da pessoa (as dela e as sem dono — a mesma regra da tela).
    const ls = await db
      .select({ id: automacaoFluxos.id, nome: automacaoFluxos.nome, descricao: automacaoFluxos.descricao })
      .from(automacaoFluxos)
      .where(and(or(eq(automacaoFluxos.criadoPor, a.u.id), isNull(automacaoFluxos.criadoPor)), casaTermos([automacaoFluxos.nome, automacaoFluxos.descricao], padroes)))
      .orderBy(automacaoFluxos.nome)
      .limit(LIM);
    return ls.map((l) => ({ id: l.id, rotulo: l.nome, detalhe: (l.descricao ?? "Automação").slice(0, 120), href: `/painel/automacao?abrir=${l.id}` }));
  }
  return null;
}

/**
 * Em que MESA o protocolo/DFD está HOJE: o PCA dele (`pca_id` do protocolo — o DFD pelo protocolo de origem) ou `null`
 * = a Mesa do sistema; `undefined` = não existe. Toda chegada com `?abrir=` passa por aqui (favorito, recente, vínculo de
 * tarefa, aviso, cartão do chat) — o link antigo nunca leva à Mesa errada.
 */
export async function mesaDoAlvo(abrir: string | undefined): Promise<number | null | undefined> {
  const m = /^(protocolo|dfd):(\d{1,12})$/.exec(abrir ?? "");
  if (!m) return undefined;
  const id = Number(m[2]);
  const db = getDb();
  if (m[1] === "protocolo") {
    const [p] = await db.select({ pcaId: dfdProtocolos.pcaId }).from(dfdProtocolos).where(eq(dfdProtocolos.id, id)).limit(1);
    return p ? p.pcaId : undefined;
  }
  const [d] = await db.select({ pcaId: dfdProtocolos.pcaId }).from(dfds).leftJoin(dfdProtocolos, eq(dfdProtocolos.id, dfds.protocoloId)).where(eq(dfds.id, id)).limit(1);
  return d ? d.pcaId : undefined;
}

/** O link da Mesa em que o alvo está (a mesma régua da pesquisa). */
export const linkDaMesa = (pcaId: number | null, abrir: string) =>
  pcaId ? `/painel/pca/${pcaId}?aba=mesa&abrir=${encodeURIComponent(abrir)}` : `/painel/mesa?abrir=${encodeURIComponent(abrir)}`;
