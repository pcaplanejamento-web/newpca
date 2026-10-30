import { and, desc, eq, inArray, isNull, or, type SQL, sql } from "drizzle-orm";
import {
  automacaoFluxos,
  cargos,
  catalogoCompras,
  catalogoItens,
  catalogoPastas,
  catalogos,
  declaracoes,
  dfdProtocolos,
  dfds,
  documentos,
  empenhoCards,
  empenhos,
  feriados,
  grupos,
  itemClassificacoes,
  liquidacoes,
  orcamentoItens,
  orcamentoVisoes,
  orcamentos,
  orgaos,
  pagamentos,
  papeis,
  pcas,
  protocoloSituacoes,
  reparticoes,
  responsaveis,
  tarefaPastas,
  tarefaQuadros,
  unidadesMedida,
  usuarios,
} from "@/db/schema";
import { type Acesso, componenteLibera, gruposDeTarefas, orcamentosDoAcesso, pcasDoAcesso, podeTela } from "./acesso";
import { acessoDeclaracoes } from "./declaracoes-core";
import { documentoVisivel, lerPcasDocumento } from "./documentos-core";
import { linkImportacoes, NOME_TIPO } from "./empenho-cards-core";
import { unidadeDoModulo } from "./escopo-cabecalho";
import { linkEvento } from "./calendario-core";
import { getDb } from "./db";
import { doEscopo } from "./empenhos-tela-sql";
import { escopoDosEmpenhos } from "./empenhos-tela";
import { chaveEscopoEmpenhos, escopoVazio } from "./empenhos-tela-core";
import { brl, dataIsoBrasilia, dataBR } from "./format";
import { ehTermoNumero, MAX_INDICE_EXECUCAO, padroesLike, type ResultadoPesquisa, resultadoEmpenho, resultadoLiquidacao, resultadoPagamento, type TipoExecucaoPesquisa, type TipoPesquisa, VALIDADE_INDICE_EXECUCAO_MS } from "./pesquisa-core";
import { consultaIndiceExecucao } from "./pesquisa-execucao-sql";
import { casaTermos } from "./pesquisa-sql";
import { criarMemoVersao } from "./memo-versao-core";
import { pastaVisivel, quadroVisivel } from "./tarefas-sql";
import { escopoDaFrota, veiculosDoEscopo } from "./frota";

const padroesSemAcento = (q: string) =>
  q
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
import { buscarNoCalendario } from "./tarefas";
import { escopoAtivo, quadrosDoCalendario } from "./tarefas-dados";

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
    // Os CATÁLOGOS da agenda e as PASTAS pelo nome (primeiro) e os itens.
    const [cs, ps] = await Promise.all([
      db.select({ id: catalogos.id, nome: catalogos.nome, total: catalogos.totalItens }).from(catalogos).where(and(eq(catalogos.tipo, "agenda"), casaTermos([catalogos.nome, catalogos.descricao], padroes))).limit(LIM),
      db.select({ id: catalogoPastas.id, nome: catalogoPastas.nome }).from(catalogoPastas).where(casaTermos([catalogoPastas.nome], padroes)).limit(LIM),
    ]);
    return [
      ...ps.map((l) => ({ id: 2_000_000_000 + l.id, rotulo: l.nome, detalhe: "Pasta de catálogos", href: `/painel/catalogo/pasta/${l.id}` })),
      ...cs.map((l) => ({ id: 1_000_000_000 + l.id, rotulo: l.nome, detalhe: `Catálogo · ${l.total} itens`, href: `/painel/catalogo?abrir=${enc(`catalogo:${l.id}`)}` })),
      ...ls.map((l) => ({
        id: l.id,
        rotulo: `${l.codigo} · ${l.descricao.slice(0, 90)}`,
        detalhe: l.catalogo,
        href: `/painel/catalogo?abrir=${enc(`catalogo:${l.catalogoId}:${l.codigo}`)}`,
      })),
    ].slice(0, LIM);
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
    // Os HISTÓRICOS pelo nome (primeiro) e as compras.
    const cs = await db
      .select({ id: catalogos.id, nome: catalogos.nome })
      .from(catalogos)
      .where(and(eq(catalogos.tipo, "historico"), casaTermos([catalogos.nome, catalogos.descricao], padroes)))
      .limit(LIM);
    return [
      ...cs.map((l) => ({ id: 1_000_000_000 + l.id, rotulo: l.nome, detalhe: "Histórico de compra", href: `/painel/catalogo?abrir=${enc(`historico:${l.id}`)}` })),
      ...ls.map((l) => ({
        id: l.id,
        rotulo: `${l.codigo} · ${l.descricao.slice(0, 90)}`,
        detalhe: `${l.catalogo} · Contrato ${l.contrato}`,
        href: `/painel/catalogo?abrir=${enc(`historico:${l.catalogoId}`)}`,
      })),
    ].slice(0, LIM);
  }

  if (tipo === "padronizacao") {
    if (!podeTela(a, "catalogo").visualizar) return null;
    const un = componenteLibera(a, "catalogo.unidades");
    const cl = componenteLibera(a, "catalogo.classificacoes");
    if (!un && !cl) return null;
    const [us, cs] = await Promise.all([
      un ? db.select({ id: unidadesMedida.id, sigla: unidadesMedida.sigla, nome: unidadesMedida.nome }).from(unidadesMedida).where(casaTermos([unidadesMedida.sigla, unidadesMedida.nome, unidadesMedida.sinonimos], padroes)).orderBy(unidadesMedida.ordem).limit(LIM) : [],
      cl ? db.select({ id: itemClassificacoes.id, nome: itemClassificacoes.nome }).from(itemClassificacoes).where(casaTermos([itemClassificacoes.nome, itemClassificacoes.palavras], padroes)).orderBy(itemClassificacoes.ordem).limit(LIM) : [],
    ]);
    return [
      ...us.map((l) => ({ id: l.id, rotulo: `${l.sigla} · ${l.nome}`, detalhe: "Medida · Catálogo", href: `/painel/catalogo?vista=unidades&editar=${l.id}` })),
      ...cs.map((l) => ({ id: 1_000_000 + l.id, rotulo: l.nome, detalhe: "Classificação · Catálogo", href: `/painel/catalogo?vista=classificacoes&editar=${l.id}` })),
    ].slice(0, LIM);
  }

  if (tipo === "visao") {
    if (!podeTela(a, "orcamento").visualizar || !componenteLibera(a, "orcamento.visoes")) return null;
    // As visões são GLOBAIS e se editam dentro de um orçamento: o mais recente que a pessoa abre.
    const orcs = orcamentosDoAcesso(a);
    const [orc] = await db
      .select({ id: orcamentos.id, ano: orcamentos.ano })
      .from(orcamentos)
      .where(orcs ? inArray(orcamentos.id, [...orcs, 0]) : undefined)
      .orderBy(desc(orcamentos.ano), desc(orcamentos.id))
      .limit(1);
    if (!orc) return [];
    const ls = await db.select({ id: orcamentoVisoes.id, nome: orcamentoVisoes.nome }).from(orcamentoVisoes).where(casaTermos([orcamentoVisoes.nome], padroes)).orderBy(orcamentoVisoes.ordem).limit(LIM);
    return ls.map((l) => ({ id: l.id, rotulo: l.nome, detalhe: `Visão do orçamento · aberta no orçamento ${orc.ano}`, href: `/painel/orcamento/${orc.id}?aba=visoes&abrir=${l.id}` }));
  }

  if (tipo === "declaracao") {
    if (!podeTela(a, "pca").visualizar || !componenteLibera(a, "pca.declaracoes")) return null;
    const permitidos = pcasDoAcesso(a);
    const ls = await db
      .select({
        id: declaracoes.id,
        pcaId: declaracoes.pcaId,
        ano: declaracoes.ano,
        numero: declaracoes.numero,
        finalidade: declaracoes.finalidade,
        processo: declaracoes.processo,
        protocolo: declaracoes.protocoloCenti,
        valor: declaracoes.valorTotal,
        cancelada: declaracoes.canceladaEm,
        conteudo: declaracoes.conteudo,
        modo: pcas.declaracoes,
        pca: pcas.nome,
      })
      .from(declaracoes)
      .innerJoin(pcas, eq(pcas.id, declaracoes.pcaId))
      .where(
        and(
          permitidos ? inArray(declaracoes.pcaId, [...permitidos, 0]) : undefined,
          casaTermos(
            [sql`${declaracoes.numero} || '/' || ${declaracoes.ano}`, declaracoes.processo, declaracoes.protocoloCenti, declaracoes.finalidade, declaracoes.observacao],
            padroes,
            [sql`${declaracoes.numero} || '/' || ${declaracoes.ano}`, declaracoes.processo, declaracoes.protocoloCenti],
          ),
        ),
      )
      .orderBy(desc(declaracoes.ano), desc(declaracoes.numero))
      .limit(LIM * 2);
    // A unidade da pessoa (a aba Declarações): só as declarações com ao menos um item de uma unidade dela.
    const rep = (await unidadeDoModulo("pca", a.u, undefined, "declaracoes")).id;
    if (rep === false) return [];
    const siglas =
      rep === null
        ? null
        : new Set(
            (await db.select({ codigo: reparticoes.codigo }).from(reparticoes).where(inArray(reparticoes.id, typeof rep === "number" ? [rep] : [...rep, 0]))).map((r) => r.codigo),
          );
    const daUnidade = (conteudo: string) => {
      if (!siglas) return true;
      try {
        const c = JSON.parse(conteudo) as { linhas?: { sigla?: string | null }[] };
        return (c.linhas ?? []).some((l) => l.sigla != null && siglas.has(l.sigla));
      } catch {
        return false;
      }
    };
    return ls
      .filter((l) => acessoDeclaracoes(l.modo, admin) !== "nenhum" && daUnidade(l.conteudo))
      .slice(0, LIM)
      .map((l) => ({
        id: l.id,
        rotulo: `Declaração ${l.numero}/${l.ano}${l.cancelada ? " (cancelada)" : ""}`,
        detalhe: [l.pca, l.protocolo ? `Protocolo ${l.protocolo}` : "", l.processo ? `Processo ${l.processo}` : "", brl(l.valor)].filter(Boolean).join(" · "),
        href: `/painel/pca/${l.pcaId}?aba=declaracoes&abrir=${l.id}`,
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

  if (tipo === "veiculo") {
    // Os VEÍCULOS do escopo da frota (a placa sem traço; marca e modelo pelo texto).
    if (!podeTela(a, "veiculos").visualizar && !podeTela(a, "frotas").visualizar) return null;
    const placa = q.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const vs = await veiculosDoEscopo(await escopoDaFrota());
    const termos = padroesSemAcento(q);
    const achados = vs
      .filter((v) => (placa.length >= 3 && v.placa.includes(placa)) || termos.every((t) => padroesSemAcento(`${v.placa} ${v.marca ?? ""} ${v.modelo ?? ""}`).join(" ").includes(t)))
      .slice(0, LIM);
    const tela = podeTela(a, "veiculos").visualizar ? "/painel/veiculos" : "/painel/frotas";
    return achados.map((v, i) => ({
      id: i + 1,
      rotulo: v.placa,
      detalhe: [[v.marca, v.modelo].filter(Boolean).join(" "), v.ano, v.situacao === "inativo" ? "inativo" : ""].filter(Boolean).join(" · ") || "Veículo",
      href: `${tela}?abrir=${encodeURIComponent(v.placa)}`,
    }));
  }

  if (tipo === "pasta") {
    // As PASTAS de quadros do GRUPO ATIVO (a tela de Tarefas mostra só ele): as públicas + as privadas da pessoa.
    if (!podeTela(a, "tarefas").visualizar) return null;
    const grupos = escopoAtivo(a);
    if (grupos && !grupos.length) return [];
    const ls = await db
      .select({
        id: tarefaPastas.id,
        nome: tarefaPastas.nome,
        privado: tarefaPastas.privado,
        quadros: sql<number>`(SELECT COUNT(*) FROM tarefa_quadros q WHERE q.pasta_id = ${tarefaPastas.id} AND q.arquivado = 0)`,
      })
      .from(tarefaPastas)
      .where(and(grupos ? inArray(tarefaPastas.grupoId, grupos) : undefined, pastaVisivel(a.u.id, admin), casaTermos([tarefaPastas.nome], padroes)))
      .orderBy(tarefaPastas.nome)
      .limit(LIM);
    return ls.map((l) => ({
      id: l.id,
      rotulo: l.nome,
      detalhe: [`Pasta · ${l.quadros} ${Number(l.quadros) === 1 ? "quadro" : "quadros"}`, l.privado ? "privada" : ""].filter(Boolean).join(" · "),
      href: `/painel/tarefas?pasta=${l.id}`,
    }));
  }

  // ─── ADMINISTRAÇÃO (só o ADM) ───
  if (!admin) return null;

  if (tipo === "usuario") {
    const ls = await db
      .select({ id: usuarios.id, nome: usuarios.nome, apelido: usuarios.apelido, email: usuarios.email, matricula: usuarios.matricula, status: usuarios.status, arquivadoEm: usuarios.arquivadoEm })
      .from(usuarios)
      .where(casaTermos([usuarios.nome, usuarios.apelido, usuarios.email, usuarios.matricula], padroes))
      .orderBy(usuarios.nome)
      .limit(LIM);
    return ls.map((l) => ({
      id: l.id,
      rotulo: l.apelido ? `${l.apelido} (${l.nome})` : l.nome,
      detalhe: [l.arquivadoEm ? `Arquivado(a) em ${dataBR(l.arquivadoEm.slice(0, 10))}` : "", l.email, l.matricula ? `Mat. ${l.matricula}` : "", l.status === "ativo" || l.arquivadoEm ? "" : l.status]
        .filter(Boolean)
        .join(" · "),
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
  if (tipo === "responsavel") {
    const ls = await db
      .select({ id: responsaveis.id, nome: responsaveis.nome, matricula: responsaveis.matricula, cargo: responsaveis.cargo, exonerado: responsaveis.exoneradoEm })
      .from(responsaveis)
      .where(casaTermos([responsaveis.nome, responsaveis.matricula, responsaveis.cargo], padroes, [responsaveis.matricula]))
      .orderBy(responsaveis.nome)
      .limit(LIM);
    return ls.map((l) => ({
      id: l.id,
      rotulo: l.nome,
      detalhe: ["Responsável por DFDs", l.matricula ? `Mat. ${l.matricula}` : "", l.cargo, l.exonerado ? "exonerado" : ""].filter(Boolean).join(" · "),
      href: `/painel/orgaos?aba=responsaveis&pessoa=${l.id}`,
    }));
  }
  if (tipo === "importacao") {
    const ls = await db
      .select({ id: empenhoCards.id, nome: empenhoCards.nome, tipo: empenhoCards.tipo })
      .from(empenhoCards)
      .where(casaTermos([empenhoCards.nome, empenhoCards.descricao], padroes))
      .orderBy(empenhoCards.nome)
      .limit(LIM);
    return ls.map((l) => {
      const t = l.tipo === "liquidacoes" || l.tipo === "pagamentos" ? l.tipo : "empenhos";
      return { id: l.id, rotulo: l.nome, detalhe: `Card de importação · ${NOME_TIPO[t].titulo}`, href: linkImportacoes(t, l.id) };
    });
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
 * O ÍNDICE DE TEXTO da execução (`GET /api/pesquisa/indice-execucao`): as tuplas do tipo no escopo da pessoa, na MEMÓRIA
 * do Worker por `VALIDADE_INDICE_EXECUCAO_MS` — PRESO AO RELÓGIO, nunca à versão da execução: a automática promove lotes
 * o dia todo e cada reconstrução lê a tabela inteira (a cota diária de leituras do D1). O que entrou depois aparece pelo nº
 * exato e pelo prefixo. `null` = a pessoa não abre a tela do tipo.
 */
const memoIndiceExecucao = criarMemoVersao({ max: 12, ttlMs: VALIDADE_INDICE_EXECUCAO_MS, agora: () => Date.now() });
export async function indiceExecucao(a: Acesso, tipo: TipoExecucaoPesquisa): Promise<{ texto: string; total: number; completo: boolean } | null> {
  if (!podeTela(a, TELA_EXECUCAO[tipo]).visualizar) return null;
  const escopo = await escopoDosEmpenhos();
  if (escopoVazio(escopo)) return { texto: "[]", total: 0, completo: true };
  const r = await memoIndiceExecucao.obter(`${tipo}:${chaveEscopoEmpenhos(escopo)}`, "fixo", () => consultaIndiceExecucao(getDb(), tipo, escopo));
  return { ...r, completo: r.total < MAX_INDICE_EXECUCAO };
}

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
  if (tipo === "empenho") {
    const rs = await db
      .select({ id: empenhos.id, ano: empenhos.ano, numero: empenhos.numero, data: empenhos.data, fornecedor: empenhos.fornecedor, orgao: empenhos.orgaoGestor, valor: empenhos.valorEmpenhado })
      .from(empenhos)
      .where(inArray(empenhos.id, ids));
    const por = new Map(rs.map((r) => [r.id, r]));
    return ids.flatMap((id) => {
      const r = por.get(id);
      return r ? [resultadoEmpenho({ ...r, id })] : [];
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
      return r ? [resultadoLiquidacao({ ...r, id })] : [];
    });
  }
  const rs = await db
    .select({ id: pagamentos.id, ano: pagamentos.ano, ordem: pagamentos.chave, data: pagamentos.data, empenho: pagamentos.numeroEmpenho, credor: pagamentos.credor, valor: pagamentos.valor })
    .from(pagamentos)
    .where(inArray(pagamentos.id, ids));
  const por = new Map(rs.map((r) => [r.id, r]));
  return ids.flatMap((id) => {
    const r = por.get(id);
    return r ? [resultadoPagamento({ ...r, id })] : [];
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
export type EspacoPesquisa = { tipo: "orcamento" | "quadro" | "pca"; id: number; nome: string; abas: [string, string][] };

const ABAS_ORCAMENTO: [string, string][] = [["lancamentos", "Lançamentos"], ["comparativo", "Comparativo"], ["vinculos", "Vínculos"], ["visoes", "Visões"]];
const ABAS_PCA: [string, string][] = [["dashboard", "Dashboard"], ["orcamento", "Orçamento"], ["mesa", "Mesa"], ["importacao", "Importação"], ["documentos", "Documentos"], ["declaracoes", "Declarações"], ["configuracao", "Configuração"]];
const ABAS_QUADRO: [string, string][] = [["quadro", "Quadro"], ["lista", "Lista"], ["calendario", "Calendário"], ["dashboard", "Dashboard"], ["configuracao", "Configuração"]];

/**
 * Os ESPAÇOS da pessoa para o índice da pesquisa: os PCAs do grupo (com as abas da régua da tela), os orçamentos do grupo (com as abas que o papel libera — a régua da tela
 * `/painel/orcamento/[id]`) e os quadros de Tarefas dos grupos em que ela vê Tarefas (o privado, só do dono; sem os
 * arquivados), com as abas liberadas (o Quadro sempre). Leve: só id e nome.
 */
export async function espacosDaPesquisa(a: Acesso): Promise<EspacoPesquisa[]> {
  const db = getDb();
  const out: EspacoPesquisa[] = [];
  if (podeTela(a, "pca").visualizar) {
    // A MESMA régua da tela `/painel/pca/[id]`: a Importação só no PCA de lista, Documentos com a tela Documentos, as
    // Declarações conforme o modo do PCA — e o que o papel libera.
    const permitidos = pcasDoAcesso(a);
    const ls = await db
      .select({ id: pcas.id, nome: pcas.nome, ano: pcas.ano, fonte: pcas.fonte, declaracoes: pcas.declaracoes })
      .from(pcas)
      .where(permitidos ? inArray(pcas.id, [...permitidos, 0]) : undefined)
      .orderBy(desc(pcas.ano))
      .limit(100);
    const docs = podeTela(a, "documentos").visualizar;
    for (const p of ls) {
      const abas = ABAS_PCA.filter(
        ([v]) =>
          (v !== "importacao" || p.fonte === "lista") &&
          (v !== "documentos" || docs) &&
          (v !== "declaracoes" || acessoDeclaracoes(p.declaracoes, a.u.admin) !== "nenhum") &&
          componenteLibera(a, `pca.${v}`),
      );
      if (abas.length) out.push({ tipo: "pca", id: p.id, nome: `${p.ano ?? ""} · ${p.nome}`, abas });
    }
  }
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
