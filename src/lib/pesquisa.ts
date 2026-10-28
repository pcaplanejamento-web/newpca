import { and, desc, eq, inArray, isNull, or, type SQL, sql } from "drizzle-orm";
import {
  automacaoFluxos,
  cargos,
  catalogoCompras,
  catalogoItens,
  catalogos,
  dfdProtocolos,
  dfds,
  documentos,
  empenhos,
  feriados,
  grupos,
  liquidacoes,
  orcamentoItens,
  orcamentos,
  orgaos,
  pagamentos,
  papeis,
  protocoloSituacoes,
  reparticoes,
  tarefaQuadros,
  usuarios,
} from "@/db/schema";
import { type Acesso, componenteLibera, gruposDeTarefas, orcamentosDoAcesso, pcasDoAcesso, podeTela } from "./acesso";
import { documentoVisivel, lerPcasDocumento } from "./documentos-core";
import { linkEvento } from "./calendario-core";
import { getDb } from "./db";
import { doEscopo } from "./empenhos-tela-sql";
import { escopoDosEmpenhos } from "./empenhos-tela";
import { escopoVazio } from "./empenhos-tela-core";
import { brl, dataIsoBrasilia, dataBR } from "./format";
import { ehTermoNumero, padroesLike, type ResultadoPesquisa, type TipoPesquisa } from "./pesquisa-core";
import { casaTermos } from "./pesquisa-sql";
import { quadroVisivel } from "./tarefas-sql";
import { buscarNoCalendario } from "./tarefas";
import { quadrosDoCalendario } from "./tarefas-dados";

/**
 * PESQUISA DO SISTEMA — os dados das telas além da Mesa (orçamento, catálogo, histórico de compra, calendário e a
 * ADMINISTRAÇÃO). REGRA: cada tipo só sai para quem ABRE a tela (e a aba/visão) em que o dado está — a administração, só o
 * ADM — e o link é o da tela/aba que abre o registro (`?abrir=`). Sem permissão = nenhum resultado (`null`).
 */
export async function pesquisarOutros(a: Acesso, tipo: TipoPesquisa, q: string, limite: number, soEste = false): Promise<ResultadoPesquisa[] | null> {
  const db = getDb();
  if (tipo === "empenho" || tipo === "liquidacao" || tipo === "pagamento") return pesquisarExecucao(a, tipo, q, limite, soEste);
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

  if (tipo === "documento") {
    if (!podeTela(a, "documentos").visualizar) return null;
    // Os do grupo: o documento só de PCAs de fora do grupo não sai (a MESMA régua da tela).
    const permitidos = pcasDoAcesso(a);
    const ls = await db
      .select({ id: documentos.id, nome: documentos.nome, arquivo: documentos.nomeArquivo, pcas: documentos.pcas, link: documentos.urlExterna })
      .from(documentos)
      .where(and(eq(documentos.completo, true), casaTermos([documentos.nome, documentos.nomeArquivo], padroes)))
      .orderBy(desc(documentos.id))
      .limit(LIM * 4);
    return ls
      .filter((l) => documentoVisivel(lerPcasDocumento(l.pcas), permitidos))
      .slice(0, LIM)
      .map((l) => ({ id: l.id, rotulo: l.nome, detalhe: l.link ? "PDF · Drive" : `PDF · ${l.arquivo}`, href: `/painel/documentos?abrir=${l.id}` }));
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

const TELA_EXECUCAO = { empenho: "empenhos", liquidacao: "liquidacoes", pagamento: "pagamentos" } as const;

/**
 * EMPENHOS, LIQUIDAÇÕES e PAGAMENTOS (só para quem abre a tela de cada um, no escopo de unidades dela). As tabelas são
 * grandes e a cota diária de LEITURAS do D1 é curta: sem o prefixo do tipo, só o NÚMERO casa (o nº do empenho — EXATO, pelo
 * índice `*_numero_*_idx`); o texto (fornecedor/credor, CPF/CNPJ, histórico…) só com o prefixo ("empenho:", "em:"…), quando a
 * pessoa procura nesse tipo. O MESMO registro em dois cards aparece UMA vez, com o id que a tabela única mostra (o do card de
 * menor id — a régua do pacote) — o link abre a linha.
 */
async function pesquisarExecucao(a: Acesso, tipo: keyof typeof TELA_EXECUCAO, q: string, limite: number, completo: boolean): Promise<ResultadoPesquisa[] | null> {
  if (!podeTela(a, TELA_EXECUCAO[tipo]).visualizar) return null;
  const termo = q.trim();
  const numero = ehTermoNumero(`%${termo}%`) ? termo.replace(/\/\d{4}$/, "") : null;
  if (!completo && !numero) return [];
  const escopo = await escopoDosEmpenhos();
  if (escopoVazio(escopo)) return [];
  const db = getDb();
  const padroes = padroesLike(q);
  const LIM = Math.min(50, limite);
  const t = tipo === "empenho" ? empenhos : tipo === "liquidacao" ? liquidacoes : pagamentos;
  const so: SQL | undefined = escopo === null ? undefined : doEscopo(escopo);
  const vigente = isNull(t.removidoEm);
  const filtro = (() => {
    if (!completo) return tipo === "empenho" ? eq(empenhos.numero, numero ?? "") : eq((t as typeof liquidacoes).numeroEmpenho, numero ?? "");
    if (tipo === "empenho")
      return casaTermos(
        [empenhos.numero, empenhos.fornecedor, empenhos.cpfCnpj, empenhos.historico, empenhos.acao, empenhos.elemento, empenhos.orgaoGestor, empenhos.unidadeOrcamentaria, empenhos.licitacao],
        padroes,
        [empenhos.numero, empenhos.cpfCnpj, empenhos.licitacao],
      );
    if (tipo === "liquidacao")
      return casaTermos([liquidacoes.numero, liquidacoes.numeroEmpenho, liquidacoes.credor, liquidacoes.cpfCnpj, liquidacoes.historico], padroes, [liquidacoes.numero, liquidacoes.numeroEmpenho, liquidacoes.cpfCnpj]);
    return casaTermos([pagamentos.chave, pagamentos.numeroEmpenho, pagamentos.credor, pagamentos.cpfCnpj, pagamentos.historico], padroes, [pagamentos.chave, pagamentos.numeroEmpenho, pagamentos.cpfCnpj]);
  })();
  const ls = await db
    .select({ id: t.id, chave: t.chave, card: t.cardId, ano: t.ano, data: t.data })
    .from(t)
    .where(and(vigente, filtro, so))
    .orderBy(desc(t.ano), desc(t.data), desc(t.id))
    .limit(LIM * 2);
  if (!ls.length) return [];
  // O MESMO registro em dois cards: o do card de menor id (a tabela única) — pelo índice único (card, chave).
  const chaves = [...new Set(ls.map((l) => l.chave))];
  const tabela = tipo === "empenho" ? "empenhos" : tipo === "liquidacao" ? "liquidacoes" : "pagamentos";
  const tipoCard = tipo === "empenho" ? "empenhos" : tipo === "liquidacao" ? "liquidacoes" : "pagamentos";
  const primeiros = await db.all<{ chave: string; id: number; card: number }>(
    sql`SELECT e.chave AS chave, e.id AS id, e.card_id AS card FROM empenho_cards c CROSS JOIN ${sql.raw(tabela)} e ON e.card_id = c.id AND e.chave IN (SELECT value FROM json_each(${JSON.stringify(chaves)})) WHERE c.tipo = ${tipoCard} AND e.removido_em IS NULL ORDER BY e.card_id`,
  );
  const idDa = new Map<string, number>();
  for (const p of primeiros) if (!idDa.has(p.chave)) idDa.set(p.chave, p.id);
  const ids = [...new Set(ls.map((l) => idDa.get(l.chave) ?? l.id))].slice(0, LIM);
  const enc = encodeURIComponent;
  if (tipo === "empenho") {
    const rs = await db
      .select({ id: empenhos.id, ano: empenhos.ano, numero: empenhos.numero, data: empenhos.data, fornecedor: empenhos.fornecedor, orgao: empenhos.orgaoGestor, valor: empenhos.valorEmpenhado })
      .from(empenhos)
      .where(inArray(empenhos.id, ids));
    const por = new Map(rs.map((r) => [r.id, r]));
    return ids.flatMap((id) => {
      const r = por.get(id);
      return r
        ? [{ id, rotulo: `Empenho ${r.numero}/${r.ano} · ${(r.fornecedor ?? "Sem fornecedor").slice(0, 80)}`, detalhe: [r.data ? dataBR(r.data) : "", brl(r.valor), r.orgao].filter(Boolean).join(" · "), href: `/painel/empenhos?ano=${r.ano}&abrir=${enc(String(id))}` }]
        : [];
    });
  }
  if (tipo === "liquidacao") {
    const rs = await db
      .select({ id: liquidacoes.id, ano: liquidacoes.ano, numero: liquidacoes.numero, data: liquidacoes.data, empenho: liquidacoes.numeroEmpenho, credor: liquidacoes.credor, valor: liquidacoes.valor })
      .from(liquidacoes)
      .where(inArray(liquidacoes.id, ids));
    const por = new Map(rs.map((r) => [r.id, r]));
    return ids.flatMap((id) => {
      const r = por.get(id);
      return r
        ? [{ id, rotulo: `Liquidação ${r.numero ?? id}/${r.ano} · ${(r.credor ?? "Sem credor").slice(0, 80)}`, detalhe: [r.data ? dataBR(r.data) : "", brl(r.valor), `Empenho ${r.empenho}`].filter(Boolean).join(" · "), href: `/painel/liquidacoes?abrir=${id}` }]
        : [];
    });
  }
  const rs = await db
    .select({ id: pagamentos.id, ano: pagamentos.ano, ordem: pagamentos.chave, data: pagamentos.data, empenho: pagamentos.numeroEmpenho, credor: pagamentos.credor, valor: pagamentos.valor })
    .from(pagamentos)
    .where(inArray(pagamentos.id, ids));
  const por = new Map(rs.map((r) => [r.id, r]));
  return ids.flatMap((id) => {
    const r = por.get(id);
    return r
      ? [{ id, rotulo: `Ordem de pagamento ${r.ordem} · ${(r.credor ?? "Sem credor").slice(0, 80)}`, detalhe: [r.data ? dataBR(r.data) : "", brl(r.valor), `Empenho ${r.empenho}`].filter(Boolean).join(" · "), href: `/painel/pagamentos?abrir=${id}` }]
      : [];
  });
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

/** Um ESPAÇO com abas (orçamento, quadro de tarefas): as abas que a pessoa abre nele, pesquisáveis ("comparativo 2026"). */
export type EspacoPesquisa = { tipo: "orcamento" | "quadro"; id: number; nome: string; abas: [string, string][] };

const ABAS_ORCAMENTO: [string, string][] = [["lancamentos", "Lançamentos"], ["comparativo", "Comparativo"], ["vinculos", "Vínculos"], ["visoes", "Visões"]];
const ABAS_QUADRO: [string, string][] = [["quadro", "Quadro"], ["lista", "Lista"], ["calendario", "Calendário"], ["dashboard", "Dashboard"], ["configuracao", "Configuração"]];

/**
 * Os ESPAÇOS da pessoa para o índice da pesquisa: os orçamentos do grupo (com as abas que o papel libera — a régua da tela
 * `/painel/orcamento/[id]`) e os quadros de Tarefas dos grupos em que ela vê Tarefas (o privado, só do dono; sem os
 * arquivados), com as abas liberadas (o Quadro sempre). Leve: só id e nome.
 */
export async function espacosDaPesquisa(a: Acesso): Promise<EspacoPesquisa[]> {
  const db = getDb();
  const out: EspacoPesquisa[] = [];
  if (podeTela(a, "orcamento").visualizar) {
    const abas = ABAS_ORCAMENTO.filter(([v]) => componenteLibera(a, `orcamento.${v}`));
    const orcs = orcamentosDoAcesso(a);
    if (abas.length) {
      const ls = await db
        .select({ id: orcamentos.id, nome: orcamentos.nome, ano: orcamentos.ano })
        .from(orcamentos)
        .where(orcs ? inArray(orcamentos.id, [...orcs, 0]) : undefined)
        .orderBy(desc(orcamentos.ano))
        .limit(200);
      for (const o of ls) out.push({ tipo: "orcamento", id: o.id, nome: `${o.ano} · ${o.nome}`, abas });
    }
  }
  if (podeTela(a, "tarefas").visualizar) {
    const grupos = gruposDeTarefas(a, "visualizar");
    const abas = ABAS_QUADRO.filter(([v]) => v === "quadro" || componenteLibera(a, `tarefas.${v}`));
    if (!grupos || grupos.length) {
      const ls = await db
        .select({ id: tarefaQuadros.id, nome: tarefaQuadros.nome })
        .from(tarefaQuadros)
        .where(and(eq(tarefaQuadros.arquivado, false), quadroVisivel(a.u.id), grupos ? inArray(tarefaQuadros.grupoId, [...grupos, 0]) : undefined))
        .orderBy(tarefaQuadros.nome)
        .limit(300);
      for (const q of ls) out.push({ tipo: "quadro", id: q.id, nome: q.nome, abas });
    }
  }
  return out;
}
