import { and, asc, desc, eq, inArray, like, or, type SQL, sql } from "drizzle-orm";
import {
  dfdProtocolos,
  dfds,
  grupos,
  orcamentos,
  pcas,
  tarefaAutomacoes,
  tarefaCampos,
  tarefaCampoValores,
  tarefaChecklist,
  tarefaChecklists,
  tarefaComentarios,
  tarefaEquipeMembros,
  tarefaEquipes,
  tarefaEquipesLinks,
  tarefaEventoConvidados,
  tarefaEventos,
  tarefaEtiquetaLinks,
  tarefaEtiquetas,
  tarefaListas,
  tarefaModelos,
  tarefaPastas,
  tarefaPessoas,
  tarefaQuadros,
  tarefaVinculos,
  tarefas,
} from "@/db/schema";
import type { UsuarioSessao } from "./auth";
import { registrarAuditoria } from "./auditoria";
import { getDb } from "./db";
import { dataIsoBrasilia } from "./format";
import { gruposDoUsuario, unidadesDaSessao } from "./grupos";
import { lotesDeIds } from "./reparticoes";
import { linkEvento } from "./calendario-core";
import { atorDe, notificar } from "./notificacoes";
import { nomeExibicao, type Pessoa } from "./pessoa";
import { listarPessoasDoGrupo, pessoasPorIds } from "./usuarios";
import {
  type AcaoAutomacao,
  type BlocoTarefa,
  blocosParaGravar,
  coerceResposta,
  type DadosEvento,
  type EventoTarefa,
  lerRecorrenciaEvento,
  ocorrenciasDoEvento,
  somarDias,
  type RespostaConvite,
  contagemBlocos,
  lerBlocos,
  type Automacao,
  automacoesDoEvento,
  coerceModeloQuadro,
  GATILHOS,
  type GatilhoAutomacao,
  lerAcaoAutomacao,
  lerRecorrencia,
  linkTarefa,
  type ModeloQuadro,
  type ModeloResumo,
  proximaOcorrencia,
  type Recorrencia,
  rotuloTicket,
  type TipoNotificacao,
  type EtiquetaTarefa,
  type EquipeQuadro,
  envolvidosDe,
  equipesDasLinhas,
  type ListaTarefas,
  ordemEntre,
  ordemEntre as ordemItem,
  type AtorPasta,
  type ConjuntoQuadros,
  MAX_CONJUNTOS,
  motivoNaoMoverParaPasta,
  type PastaGravada,
  pastasDosQuadros,
  podeEditarPasta,
  type Prioridade,
  PRIORIDADES,
  type TarefaCalendario,
  type TarefaResumo,
  type TipoVinculo,
  type VinculoTarefa,
  chaveVinculo,
  vinculosPorTarefa,
  listaDeTemplates,
  mapearEtiquetas,
  mapearPorNome,
  OPCOES_COPIA_PADRAO,
  type OpcoesCopia,
  type CampoTarefa,
  coerceTipoCampo,
  lerOpcoesCampo,
  mapearCampos,
  montarTitulo,
  type ValorCampoNovo,
  valorCampo,
} from "./tarefas-core";
import {
  comandosAtualizarEvento,
  comandosCriarEvento,
  comandosCriarQuadroDoModelo,
  comandosComentariosImportados,
  comandosCriarTarefa,
  comandosEquipe,
  comandosEsvaziarLista,
  comandosTornarPrivado,
  comandosExcluirPasta,
  comandosMoverParaPasta,
  comandosQuadrosDaPasta,
  pastaVisivel,
  comandosMassa,
  comandosMover,
  comandosMoverQuadro,
  comandosValoresCampos,
  comandosVinculos,
  comandosVinculosTarefa,
  type ChecklistNovo,
  quadroVisivel,
  pessoaNaTarefa,
} from "./tarefas-sql";
import type { AcaoMassaTarefas, CartaoImportado } from "./tarefas-validation";

/**
 * TAREFAS (migração `0042`) — acesso ao D1 (só escopo de request). O quadro é de UM grupo: vê e edita quem é membro do
 * grupo (o ADM, todos).
 */

export type Quadro = {
  id: number;
  grupoId: number;
  grupoNome: string;
  nome: string;
  cor: string;
  descricao: string | null;
  arquivado: boolean;
  /** O formato do TÍTULO AUTOMÁTICO (`{Campo} - {Campo}`; null = desligado — migração `0056`). */
  formatoTitulo: string | null;
  /** A imagem de fundo (link; migração `0058`). */
  fundoUrl: string | null;
  /** O ENQUADRAMENTO da imagem (JSON `{x,y,zoom}` — `lerAjusteFundo`; migração `0059`). */
  fundoAjuste: string | null;
  /** O DEGRADÊ de fundo (JSON — `lerGradiente`; migração `0060`). */
  fundoGradiente: string | null;
  /** PRIVADO: só quem criou vê (migração `0060`). */
  privado: boolean;
  /** Quem criou (o dono do quadro privado). */
  criadoPor: number | null;
  /** A PASTA do quadro (null = solto) e o lugar dele nela (migração `0061`). */
  pastaId: number | null;
  pastaOrdem: number;
};
export type QuadroCard = Quadro & { abertas: number; atrasadas: number; concluidas: number };
export type TarefaCompleta = TarefaResumo & { quadroId: number; descricao: string | null; blocos: BlocoTarefa[] | null };

const COLS_QUADRO = {
  id: tarefaQuadros.id,
  grupoId: tarefaQuadros.grupoId,
  grupoNome: grupos.nome,
  nome: tarefaQuadros.nome,
  cor: tarefaQuadros.cor,
  descricao: tarefaQuadros.descricao,
  arquivado: tarefaQuadros.arquivado,
  formatoTitulo: tarefaQuadros.formatoTitulo,
  fundoUrl: tarefaQuadros.fundoUrl,
  fundoAjuste: tarefaQuadros.fundoAjuste,
  fundoGradiente: tarefaQuadros.fundoGradiente,
  privado: tarefaQuadros.privado,
  criadoPor: tarefaQuadros.criadoPor,
  pastaId: tarefaQuadros.pastaId,
  pastaOrdem: tarefaQuadros.pastaOrdem,
};

/** Os quadros dos GRUPOS dados (`null` = todos — o ADM sem grupo), com as contagens do card. `hoje` = "AAAA-MM-DD". */
export async function listarQuadros(grupoIds: number[] | null, hoje: string, usuarioId: number): Promise<QuadroCard[]> {
  if (grupoIds && grupoIds.length === 0) return [];
  const aberta = sql`t.arquivada = 0 AND t.template = 0 AND t.concluida_em IS NULL`;
  return getDb()
    .select({
      ...COLS_QUADRO,
      abertas: sql<number>`(SELECT COUNT(*) FROM tarefas t WHERE t.quadro_id = ${tarefaQuadros.id} AND ${aberta})`,
      atrasadas: sql<number>`(SELECT COUNT(*) FROM tarefas t WHERE t.quadro_id = ${tarefaQuadros.id} AND ${aberta} AND t.prazo < ${hoje})`,
      concluidas: sql<number>`(SELECT COUNT(*) FROM tarefas t WHERE t.quadro_id = ${tarefaQuadros.id} AND t.arquivada = 0 AND t.template = 0 AND t.concluida_em IS NOT NULL)`,
    })
    .from(tarefaQuadros)
    .innerJoin(grupos, eq(grupos.id, tarefaQuadros.grupoId))
    .where(and(grupoIds ? inArray(tarefaQuadros.grupoId, grupoIds) : undefined, quadroVisivel(usuarioId)))
    .orderBy(tarefaQuadros.arquivado, asc(tarefaQuadros.nome));
}

export async function getQuadro(id: number): Promise<Quadro | null> {
  const [q] = await getDb().select(COLS_QUADRO).from(tarefaQuadros).innerJoin(grupos, eq(grupos.id, tarefaQuadros.grupoId)).where(eq(tarefaQuadros.id, id));
  return q ?? null;
}

/** O quadro arquivado é SÓ LEITURA para criar: nada de tarefa, lista, etiqueta ou automação nova até desarquivar. */
export const MSG_QUADRO_ARQUIVADO = "Quadro arquivado — desarquive-o na Configuração para criar.";

/**
 * O quadro, se o usuário pode vê-lo (membro do grupo do quadro — o ADM, qualquer um); senão `null`. O PRIVADO é só de quem
 * o criou — nem o ADM o vê (o ADM só entra no privado cujo dono não existe mais).
 */
export async function quadroAcessivel(u: UsuarioSessao, id: number): Promise<Quadro | null> {
  const q = await getQuadro(id);
  if (!q) return null;
  if (q.privado && q.criadoPor !== u.id && !(q.criadoPor == null && u.role === "admin")) return null;
  if (u.role === "admin") return q;
  return (await gruposDoUsuario(u.id)).some((g) => g.id === q.grupoId) ? q : null;
}

/** A tarefa e o quadro dela, se o usuário pode vê-la; senão `null`. */
export async function tarefaAcessivel(u: UsuarioSessao, id: number): Promise<{ tarefa: TarefaCompleta; quadro: Quadro } | null> {
  const tarefa = await getTarefa(id);
  const quadro = tarefa ? await quadroAcessivel(u, tarefa.quadroId) : null;
  return tarefa && quadro ? { tarefa, quadro } : null;
}

/** O quadro é PRIVADO com dono: dentro dele só existe o DONO (o privado órfão — dono excluído — segue o grupo). */
export const soDoDono = (q: Pick<Quadro, "privado" | "criadoPor">): q is Pick<Quadro, "privado"> & { criadoPor: number } => q.privado && q.criadoPor != null;

/**
 * As PESSOAS que podem estar no quadro (responsáveis, observadores, equipes, convidados, menções, filtro): as do GRUPO —
 * ou, no quadro PRIVADO, só o DONO (a fonte única).
 */
export async function pessoasDoQuadro(q: Pick<Quadro, "grupoId" | "privado" | "criadoPor">): Promise<Pessoa[]> {
  const grupo = await listarPessoasDoGrupo(q.grupoId);
  if (!soDoDono(q)) return grupo;
  const dono = grupo.filter((p) => p.id === q.criadoPor);
  return dono.length ? dono : pessoasPorIds([q.criadoPor]);
}

/**
 * As pessoas pedidas podem estar no quadro? Do GRUPO (as já designadas antes seguem valendo, mesmo fora dele) — no quadro
 * PRIVADO, só o DONO (ninguém mais, nem as de antes).
 */
export async function pessoasValidas(q: Pick<Quadro, "grupoId" | "privado" | "criadoPor">, ids: number[], atuais: number[] = []): Promise<boolean> {
  if (soDoDono(q)) return ids.every((i) => i === q.criadoPor);
  if (ids.every((i) => atuais.includes(i))) return true;
  const membros = new Set((await listarPessoasDoGrupo(q.grupoId)).map((p) => p.id));
  return ids.every((i) => membros.has(i) || atuais.includes(i));
}

/** As LISTAS do quadro, na ordem (inclusive as arquivadas). */
export function listasDoQuadro(quadroId: number): Promise<ListaTarefas[]> {
  return getDb()
    .select({
      id: tarefaListas.id,
      nome: tarefaListas.nome,
      ordem: tarefaListas.ordem,
      limiteWip: tarefaListas.limiteWip,
      concluida: tarefaListas.concluida,
      arquivada: tarefaListas.arquivada,
    })
    .from(tarefaListas)
    .where(eq(tarefaListas.quadroId, quadroId))
    .orderBy(asc(tarefaListas.ordem), asc(tarefaListas.id));
}

/** Lote de QUADROS por consulta (≤ 80 — as consultas do calendário somam ~10 parâmetros além da lista; o D1 aceita 100). */
const LOTE_QUADROS = 80;
/** Roda a consulta por LOTES de quadros e junta os resultados — nenhum quadro some além do 80º (o ADM e o feed .ics
 * podem ter centenas). */
async function porLotesDeQuadros<T>(quadroIds: number[], f: (lote: number[]) => Promise<T[]>): Promise<T[]> {
  const ids = [...new Set(quadroIds)];
  if (!ids.length) return [];
  if (ids.length <= LOTE_QUADROS) return f(ids);
  const lotes: number[][] = [];
  for (let i = 0; i < ids.length; i += LOTE_QUADROS) lotes.push(ids.slice(i, i + LOTE_QUADROS));
  return (await Promise.all(lotes.map(f))).flat();
}
/** A lista de uma tarefa NÃO está arquivada (a tarefa de lista arquivada some do calendário, da busca e dos avisos). */
const listaAtiva = sql`EXISTS (SELECT 1 FROM tarefa_listas l WHERE l.id = ${tarefas.listaId} AND l.arquivada = 0)`;

/** As LISTAS ATIVAS dos quadros (o Calendário: concluir/reabrir e criar tarefa pelo próprio calendário). */
export async function listasDosQuadros(quadroIds: number[]): Promise<(Pick<ListaTarefas, "id" | "nome" | "concluida"> & { quadroId: number })[]> {
  return porLotesDeQuadros(quadroIds, (ids) =>
    getDb()
      .select({ id: tarefaListas.id, nome: tarefaListas.nome, concluida: tarefaListas.concluida, quadroId: tarefaListas.quadroId })
      .from(tarefaListas)
      .where(and(inArray(tarefaListas.quadroId, ids), eq(tarefaListas.arquivada, false)))
      .orderBy(asc(tarefaListas.quadroId), asc(tarefaListas.ordem), asc(tarefaListas.id)),
  );
}

/** As ETIQUETAS do quadro, na ordem. */
export function etiquetasDoQuadroTodas(quadroId: number): Promise<EtiquetaTarefa[]> {
  return getDb()
    .select({ id: tarefaEtiquetas.id, nome: tarefaEtiquetas.nome, cor: tarefaEtiquetas.cor })
    .from(tarefaEtiquetas)
    .where(eq(tarefaEtiquetas.quadroId, quadroId))
    .orderBy(asc(tarefaEtiquetas.ordem), asc(tarefaEtiquetas.id));
}

/** Listas + cartões (resumo, sem descrição) + etiquetas do quadro — consultas de UM parâmetro (o quadro) cada. */
export async function dadosQuadro(quadroId: number): Promise<{ listas: ListaTarefas[]; tarefas: TarefaResumo[]; etiquetas: EtiquetaTarefa[] }> {
  const db = getDb();
  const doQuadro = eq(tarefas.quadroId, quadroId);
  const contar = (tabela: typeof tarefaComentarios | typeof tarefaEventos) =>
    db
      .select({ tarefaId: tabela.tarefaId, n: sql<number>`COUNT(*)` })
      .from(tabela)
      .innerJoin(tarefas, eq(tarefas.id, tabela.tarefaId))
      .where(doQuadro)
      .groupBy(tabela.tarefaId);
  const [listas, cartoes, pessoas, links, etiquetas, checks, comentarios, nEventos, equipes, valores, ligacoes] = await Promise.all([
    listasDoQuadro(quadroId),
    db
      .select({
        id: tarefas.id,
        listaId: tarefas.listaId,
        ticket: tarefas.ticket,
        titulo: tarefas.titulo,
        prioridade: tarefas.prioridade,
        inicio: tarefas.inicio,
        prazo: tarefas.prazo,
        prazoHora: tarefas.prazoHora,
        lembreteMin: tarefas.lembreteMin,
        capa: tarefas.capa,
        ordem: tarefas.ordem,
        concluidaEm: tarefas.concluidaEm,
        arquivada: tarefas.arquivada,
        template: tarefas.template,
        tituloManual: tarefas.tituloManual,
        criadoEm: tarefas.criadoEm,
        atualizadoEm: tarefas.atualizadoEm,
        estimativaH: tarefas.estimativaH,
        recorrencia: tarefas.recorrencia,
        notas: contarBlocos("nota"),
        links: contarBlocos("link"),
        temDescricao: sql<number>`(${tarefas.descricao} IS NOT NULL AND trim(${tarefas.descricao}) <> '')`,
      })
      .from(tarefas)
      .where(doQuadro),
    db
      .select({ tarefaId: tarefaPessoas.tarefaId, usuarioId: tarefaPessoas.usuarioId, papel: tarefaPessoas.papel })
      .from(tarefaPessoas)
      .innerJoin(tarefas, eq(tarefas.id, tarefaPessoas.tarefaId))
      .where(doQuadro),
    db
      .select({ tarefaId: tarefaEtiquetaLinks.tarefaId, etiquetaId: tarefaEtiquetaLinks.etiquetaId })
      .from(tarefaEtiquetaLinks)
      .innerJoin(tarefas, eq(tarefas.id, tarefaEtiquetaLinks.tarefaId))
      .where(doQuadro),
    etiquetasDoQuadroTodas(quadroId),
    db
      .select({
        tarefaId: tarefaChecklist.tarefaId,
        total: sql<number>`COUNT(*)`,
        feitos: sql<number>`COALESCE(SUM(${tarefaChecklist.feito}), 0)`,
      })
      .from(tarefaChecklist)
      .innerJoin(tarefas, eq(tarefas.id, tarefaChecklist.tarefaId))
      .where(doQuadro)
      .groupBy(tarefaChecklist.tarefaId),
    contar(tarefaComentarios),
    contar(tarefaEventos),
    linhasEquipes(doQuadro),
    db
      .select({ tarefaId: tarefaCampoValores.tarefaId, campoId: tarefaCampoValores.campoId, valor: tarefaCampoValores.valor })
      .from(tarefaCampoValores)
      .innerJoin(tarefas, eq(tarefas.id, tarefaCampoValores.tarefaId))
      .where(doQuadro),
    linhasVinculos(doQuadro),
  ]);
  const porCampos = new Map<number, Record<number, string>>();
  for (const v of valores) porCampos.set(v.tarefaId, { ...(porCampos.get(v.tarefaId) ?? {}), [v.campoId]: v.valor });
  const agrupar = (pares: { tarefaId: number; v: number }[]) => {
    const m = new Map<number, number[]>();
    for (const p of pares) m.set(p.tarefaId, [...(m.get(p.tarefaId) ?? []), p.v]);
    return m;
  };
  const porPessoa = agrupar(pessoas.filter((p) => p.papel === "responsavel").map((p) => ({ tarefaId: p.tarefaId, v: p.usuarioId })));
  const porObservador = agrupar(pessoas.filter((p) => p.papel === "observador").map((p) => ({ tarefaId: p.tarefaId, v: p.usuarioId })));
  const porEtiqueta = agrupar(links.map((l) => ({ tarefaId: l.tarefaId, v: l.etiquetaId })));
  const porCheck = new Map(checks.map((c) => [c.tarefaId, { feitos: Number(c.feitos), total: Number(c.total) }]));
  const porComentario = new Map(comentarios.map((c) => [c.tarefaId, Number(c.n)]));
  const porEvento = new Map(nEventos.map((c) => [c.tarefaId, Number(c.n)]));
  const eqs = equipesDasLinhas(equipes);
  const vinculos = await vinculosRotulados(vinculosPorTarefa(ligacoes));
  return {
    listas,
    etiquetas,
    tarefas: cartoes.map((t) => {
      const resp = porPessoa.get(t.id) ?? [];
      const equipesT = eqs.porTarefa.get(t.id) ?? [];
      return {
        ...t,
        temDescricao: !!Number(t.temDescricao),
        prioridade: prioridadeValida(t.prioridade),
        pessoas: resp,
        observadores: porObservador.get(t.id) ?? [],
        equipes: equipesT,
        envolvidos: envolvidosDe(resp, equipesT, eqs.membros),
        etiquetas: porEtiqueta.get(t.id) ?? [],
        vinculos: vinculos.get(t.id) ?? [],
        checklist: porCheck.get(t.id) ?? { feitos: 0, total: 0 },
        comentarios: porComentario.get(t.id) ?? 0,
        notas: Number(t.notas),
        links: Number(t.links),
        eventos: porEvento.get(t.id) ?? 0,
        recorrencia: lerRecorrencia(t.recorrencia),
        campos: porCampos.get(t.id) ?? {},
      };
    }),
  };
}

/**
 * As EQUIPES das tarefas que passam em `cond` (sobre `tarefas`): (tarefa, equipe, membro | null) — uma consulta, sem
 * lista de ids.
 */
function linhasEquipes(cond: SQL | undefined) {
  return getDb()
    .select({ tarefaId: tarefaEquipesLinks.tarefaId, equipeId: tarefaEquipesLinks.equipeId, usuarioId: tarefaEquipeMembros.usuarioId })
    .from(tarefaEquipesLinks)
    .innerJoin(tarefas, eq(tarefas.id, tarefaEquipesLinks.tarefaId))
    .leftJoin(tarefaEquipeMembros, eq(tarefaEquipeMembros.equipeId, tarefaEquipesLinks.equipeId))
    .where(cond);
}

/** Quantos blocos do tipo a tarefa tem (os ícones do cartão) — contado no banco, sem trazer o texto das notas. */
const contarBlocos = (tipo: "nota" | "link") =>
  sql<number>`CASE WHEN json_valid(${tarefas.blocos}) THEN (SELECT COUNT(*) FROM json_each(${tarefas.blocos}) WHERE json_extract(value, '$.tipo') = ${tipo}) ELSE 0 END`;

/**
 * As LINHAS de vínculo das tarefas que passam em `cond` (sobre `tarefas`): as gravadas por elas + as de outras tarefas que
 * apontam para elas (o vínculo entre tarefas é dos dois lados) — `vinculosPorTarefa` junta.
 */
async function linhasVinculos(cond: SQL | undefined) {
  const db = getDb();
  const col = { tarefaId: tarefaVinculos.tarefaId, tipo: tarefaVinculos.tipo, alvoId: tarefaVinculos.alvoId };
  const [diretas, reversas] = await Promise.all([
    db.select(col).from(tarefaVinculos).innerJoin(tarefas, eq(tarefas.id, tarefaVinculos.tarefaId)).where(cond),
    db
      .select(col)
      .from(tarefaVinculos)
      .innerJoin(tarefas, eq(tarefas.id, tarefaVinculos.alvoId))
      .where(and(eq(tarefaVinculos.tipo, "tarefa"), cond)),
  ]);
  return [...diretas, ...reversas];
}

/** Os vínculos de cada tarefa com o RÓTULO do alvo (o excluído fica sem rótulo). */
async function vinculosRotulados(por: Map<number, { tipo: TipoVinculo; id: number }[]>): Promise<Map<number, VinculoTarefa[]>> {
  const r = await rotulosVinculos([...por.values()].flat());
  return new Map([...por].map(([t, vs]) => [t, vs.map((v) => ({ ...v, rotulo: null, ...r.get(chaveVinculo(v)) }))]));
}

/**
 * O nº/nome de cada alvo vinculado (protocolo: nº; DFD: nº; PCA/orçamento: nome; TAREFA: "#ticket título" + quadro ›
 * lista, prazo e conclusão) — `tipo:id` → dados; o excluído some.
 */
export async function rotulosVinculos(vinculos: { tipo: TipoVinculo; id: number }[]): Promise<Map<string, Partial<VinculoTarefa>>> {
  const db = getDb();
  const ids = (tipo: TipoVinculo) => [...new Set(vinculos.filter((v) => v.tipo === tipo).map((v) => v.id))];
  const em = async <T extends { id: number; r: string }>(lista: number[], ler: (l: number[]) => Promise<T[]>) =>
    (await Promise.all(lotesDeIds(lista).map(ler))).flat();
  const [ps, ds, pc, oc, ts] = await Promise.all([
    em(ids("protocolo"), (l) => db.select({ id: dfdProtocolos.id, r: dfdProtocolos.numero }).from(dfdProtocolos).where(inArray(dfdProtocolos.id, l))),
    em(ids("dfd"), (l) => db.select({ id: dfds.id, r: dfds.numero }).from(dfds).where(inArray(dfds.id, l))),
    em(ids("pca"), (l) => db.select({ id: pcas.id, r: pcas.nome }).from(pcas).where(inArray(pcas.id, l))),
    em(ids("orcamento"), (l) =>
      db
        .select({ id: orcamentos.id, r: sql<string>`${orcamentos.nome} || ' ' || ${orcamentos.ano}` })
        .from(orcamentos)
        .where(inArray(orcamentos.id, l)),
    ),
    em(ids("tarefa"), (l) =>
      db
        .select({
          id: tarefas.id,
          r: sql<string>`'#' || ${tarefas.ticket} || ' ' || ${tarefas.titulo}`,
          detalhe: sql<string>`${tarefaQuadros.nome} || ' › ' || ${tarefaListas.nome}`,
          quadroId: tarefas.quadroId,
          prazo: tarefas.prazo,
          concluidaEm: tarefas.concluidaEm,
        })
        .from(tarefas)
        .innerJoin(tarefaQuadros, eq(tarefaQuadros.id, tarefas.quadroId))
        .innerJoin(tarefaListas, eq(tarefaListas.id, tarefas.listaId))
        .where(inArray(tarefas.id, l)),
    ),
  ]);
  const m = new Map<string, Partial<VinculoTarefa>>();
  for (const [tipo, linhas] of [["protocolo", ps], ["dfd", ds], ["pca", pc], ["orcamento", oc]] as const) for (const x of linhas) m.set(`${tipo}:${x.id}`, { rotulo: x.r });
  for (const x of ts) m.set(`tarefa:${x.id}`, { rotulo: x.r, detalhe: x.detalhe, quadroId: x.quadroId, prazo: x.prazo, concluida: x.concluidaEm != null });
  return m;
}

/**
 * O CALENDÁRIO de todos os quadros (`/painel/tarefas?aba=calendario`): as tarefas NÃO arquivadas, em listas e quadros não
 * arquivados, dos quadros dados, que aparecem entre `de` e `ate` (prazo no intervalo, ou início antes do fim e prazo
 * depois — a faixa cruza o mês). Responsáveis e etiquetas vêm na MESMA condição (sem
 * lista de ids — uma consulta cada).
 */
export async function tarefasDoCalendario(quadroIds: number[], de: string, ate: string): Promise<(TarefaCalendario & { quadroId: number })[]> {
  return (await porLotesDeQuadros(quadroIds, (ids) => tarefasDoCalendarioLote(ids, de, ate))).slice(0, LIMITE_TAREFAS_CALENDARIO);
}
async function tarefasDoCalendarioLote(ids: number[], de: string, ate: string): Promise<(TarefaCalendario & { quadroId: number })[]> {
  const db = getDb();
  const visivel = and(inArray(tarefas.quadroId, ids), eq(tarefas.arquivada, false), eq(tarefas.template, false), listaAtiva);
  // O período cruza o intervalo, OU a recorrente aberta ainda cai nele (a que conta da conclusão, mesmo sem prazo — a
  // ocorrência PREVISTA), OU a tarefa tem um EVENTO que cruza o intervalo.
  const noIntervalo = and(
    visivel,
    or(
      and(sql`${tarefas.prazo} >= ${de}`, sql`(${tarefas.prazo} <= ${ate} OR ${tarefas.inicio} <= ${ate})`),
      and(sql`${tarefas.recorrencia} IS NOT NULL`, sql`${tarefas.concluidaEm} IS NULL`, sql`(${tarefas.prazo} IS NULL OR ${tarefas.prazo} <= ${ate})`),
      sql`EXISTS (SELECT 1 FROM tarefa_eventos e WHERE e.tarefa_id = ${tarefas.id} AND e.data <= ${ate} AND (COALESCE(e.data_fim, e.data) >= ${de} OR (e.recorrencia IS NOT NULL AND COALESCE(json_extract(e.recorrencia, '$.ate'), '9999-12-31') >= ${de})))`,
    ),
  );
  const [linhas, pessoas, etiquetas, equipes] = await Promise.all([
    db
      .select({
        id: tarefas.id,
        quadroId: tarefas.quadroId,
        listaId: tarefas.listaId,
        ticket: tarefas.ticket,
        titulo: tarefas.titulo,
        prioridade: tarefas.prioridade,
        inicio: tarefas.inicio,
        prazo: tarefas.prazo,
        prazoHora: tarefas.prazoHora,
        concluidaEm: tarefas.concluidaEm,
        recorrencia: tarefas.recorrencia,
      })
      .from(tarefas)
      .where(noIntervalo)
      .limit(LIMITE_TAREFAS_CALENDARIO),
    db
      .select({ tarefaId: tarefaPessoas.tarefaId, usuarioId: tarefaPessoas.usuarioId })
      .from(tarefaPessoas)
      .innerJoin(tarefas, eq(tarefas.id, tarefaPessoas.tarefaId))
      .where(and(noIntervalo, eq(tarefaPessoas.papel, "responsavel"))),
    db
      .select({ tarefaId: tarefaEtiquetaLinks.tarefaId, etiquetaId: tarefaEtiquetaLinks.etiquetaId })
      .from(tarefaEtiquetaLinks)
      .innerJoin(tarefas, eq(tarefas.id, tarefaEtiquetaLinks.tarefaId))
      .where(noIntervalo),
    linhasEquipes(noIntervalo),
  ]);
  const porPessoa = new Map<number, number[]>();
  for (const p of pessoas) porPessoa.set(p.tarefaId, [...(porPessoa.get(p.tarefaId) ?? []), p.usuarioId]);
  const porEtiqueta = new Map<number, number[]>();
  for (const e of etiquetas) porEtiqueta.set(e.tarefaId, [...(porEtiqueta.get(e.tarefaId) ?? []), e.etiquetaId]);
  const eqs = equipesDasLinhas(equipes);
  return linhas.map((t) => {
    const resp = porPessoa.get(t.id) ?? [];
    const equipesT = eqs.porTarefa.get(t.id) ?? [];
    return {
      ...t,
      prioridade: prioridadeValida(t.prioridade),
      recorrencia: lerRecorrencia(t.recorrencia),
      pessoas: resp,
      equipes: equipesT,
      envolvidos: envolvidosDe(resp, equipesT, eqs.membros),
      etiquetas: porEtiqueta.get(t.id) ?? [],
    };
  });
}

/** Os NÚMEROS do cabeçalho do calendário de todos os quadros (tarefas abertas): atrasadas, hoje, nesta semana, sem prazo. */
export async function contadoresDosQuadros(quadroIds: number[], hoje: string, fimSemana: string) {
  const partes = await porLotesDeQuadros(quadroIds, (ids) =>
    getDb()
      .select({
        atrasadas: sql<number>`COALESCE(SUM(${tarefas.prazo} < ${hoje}), 0)`,
        hoje: sql<number>`COALESCE(SUM(${tarefas.prazo} = ${hoje}), 0)`,
        naSemana: sql<number>`COALESCE(SUM(${tarefas.prazo} >= ${hoje} AND ${tarefas.prazo} <= ${fimSemana}), 0)`,
        semPrazo: sql<number>`COALESCE(SUM(${tarefas.prazo} IS NULL), 0)`,
      })
      .from(tarefas)
      .where(and(inArray(tarefas.quadroId, ids), eq(tarefas.arquivada, false), eq(tarefas.template, false), sql`${tarefas.concluidaEm} IS NULL`, listaAtiva)),
  );
  const soma = (k: "atrasadas" | "hoje" | "naSemana" | "semPrazo") => partes.reduce((n, r) => n + Number(r[k] ?? 0), 0);
  return { atrasadas: soma("atrasadas"), hoje: soma("hoje"), naSemana: soma("naSemana"), semPrazo: soma("semPrazo") };
}

/** As etiquetas dos quadros dados (os filtros do calendário de todos os quadros). */
export async function etiquetasDosQuadros(quadroIds: number[]): Promise<(EtiquetaTarefa & { quadroId: number })[]> {
  return porLotesDeQuadros(quadroIds, (ids) =>
    getDb()
      .select({ id: tarefaEtiquetas.id, nome: tarefaEtiquetas.nome, cor: tarefaEtiquetas.cor, quadroId: tarefaEtiquetas.quadroId })
      .from(tarefaEtiquetas)
      .where(inArray(tarefaEtiquetas.quadroId, ids))
      .orderBy(asc(tarefaEtiquetas.quadroId), asc(tarefaEtiquetas.ordem)),
  );
}

const prioridadeValida = (p: string): Prioridade => ((PRIORIDADES as readonly string[]).includes(p) ? (p as Prioridade) : "media");

export async function getTarefa(id: number): Promise<TarefaCompleta | null> {
  const db = getDb();
  const [t] = await db.select().from(tarefas).where(eq(tarefas.id, id));
  if (!t) return null;
  const [pessoas, links, checks, com, ev, equipes, campos, ligacoes] = await Promise.all([
    db.select({ u: tarefaPessoas.usuarioId, papel: tarefaPessoas.papel }).from(tarefaPessoas).where(eq(tarefaPessoas.tarefaId, id)),
    db.select({ e: tarefaEtiquetaLinks.etiquetaId }).from(tarefaEtiquetaLinks).where(eq(tarefaEtiquetaLinks.tarefaId, id)),
    db.select({ feito: tarefaChecklist.feito }).from(tarefaChecklist).where(eq(tarefaChecklist.tarefaId, id)),
    db.select({ n: sql<number>`COUNT(*)` }).from(tarefaComentarios).where(eq(tarefaComentarios.tarefaId, id)),
    db.select({ n: sql<number>`COUNT(*)` }).from(tarefaEventos).where(eq(tarefaEventos.tarefaId, id)),
    linhasEquipes(eq(tarefas.id, id)),
    valoresDaTarefa(id),
    linhasVinculos(eq(tarefas.id, id)),
  ]);
  const eqs = equipesDasLinhas(equipes);
  const resp = pessoas.filter((p) => p.papel === "responsavel").map((p) => p.u);
  const equipesT = eqs.porTarefa.get(id) ?? [];
  const vinculos = (await vinculosRotulados(vinculosPorTarefa(ligacoes))).get(id) ?? [];
  const blocos = lerBlocos(t.blocos);
  return {
    id: t.id,
    quadroId: t.quadroId,
    listaId: t.listaId,
    ticket: t.ticket,
    titulo: t.titulo,
    descricao: t.descricao,
    prioridade: prioridadeValida(t.prioridade),
    inicio: t.inicio,
    prazo: t.prazo,
    prazoHora: t.prazoHora,
    lembreteMin: t.lembreteMin,
    capa: t.capa,
    ordem: t.ordem,
    concluidaEm: t.concluidaEm,
    arquivada: t.arquivada,
    template: t.template,
    tituloManual: t.tituloManual,
    campos,
    pessoas: resp,
    observadores: pessoas.filter((p) => p.papel === "observador").map((p) => p.u),
    equipes: equipesT,
    envolvidos: envolvidosDe(resp, equipesT, eqs.membros),
    etiquetas: links.map((l) => l.e),
    criadoEm: t.criadoEm,
    atualizadoEm: t.atualizadoEm,
    estimativaH: t.estimativaH,
    vinculos,
    checklist: { feitos: checks.filter((c) => c.feito).length, total: checks.length },
    comentarios: Number(com[0]?.n ?? 0),
    ...contagemBlocos(blocos),
    eventos: Number(ev[0]?.n ?? 0),
    recorrencia: lerRecorrencia(t.recorrencia),
    blocos,
  };
}

/** As listas com que todo quadro NASCE (a última é a de concluídas). */
const LISTAS_INICIAIS = [
  { nome: "A fazer", concluida: false },
  { nome: "Em andamento", concluida: false },
  { nome: "Concluído", concluida: true },
];

export async function criarQuadro(grupoId: number, d: { nome: string; cor?: string; descricao?: string | null }, usuarioId: number): Promise<number> {
  const db = getDb();
  const [q] = await db
    .insert(tarefaQuadros)
    .values({ grupoId, nome: d.nome, cor: d.cor ?? "#6366f1", descricao: d.descricao ?? null, criadoPor: usuarioId })
    .returning({ id: tarefaQuadros.id });
  await db.insert(tarefaListas).values(LISTAS_INICIAIS.map((l, i) => ({ quadroId: q.id, nome: l.nome, concluida: l.concluida, ordem: i + 1 })));
  return q.id;
}

export async function atualizarQuadro(id: number, d: { nome?: string; cor?: string; descricao?: string | null; arquivado?: boolean; formatoTitulo?: string | null; fundoUrl?: string | null; fundoAjuste?: string | null; fundoGradiente?: string | null; privado?: boolean }) {
  await getDb()
    .update(tarefaQuadros)
    .set({ ...d, atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(tarefaQuadros.id, id));
}

/** Torna o quadro PRIVADO do dono num lote atômico — as outras pessoas saem de tudo dentro dele (`comandosTornarPrivado`). */
export async function tornarQuadroPrivado(id: number, dono: number) {
  const db = getDb();
  await db.batch(comandosTornarPrivado(db, id, dono) as unknown as Parameters<typeof db.batch>[0]);
}

// ─── PASTAS de quadros (migração `0061`) ────────────────────────────────────────────────────────────────────

/** Quem mexe nas pastas (a regra pura `motivoNaoMoverParaPasta`). */
export const atorPasta = (u: UsuarioSessao): AtorPasta => ({ id: u.id, editor: u.role !== "membro", admin: u.role === "admin" });

const COLS_PASTA = { id: tarefaPastas.id, nome: tarefaPastas.nome, cor: tarefaPastas.cor, privado: tarefaPastas.privado, criadoPor: tarefaPastas.criadoPor, grupoId: tarefaPastas.grupoId };

/** As PASTAS dos grupos (`null` = todos — o ADM) que a pessoa vê: as públicas + as privadas DELA. */
export async function listarPastas(grupoIds: number[] | null, u: UsuarioSessao): Promise<PastaGravada[]> {
  if (grupoIds && grupoIds.length === 0) return [];
  return getDb()
    .select(COLS_PASTA)
    .from(tarefaPastas)
    .where(and(grupoIds ? inArray(tarefaPastas.grupoId, grupoIds) : undefined, pastaVisivel(u.id, u.role === "admin")))
    .orderBy(asc(tarefaPastas.ordem), asc(tarefaPastas.id));
}

/** As pastas prontas para a grade (com os quadros visíveis de cada uma, na ordem de dentro). */
export async function pastasDaGrade(grupoIds: number[] | null, u: UsuarioSessao, quadros: Pick<Quadro, "id" | "pastaId" | "pastaOrdem">[]): Promise<ConjuntoQuadros[]> {
  return pastasDosQuadros(await listarPastas(grupoIds, u), quadros);
}

/** A pasta (com os quadros dela, na ordem), se a pessoa a vê (membro do grupo — o ADM, qualquer um); senão `null`. */
export async function pastaAcessivel(u: UsuarioSessao, id: number): Promise<ConjuntoQuadros | null> {
  const [p] = await getDb().select(COLS_PASTA).from(tarefaPastas).where(and(eq(tarefaPastas.id, id), pastaVisivel(u.id, u.role === "admin")));
  if (!p) return null;
  if (u.role !== "admin" && !(await gruposDoUsuario(u.id)).some((g) => g.id === p.grupoId)) return null;
  const qs = await getDb().select({ id: tarefaQuadros.id, pastaId: tarefaQuadros.pastaId, pastaOrdem: tarefaQuadros.pastaOrdem }).from(tarefaQuadros).where(eq(tarefaQuadros.pastaId, id));
  return pastasDosQuadros([p], qs)[0];
}

/** Quantas pastas o grupo já tem que a pessoa vê (o teto `MAX_CONJUNTOS`). */
export async function cabeMaisPasta(grupoId: number, u: UsuarioSessao): Promise<boolean> {
  return (await listarPastas([grupoId], u)).length < MAX_CONJUNTOS;
}

export async function criarPasta(grupoId: number, d: { nome: string; cor: string; privado: boolean }, usuarioId: number): Promise<number> {
  const [p] = await getDb()
    .insert(tarefaPastas)
    .values({ grupoId, nome: d.nome, cor: d.cor, privado: d.privado, criadoPor: usuarioId, ordem: sql`(SELECT COALESCE(MAX(ordem), 0) + 1 FROM tarefa_pastas WHERE grupo_id = ${grupoId})` })
    .returning({ id: tarefaPastas.id });
  return p.id;
}

export async function atualizarPasta(id: number, d: { nome?: string; cor?: string }) {
  if (d.nome === undefined && d.cor === undefined) return;
  await getDb()
    .update(tarefaPastas)
    .set({ ...d, atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(tarefaPastas.id, id));
}

export async function excluirPastaDoBanco(id: number) {
  const db = getDb();
  await db.batch(comandosExcluirPasta(db, id) as unknown as Parameters<typeof db.batch>[0]);
}

/**
 * Os QUADROS DA PASTA passam a ser `ids` (nessa ordem) — cada quadro NOVO nela passa pela regra (`motivoNaoMoverParaPasta`,
 * saindo da pasta em que estava); na PRIVADA, os públicos viram privados do dono. Os que saem ficam soltos. Devolve o
 * motivo da recusa (nada gravado) ou `null`.
 */
export async function definirQuadrosDaPasta(u: UsuarioSessao, pasta: ConjuntoQuadros, ids: number[]): Promise<string | null> {
  const ator = atorPasta(u);
  const novos = ids.filter((id) => !pasta.quadros.includes(id));
  const qs = new Map<number, Quadro>();
  for (const lote of lotesDeIds(novos)) {
    const r = await getDb().select(COLS_QUADRO).from(tarefaQuadros).innerJoin(grupos, eq(grupos.id, tarefaQuadros.grupoId)).where(and(inArray(tarefaQuadros.id, lote), quadroVisivel(u.id)));
    for (const q of r) qs.set(q.id, q);
  }
  const origens = new Map<number, ConjuntoQuadros | null>();
  for (const id of novos) {
    const q = qs.get(id);
    if (!q) return "Quadro não encontrado.";
    if (q.pastaId != null && !origens.has(q.pastaId)) origens.set(q.pastaId, await pastaAcessivel(u, q.pastaId));
    const motivo = motivoNaoMoverParaPasta(q, q.pastaId != null ? (origens.get(q.pastaId) ?? { id: String(q.pastaId), privado: true, criadoPor: null }) : null, pasta, ator);
    if (motivo) return `${q.nome}: ${motivo}`;
  }
  const publicos = pasta.privado && pasta.criadoPor != null ? novos.filter((id) => !qs.get(id)?.privado) : [];
  const db = getDb();
  await db.batch(comandosQuadrosDaPasta(db, Number(pasta.id), ids, publicos.length ? { dono: pasta.criadoPor as number, ids: publicos } : null) as unknown as Parameters<typeof db.batch>[0]);
  return null;
}

/**
 * MOVE o quadro para a pasta `destino` (`null` = a raiz), entre os VIZINHOS de dentro dela (ids de quadro — a ordem pelo
 * meio, `ordemEntre`). Entrando na PRIVADA o quadro vira privado; `tornarPublico` = saindo da privada, volta ao grupo.
 * Devolve o motivo da recusa ou `null`.
 */
export async function moverQuadroParaPasta(
  u: UsuarioSessao,
  q: Quadro,
  destino: ConjuntoQuadros | null,
  vizinhos: { antesDe?: number | null; depoisDe?: number | null },
  tornarPublico: boolean,
): Promise<string | null> {
  const origem = q.pastaId != null ? ((await pastaAcessivel(u, q.pastaId)) ?? { id: String(q.pastaId), privado: true, criadoPor: null, nome: "", cor: "", quadros: [], grupoId: q.grupoId }) : null;
  const publicar = tornarPublico && !!origem?.privado && !destino?.privado && q.criadoPor === u.id;
  const motivo = motivoNaoMoverParaPasta(q, origem, destino, atorPasta(u), publicar);
  if (motivo) return motivo;
  let pastaOrdem = 0;
  if (destino) {
    const ordem = async (id: number | null | undefined) => {
      if (id == null || id === q.id) return null;
      const [r] = await getDb().select({ o: tarefaQuadros.pastaOrdem }).from(tarefaQuadros).where(and(eq(tarefaQuadros.id, id), eq(tarefaQuadros.pastaId, Number(destino.id))));
      return r?.o ?? null;
    };
    const antes = await ordem(vizinhos.antesDe);
    const depois = await ordem(vizinhos.depoisDe);
    // `antesDe` = o quadro que fica DEPOIS do movido; `depoisDe` = o que fica ANTES.
    if (antes != null || depois != null) pastaOrdem = ordemEntre(depois, antes).ordem;
    else {
      const [m] = await getDb().select({ m: sql<number>`COALESCE(MAX(${tarefaQuadros.pastaOrdem}), 0)` }).from(tarefaQuadros).where(eq(tarefaQuadros.pastaId, Number(destino.id)));
      pastaOrdem = (m?.m ?? 0) + 1;
    }
  }
  const db = getDb();
  const privar = destino?.privado && !q.privado && destino.criadoPor != null ? destino.criadoPor : null;
  await db.batch(comandosMoverParaPasta(db, { quadroId: q.id, pastaId: destino ? Number(destino.id) : null, pastaOrdem, tornarPrivadoDe: privar, tornarPublico: publicar }) as unknown as Parameters<typeof db.batch>[0]);
  return null;
}

/** A pasta do quadro deixa de combinar com a privacidade dele (trocada na Configuração)? Então ele sai da pasta. */
export async function soltarSeIncompativel(q: Pick<Quadro, "id" | "pastaId">, privado: boolean) {
  if (q.pastaId == null) return;
  const [p] = await getDb().select({ privado: tarefaPastas.privado }).from(tarefaPastas).where(eq(tarefaPastas.id, q.pastaId));
  if (p && p.privado !== privado) await getDb().update(tarefaQuadros).set({ pastaId: null, pastaOrdem: 0 }).where(eq(tarefaQuadros.id, q.id));
}

/** Pode ORGANIZAR a pasta? (a regra pura, com o usuário da sessão) */
export const podeOrganizarPasta = (u: UsuarioSessao, p: Pick<ConjuntoQuadros, "privado" | "criadoPor">) => podeEditarPasta(p, atorPasta(u));

export async function excluirQuadro(id: number) {
  await getDb().delete(tarefaQuadros).where(eq(tarefaQuadros.id, id));
}

export async function getLista(id: number) {
  const [l] = await getDb().select().from(tarefaListas).where(eq(tarefaListas.id, id));
  return l ?? null;
}

export async function criarLista(quadroId: number, d: { nome: string; limiteWip?: number | null; concluida?: boolean }): Promise<number> {
  const [l] = await getDb()
    .insert(tarefaListas)
    .values({
      quadroId,
      nome: d.nome,
      limiteWip: d.limiteWip ?? null,
      concluida: d.concluida ?? false,
      ordem: sql`(SELECT COALESCE(MAX(ordem), 0) + 1 FROM tarefa_listas WHERE quadro_id = ${quadroId})`,
    })
    .returning({ id: tarefaListas.id });
  return l.id;
}

export async function atualizarLista(id: number, d: { nome?: string; limiteWip?: number | null; concluida?: boolean; arquivada?: boolean }) {
  await getDb().update(tarefaListas).set(d).where(eq(tarefaListas.id, id));
}

/** Quantos cartões (inclusive arquivados) a lista tem — a contagem da exclusão. */
export async function cartoesNaLista(id: number): Promise<number> {
  const [r] = await getDb().select({ n: sql<number>`COUNT(*)` }).from(tarefas).where(eq(tarefas.listaId, id));
  return Number(r?.n ?? 0);
}

/** Os ids dos cartões (inclusive arquivados) da lista. */
export async function idsNaLista(id: number): Promise<number[]> {
  return (await getDb().select({ id: tarefas.id }).from(tarefas).where(eq(tarefas.listaId, id))).map((t) => t.id);
}

/**
 * Exclui a lista. Com `destino`, os cartões (inclusive os arquivados) vão antes para o fim dele — no MESMO lote atômico;
 * sem, saem junto com a lista (cascade: checklists, comentários, eventos, vínculos).
 */
export async function excluirLista(id: number, destino?: { id: number; concluida: boolean }) {
  const db = getDb();
  const apagar = db.delete(tarefaListas).where(eq(tarefaListas.id, id));
  if (!destino) return void (await apagar);
  await db.batch([...comandosEsvaziarLista(db, id, destino.id, destino.concluida), apagar] as unknown as Parameters<typeof db.batch>[0]);
}

/** Grava a ORDEM das listas (as de fora do quadro são ignoradas). */
export async function ordenarListas(quadroId: number, ids: number[]) {
  const db = getDb();
  const cmds = ids.map((id, i) => db.update(tarefaListas).set({ ordem: i + 1 }).where(and(eq(tarefaListas.id, id), eq(tarefaListas.quadroId, quadroId))));
  if (cmds.length) await db.batch(cmds as [(typeof cmds)[number], ...(typeof cmds)[number][]]);
}

/** Põe a lista `id` logo DEPOIS de `aposId` (as demais na ordem de antes) — a cópia de uma lista fica ao lado dela. */
export async function colocarListaApos(quadroId: number, id: number, aposId: number) {
  const ids = (await listasDoQuadro(quadroId)).map((l) => l.id).filter((x) => x !== id);
  const i = ids.indexOf(aposId);
  if (i < 0) return;
  ids.splice(i + 1, 0, id);
  await ordenarListas(quadroId, ids);
}

/** Quantos comandos por lote ao RENUMERAR cartões (um UPDATE de 2 parâmetros cada). */
const LOTE_ORDEM = 100;

/** RENUMERA os cartões na ordem dada (1, 2, 3…) — "Ordenar por" da lista. */
export async function renumerarCartoes(ids: number[]) {
  const db = getDb();
  for (let i = 0; i < ids.length; i += LOTE_ORDEM) {
    const cmds = ids.slice(i, i + LOTE_ORDEM).map((id, k) => db.update(tarefas).set({ ordem: i + k + 1 }).where(eq(tarefas.id, id)));
    if (cmds.length) await db.batch(cmds as [(typeof cmds)[number], ...(typeof cmds)[number][]]);
  }
}

/** Os cartões ATIVOS (não arquivados) da lista, na ordem — o que "Ordenar por" considera. */
export async function cartoesAtivosDaLista(listaId: number) {
  const l = await getDb()
    .select({ id: tarefas.id, ordem: tarefas.ordem, prazo: tarefas.prazo, prazoHora: tarefas.prazoHora, criadoEm: tarefas.criadoEm, titulo: tarefas.titulo, prioridade: tarefas.prioridade })
    .from(tarefas)
    .where(and(eq(tarefas.listaId, listaId), eq(tarefas.arquivada, false)))
    .orderBy(asc(tarefas.ordem), asc(tarefas.id));
  return l.map((t) => ({ ...t, prioridade: prioridadeValida(t.prioridade) }));
}

/**
 * As LISTAS DOS DIAS no quadro (o quadro do período): cria SÓ as que faltam (pelo nome) e as põe depois das listas
 * comuns que já existem e ANTES das de concluídas. Devolve quantas nasceram.
 */
export async function gerarListasDoPeriodo(quadroId: number, dias: { nome: string }[]): Promise<number> {
  const db = getDb();
  const antes = await listasDoQuadro(quadroId);
  const existe = new Set(antes.map((l) => l.nome.trim().toLocaleUpperCase("pt-BR")));
  const novas = dias.filter((d) => !existe.has(d.nome.toLocaleUpperCase("pt-BR")));
  if (!novas.length) return 0;
  const cmds = novas.map((d) => db.insert(tarefaListas).values({ quadroId, nome: d.nome, ordem: 0 }));
  await db.batch(cmds as [(typeof cmds)[number], ...(typeof cmds)[number][]]);
  const depois = await listasDoQuadro(quadroId);
  const nomes = new Set(novas.map((d) => d.nome));
  const criadas = depois.filter((l) => !antes.some((a) => a.id === l.id) && nomes.has(l.nome));
  // A ordem dos dias = a pedida (o `id` cresce na ordem de inserção).
  criadas.sort((a, b) => a.id - b.id);
  await ordenarListas(quadroId, [...antes.filter((l) => !l.concluida).map((l) => l.id), ...criadas.map((l) => l.id), ...antes.filter((l) => l.concluida).map((l) => l.id)]);
  return criadas.length;
}

export async function criarEtiqueta(quadroId: number, d: { nome: string; cor: string }): Promise<number> {
  const [e] = await getDb()
    .insert(tarefaEtiquetas)
    .values({ quadroId, ...d, ordem: sql`(SELECT COALESCE(MAX(ordem), 0) + 1 FROM tarefa_etiquetas WHERE quadro_id = ${quadroId})` })
    .returning({ id: tarefaEtiquetas.id });
  return e.id;
}

export async function getEtiqueta(id: number) {
  const [e] = await getDb().select().from(tarefaEtiquetas).where(eq(tarefaEtiquetas.id, id));
  return e ?? null;
}

export async function atualizarEtiqueta(id: number, d: { nome: string; cor: string }) {
  await getDb().update(tarefaEtiquetas).set(d).where(eq(tarefaEtiquetas.id, id));
}

export async function excluirEtiqueta(id: number) {
  await getDb().delete(tarefaEtiquetas).where(eq(tarefaEtiquetas.id, id));
}

/** As etiquetas pedidas que são DO quadro (as de outro quadro saem). */
export async function etiquetasDoQuadro(quadroId: number, ids: number[]): Promise<number[]> {
  if (!ids.length) return [];
  const r = await getDb()
    .select({ id: tarefaEtiquetas.id })
    .from(tarefaEtiquetas)
    .where(and(eq(tarefaEtiquetas.quadroId, quadroId), inArray(tarefaEtiquetas.id, ids)));
  return r.map((x) => x.id);
}

/** As EQUIPES do quadro com os membros (a Configuração, o detalhe e o calendário). */
export async function listarEquipes(quadroIds: number[]): Promise<(EquipeQuadro & { quadroId: number })[]> {
  const partes = await porLotesDeQuadros(quadroIds, (ids) =>
    getDb()
      .select({ id: tarefaEquipes.id, quadroId: tarefaEquipes.quadroId, nome: tarefaEquipes.nome, cor: tarefaEquipes.cor, ordem: tarefaEquipes.ordem, usuarioId: tarefaEquipeMembros.usuarioId })
      .from(tarefaEquipes)
      .leftJoin(tarefaEquipeMembros, eq(tarefaEquipeMembros.equipeId, tarefaEquipes.id))
      .where(inArray(tarefaEquipes.quadroId, ids))
      .orderBy(asc(tarefaEquipes.quadroId), asc(tarefaEquipes.ordem), asc(tarefaEquipes.id)),
  );
  const m = new Map<number, EquipeQuadro & { quadroId: number }>();
  for (const l of partes) {
    const e = m.get(l.id) ?? { id: l.id, quadroId: l.quadroId, nome: l.nome, cor: l.cor, ordem: l.ordem, membros: [] };
    if (l.usuarioId != null) e.membros.push(l.usuarioId);
    m.set(l.id, e);
  }
  return [...m.values()];
}

export async function getEquipe(id: number): Promise<(EquipeQuadro & { quadroId: number }) | null> {
  const [e] = await getDb().select().from(tarefaEquipes).where(eq(tarefaEquipes.id, id));
  if (!e) return null;
  const membros = await getDb().select({ u: tarefaEquipeMembros.usuarioId }).from(tarefaEquipeMembros).where(eq(tarefaEquipeMembros.equipeId, id));
  return { ...e, membros: membros.map((x) => x.u) };
}

/** Cria (sem `id`) ou atualiza a equipe + os membros num lote atômico; devolve o id. */
export async function gravarEquipe(d: { id?: number; quadroId: number; nome: string; cor: string; membros: number[] }): Promise<number> {
  const db = getDb();
  const cmds = comandosEquipe(db, d);
  await db.batch(cmds as [(typeof cmds)[number], ...(typeof cmds)[number][]]);
  if (d.id != null) return d.id;
  const [e] = await db.select({ id: sql<number>`MAX(${tarefaEquipes.id})` }).from(tarefaEquipes).where(eq(tarefaEquipes.quadroId, d.quadroId));
  return Number(e.id);
}

export async function excluirEquipe(id: number) {
  await getDb().delete(tarefaEquipes).where(eq(tarefaEquipes.id, id));
}

/** As equipes pedidas que são DO quadro (as de outro quadro saem). */
export async function equipesDoQuadro(quadroId: number, ids: number[]): Promise<number[]> {
  if (!ids.length) return [];
  const r = await getDb()
    .select({ id: tarefaEquipes.id })
    .from(tarefaEquipes)
    .where(and(eq(tarefaEquipes.quadroId, quadroId), inArray(tarefaEquipes.id, ids)));
  return r.map((x) => x.id);
}

/** Os MEMBROS (sem repetir) das equipes dadas — quem passa a ser da tarefa ao ganhar a equipe. */
export async function membrosDasEquipes(ids: number[]): Promise<number[]> {
  if (!ids.length) return [];
  const r = await getDb().select({ u: tarefaEquipeMembros.usuarioId }).from(tarefaEquipeMembros).where(inArray(tarefaEquipeMembros.equipeId, ids.slice(0, 90)));
  return [...new Set(r.map((x) => x.u))];
}

// ─── CAMPOS PERSONALIZADOS (migração `0056`) ──────────────────────────────────────────────────────────────

/** Os campos dos quadros dados, na ordem de cada quadro. */
export async function listarCampos(quadroIds: number[]): Promise<(CampoTarefa & { quadroId: number })[]> {
  const r = await porLotesDeQuadros(quadroIds, (ids) =>
    getDb()
      .select()
      .from(tarefaCampos)
      .where(inArray(tarefaCampos.quadroId, ids))
      .orderBy(asc(tarefaCampos.quadroId), asc(tarefaCampos.ordem), asc(tarefaCampos.id)),
  );
  return r.map((c) => ({ id: c.id, quadroId: c.quadroId, nome: c.nome, tipo: coerceTipoCampo(c.tipo), opcoes: lerOpcoesCampo(c.opcoes), ordem: c.ordem, noCartao: c.noCartao }));
}

export async function getCampo(id: number): Promise<(CampoTarefa & { quadroId: number }) | null> {
  const [c] = await getDb().select({ quadroId: tarefaCampos.quadroId }).from(tarefaCampos).where(eq(tarefaCampos.id, id));
  if (!c) return null;
  return (await listarCampos([c.quadroId])).find((x) => x.id === id) ?? null;
}

type DadosCampo = { nome: string; tipo: CampoTarefa["tipo"]; opcoes: string[]; noCartao: boolean };

export async function criarCampo(quadroId: number, d: DadosCampo): Promise<number> {
  const [c] = await getDb()
    .insert(tarefaCampos)
    .values({
      quadroId,
      nome: d.nome,
      tipo: d.tipo,
      opcoes: d.opcoes.length ? JSON.stringify(d.opcoes) : null,
      noCartao: d.noCartao,
      ordem: sql`(SELECT COALESCE(MAX(ordem), 0) + 1 FROM tarefa_campos WHERE quadro_id = ${quadroId})`,
    })
    .returning({ id: tarefaCampos.id });
  return c.id;
}

/**
 * Atualiza o campo. Trocar o TIPO apaga os valores (não se convertem); tirar OPÇÕES da lista apaga os valores que ficaram
 * sem opção — nada fica gravado fora do que o campo aceita.
 */
export async function atualizarCampo(id: number, antes: CampoTarefa, d: DadosCampo) {
  const db = getDb();
  const limpar =
    antes.tipo !== d.tipo
      ? [db.delete(tarefaCampoValores).where(eq(tarefaCampoValores.campoId, id))]
      : d.tipo === "lista"
        ? [db.delete(tarefaCampoValores).where(and(eq(tarefaCampoValores.campoId, id), sql`${tarefaCampoValores.valor} NOT IN (SELECT value FROM json_each(${JSON.stringify(d.opcoes)}))`))]
        : [];
  await db.batch([
    db
      .update(tarefaCampos)
      .set({ nome: d.nome, tipo: d.tipo, opcoes: d.opcoes.length ? JSON.stringify(d.opcoes) : null, noCartao: d.noCartao })
      .where(eq(tarefaCampos.id, id)),
    ...limpar,
  ]);
}

export async function excluirCampo(id: number) {
  await getDb().delete(tarefaCampos).where(eq(tarefaCampos.id, id));
}

export async function ordenarCampos(quadroId: number, ids: number[]) {
  const db = getDb();
  const [primeiro, ...resto] = ids.map((c, i) => db.update(tarefaCampos).set({ ordem: i + 1 }).where(and(eq(tarefaCampos.id, c), eq(tarefaCampos.quadroId, quadroId))));
  await db.batch([primeiro, ...resto]);
}

/** Os valores dos campos de UMA tarefa (id do campo → valor). */
export async function valoresDaTarefa(tarefaId: number): Promise<Record<number, string>> {
  const r = await getDb().select({ c: tarefaCampoValores.campoId, v: tarefaCampoValores.valor }).from(tarefaCampoValores).where(eq(tarefaCampoValores.tarefaId, tarefaId));
  return Object.fromEntries(r.map((x) => [x.c, x.v]));
}

/**
 * CONFERE e NORMALIZA os valores pedidos contra os campos do quadro: campo de outro quadro → `null` (recusa); valor
 * inválido para o tipo vira "tirar" (`valorCampo` = null).
 */
export function valoresValidos(campos: CampoTarefa[], pedidos: { campoId: number; valor: string | null }[]): ValorCampoNovo[] | null {
  const porId = new Map(campos.map((c) => [c.id, c]));
  const out: ValorCampoNovo[] = [];
  for (const p of pedidos) {
    const c = porId.get(p.campoId);
    if (!c) return null;
    out.push({ campoId: c.id, valor: valorCampo(c, p.valor) });
  }
  return out;
}

/**
 * O TÍTULO que a tarefa deve ter: com o formato do quadro ligado e o título NÃO manual, o automático (se sair algo); senão
 * `null` (fica o que há).
 */
export function tituloAutomatico(quadro: Quadro, campos: CampoTarefa[], valores: Record<number, string>, manual: boolean): string | null {
  if (!quadro.formatoTitulo || manual) return null;
  return montarTitulo(quadro.formatoTitulo, campos, valores) || null;
}

/** Os valores de uma tarefa num quadro de DESTINO (copiar/mover — pelo nome do campo em outro quadro). */
async function camposNoDestino(t: TarefaCompleta, origem: Quadro, destino: Quadro): Promise<{ campoId: number; valor: string }[]> {
  const valores = t.campos ?? {};
  if (!Object.keys(valores).length) return [];
  if (origem.id === destino.id) return Object.entries(valores).map(([c, v]) => ({ campoId: Number(c), valor: v }));
  const [co, cd] = await Promise.all([listarCampos([origem.id]), listarCampos([destino.id])]);
  return mapearCampos(co, cd, valores);
}

/** CRIA a tarefa (ticket + fim da lista + responsáveis + etiquetas, num lote atômico). */
export async function criarTarefa(d: Parameters<typeof comandosCriarTarefa>[1]): Promise<{ id: number; ticket: number }> {
  const db = getDb();
  const r = await db.batch(comandosCriarTarefa(db, d));
  const [nova] = r[r.length - 1] as { id: number; ticket: number }[];
  return nova;
}

/** Atualiza os campos + (opcional) responsáveis/observadores/etiquetas num lote só. */
export async function atualizarTarefa(
  id: number,
  campos: {
    titulo?: string;
    descricao?: string | null;
    prioridade?: Prioridade;
    inicio?: string | null;
    prazo?: string | null;
    prazoHora?: string | null;
    lembreteMin?: number | null;
    capa?: string | null;
    arquivada?: boolean;
    estimativaH?: number | null;
    vinculos?: { tipo: TipoVinculo; id: number }[];
    recorrencia?: Recorrencia | null;
    blocos?: BlocoTarefa[];
    /** Concluir/reabrir NO LUGAR. */
    concluida?: boolean;
    tituloManual?: boolean;
  },
  vinculos: { pessoas?: number[]; observadores?: number[]; etiquetas?: number[]; equipes?: number[] },
  valores: ValorCampoNovo[] = [],
) {
  const db = getDb();
  const { vinculos: ligacoes, recorrencia, blocos, concluida, ...resto } = campos;
  await db.batch([
    db
      .update(tarefas)
      .set({
        ...resto,
        // Sem prazo, a hora e o lembrete não fazem sentido.
        ...(resto.prazo === null ? { prazoHora: null, lembreteMin: null } : {}),
        ...(concluida !== undefined ? { concluidaEm: concluida ? sql`COALESCE(${tarefas.concluidaEm}, CURRENT_TIMESTAMP)` : null } : {}),
        ...(recorrencia !== undefined ? { recorrencia: recorrencia ? JSON.stringify(recorrencia) : null } : {}),
        ...(blocos !== undefined ? { blocos: JSON.stringify(blocosParaGravar(blocos)) } : {}),
        atualizadoEm: sql`(CURRENT_TIMESTAMP)`,
      })
      .where(eq(tarefas.id, id)),
    ...comandosVinculos(db, id, vinculos),
    ...(ligacoes ? comandosVinculosTarefa(db, id, ligacoes) : []),
    ...comandosValoresCampos(db, id, valores),
  ]);
}

/**
 * MOVE o cartão para `listaId` entre os vizinhos dados (ids da MESMA lista; `null` = ponta). A ordem vem de
 * `ordemEntre`; sem vão, RENUMERA a lista (1, 2, 3…) com o cartão já no lugar. Devolve as ordens gravadas.
 */
export async function moverTarefa(id: number, listaId: number, anteriorId: number | null, proximoId: number | null, concluida: boolean) {
  const db = getDb();
  const lista = await db
    .select({ id: tarefas.id, ordem: tarefas.ordem })
    .from(tarefas)
    .where(and(eq(tarefas.listaId, listaId), eq(tarefas.arquivada, false)))
    .orderBy(asc(tarefas.ordem), asc(tarefas.ticket));
  const outros = lista.filter((t) => t.id !== id);
  const ordemDe = (x: number | null) => (x == null ? null : (outros.find((t) => t.id === x)?.ordem ?? null));
  // Um vizinho que não está (mais) na lista conta como ponta.
  const r = ordemEntre(ordemDe(anteriorId), ordemDe(proximoId));
  let ordens: [number, number][] = [];
  let ordem = r.ordem;
  if (r.renumerar) {
    const pos = anteriorId == null ? 0 : outros.findIndex((t) => t.id === anteriorId) + 1;
    const nova = [...outros.slice(0, pos).map((t) => t.id), id, ...outros.slice(pos).map((t) => t.id)];
    ordens = nova.map((t, i) => [t, i + 1] as [number, number]).filter(([t]) => t !== id);
    ordem = pos + 1;
  }
  await db.batch(comandosMover(db, id, listaId, ordem, concluida, ordens) as [ReturnType<typeof comandosMover>[number], ...ReturnType<typeof comandosMover>]);
  return { ordem, ordens };
}

/** Põe o cartão `id` logo DEPOIS de `aposId` na lista (o "Duplicar": a cópia fica embaixo do original). */
export async function colocarTarefaApos(id: number, listaId: number, aposId: number, concluida: boolean) {
  const lista = await getDb()
    .select({ id: tarefas.id })
    .from(tarefas)
    .where(and(eq(tarefas.listaId, listaId), eq(tarefas.arquivada, false), sql`${tarefas.id} <> ${id}`))
    .orderBy(asc(tarefas.ordem), asc(tarefas.ticket));
  const i = lista.findIndex((t) => t.id === aposId);
  if (i < 0) return;
  await moverTarefa(id, listaId, aposId, lista[i + 1]?.id ?? null, concluida);
}

/** O último cartão (não arquivado) da lista, sem contar `exceto` — mover "para o fim". */
export async function ultimoDaLista(listaId: number, exceto: number): Promise<number | null> {
  const [t] = await getDb()
    .select({ id: tarefas.id })
    .from(tarefas)
    .where(and(eq(tarefas.listaId, listaId), eq(tarefas.arquivada, false), sql`${tarefas.id} <> ${exceto}`))
    .orderBy(sql`${tarefas.ordem} DESC`, sql`${tarefas.ticket} DESC`)
    .limit(1);
  return t?.id ?? null;
}

export async function excluirTarefa(id: number) {
  await getDb().delete(tarefas).where(eq(tarefas.id, id));
}

// ─── Conteúdo do cartão (fase 2): checklist · comentários ────────────────────────────────────────────

export type ItemChecklist = { id: number; checklistId: number; texto: string; feito: boolean; ordem: number; prazo: string | null; responsavelId: number | null };
/** Um CHECKLIST nomeado da tarefa (os itens vêm à parte, com `checklistId`). */
export type ChecklistNomeado = { id: number; nome: string; ordem: number };
export type ComentarioTarefa = { id: number; usuarioId: number | null; usuarioNome: string; texto: string; mencoes: number[]; criadoEm: string | null; editadoEm: string | null };

export const lerMencoes = (v: string | null): number[] => {
  try {
    const a = JSON.parse(v ?? "[]");
    return Array.isArray(a) ? a.filter((x): x is number => Number.isInteger(x)) : [];
  } catch {
    return [];
  }
};

/** O CONTEÚDO do cartão (checklist e comentários — mais antigo primeiro). */
export async function conteudoTarefa(
  id: number,
): Promise<{ checklists: ChecklistNomeado[]; checklist: ItemChecklist[]; comentarios: ComentarioTarefa[]; eventos: EventoTarefa[] }> {
  const db = getDb();
  const [checklists, checklist, comentarios, eventos] = await Promise.all([
    listarChecklists(id),
    itensChecklist(id),
    db.select().from(tarefaComentarios).where(eq(tarefaComentarios.tarefaId, id)).orderBy(asc(tarefaComentarios.id)),
    db
      .select(COLS_EVENTO)
      .from(tarefaEventos)
      .where(eq(tarefaEventos.tarefaId, id))
      .orderBy(asc(tarefaEventos.data), asc(tarefaEventos.horaInicio))
      .then(comConvidados),
  ]);
  return {
    checklists,
    checklist,
    eventos,
    comentarios: comentarios.map((c) => ({
      id: c.id,
      usuarioId: c.usuarioId,
      usuarioNome: c.usuarioNome,
      texto: c.texto,
      mencoes: lerMencoes(c.mencoes),
      criadoEm: c.criadoEm,
      editadoEm: c.editadoEm,
    })),
  };
}

// ─── EVENTOS da tarefa (migração `0046`) ─────────────────────────────────────────────────────────────────────

const COLS_EVENTO = {
  id: tarefaEventos.id,
  tarefaId: tarefaEventos.tarefaId,
  titulo: tarefaEventos.titulo,
  data: tarefaEventos.data,
  dataFim: tarefaEventos.dataFim,
  diaInteiro: tarefaEventos.diaInteiro,
  horaInicio: tarefaEventos.horaInicio,
  horaFim: tarefaEventos.horaFim,
  local: tarefaEventos.local,
  descricao: tarefaEventos.descricao,
  cor: tarefaEventos.cor,
  lembreteMin: tarefaEventos.lembreteMin,
  recorrencia: tarefaEventos.recorrencia,
  linkReuniao: tarefaEventos.linkReuniao,
  ocupado: tarefaEventos.ocupado,
  privado: tarefaEventos.privado,
  criadoPor: tarefaEventos.criadoPor,
};
type LinhaEvento = Omit<EventoTarefa, "recorrencia" | "convidados"> & { recorrencia: string | null };

/** As linhas + os CONVIDADOS de cada evento (lidos em lotes de ≤ 90 ids) e a repetição lida. */
async function comConvidados(linhas: LinhaEvento[]): Promise<EventoTarefa[]> {
  const por = new Map<number, EventoTarefa["convidados"]>();
  const db = getDb();
  for (const lote of lotesDeIds(linhas.map((l) => l.id))) {
    const cs = await db
      .select({ eventoId: tarefaEventoConvidados.eventoId, usuarioId: tarefaEventoConvidados.usuarioId, resposta: tarefaEventoConvidados.resposta })
      .from(tarefaEventoConvidados)
      .where(inArray(tarefaEventoConvidados.eventoId, lote));
    for (const c of cs) por.set(c.eventoId, [...(por.get(c.eventoId) ?? []), { usuarioId: c.usuarioId, resposta: coerceResposta(c.resposta) }]);
  }
  return linhas.map((l) => ({ ...l, recorrencia: lerRecorrenciaEvento(l.recorrencia), convidados: por.get(l.id) ?? [] }));
}

export async function getEvento(id: number): Promise<EventoTarefa | null> {
  const [e] = await getDb().select(COLS_EVENTO).from(tarefaEventos).where(eq(tarefaEventos.id, id));
  return e ? ((await comConvidados([e]))[0] ?? null) : null;
}

export async function contarEventos(tarefaId: number): Promise<number> {
  const [r] = await getDb().select({ n: sql<number>`COUNT(*)` }).from(tarefaEventos).where(eq(tarefaEventos.tarefaId, tarefaId));
  return Number(r?.n ?? 0);
}

export async function criarEvento(tarefaId: number, d: DadosEvento, usuarioId: number): Promise<number> {
  const db = getDb();
  const r = await db.batch(comandosCriarEvento(db, tarefaId, d, usuarioId));
  return (r.at(-1) as { id: number }[])[0].id;
}

export async function atualizarEvento(id: number, d: DadosEvento) {
  const db = getDb();
  const cmds = comandosAtualizarEvento(db, id, d);
  await db.batch(cmds as [(typeof cmds)[number], ...(typeof cmds)[number][]]);
}

/** A RESPOSTA do convidado (só dele). */
export async function responderConvite(eventoId: number, usuarioId: number, resposta: RespostaConvite) {
  await getDb()
    .update(tarefaEventoConvidados)
    .set({ resposta, respondidoEm: sql`(CURRENT_TIMESTAMP)` })
    .where(and(eq(tarefaEventoConvidados.eventoId, eventoId), eq(tarefaEventoConvidados.usuarioId, usuarioId)));
}

export async function excluirEvento(id: number) {
  await getDb().delete(tarefaEventos).where(eq(tarefaEventos.id, id));
}

/** Tetos das cargas do calendário (a tela avisa quando algum é atingido — nada some em silêncio). */
export const LIMITE_EVENTOS_CALENDARIO = 5000;
export const LIMITE_TAREFAS_CALENDARIO = 3000;

/** Os EVENTOS das tarefas (não arquivadas) dos quadros dados que CRUZAM `de`–`ate` (o de vários dias pela data final;
 * sem intervalo = todos) — o calendário. */
export async function eventosDosQuadros(quadroIds: number[], de?: string, ate?: string): Promise<EventoTarefa[]> {
  const linhas = await porLotesDeQuadros(quadroIds, (ids) => eventosDoLote(ids, de, ate));
  return comConvidados(linhas.sort((a, b) => a.data.localeCompare(b.data)).slice(0, LIMITE_EVENTOS_CALENDARIO));
}
function eventosDoLote(ids: number[], de?: string, ate?: string) {
  return getDb()
    .select(COLS_EVENTO)
    .from(tarefaEventos)
    .innerJoin(tarefas, eq(tarefas.id, tarefaEventos.tarefaId))
    .where(
      and(
        inArray(tarefas.quadroId, ids),
        eq(tarefas.arquivada, false),
        eq(tarefas.template, false),
        listaAtiva,
        // A SÉRIE (repetição) entra se começou até o fim do intervalo e não terminou antes dele.
        de
          ? sql`(COALESCE(${tarefaEventos.dataFim}, ${tarefaEventos.data}) >= ${de} OR (${tarefaEventos.recorrencia} IS NOT NULL AND COALESCE(json_extract(${tarefaEventos.recorrencia}, '$.ate'), '9999-12-31') >= ${de}))`
          : undefined,
        ate ? sql`${tarefaEventos.data} <= ${ate}` : undefined,
      ),
    )
    .orderBy(asc(tarefaEventos.data))
    .limit(LIMITE_EVENTOS_CALENDARIO);
}

/** As tarefas ABERTAS (não arquivadas, em lista ativa) dos quadros — a escolha da tarefa ao CRIAR um evento no calendário
 * e o painel das tarefas SEM PRAZO (arrastar até um dia). */
export async function tarefasAbertasLeves(quadroIds: number[]): Promise<{ id: number; quadroId: number; ticket: number; titulo: string; prazo: string | null }[]> {
  const linhas = await porLotesDeQuadros(quadroIds, (ids) =>
    getDb()
      .select({ id: tarefas.id, quadroId: tarefas.quadroId, ticket: tarefas.ticket, titulo: tarefas.titulo, prazo: tarefas.prazo })
      .from(tarefas)
      .where(and(inArray(tarefas.quadroId, ids), eq(tarefas.arquivada, false), eq(tarefas.template, false), sql`${tarefas.concluidaEm} IS NULL`, listaAtiva))
      .orderBy(asc(tarefas.quadroId), desc(tarefas.ticket))
      .limit(LIMITE_TAREFAS_CALENDARIO),
  );
  return linhas.slice(0, LIMITE_TAREFAS_CALENDARIO);
}

/** Os checklists nomeados da tarefa, na ordem. */
export function listarChecklists(tarefaId: number): Promise<ChecklistNomeado[]> {
  return getDb()
    .select({ id: tarefaChecklists.id, nome: tarefaChecklists.nome, ordem: tarefaChecklists.ordem })
    .from(tarefaChecklists)
    .where(eq(tarefaChecklists.tarefaId, tarefaId))
    .orderBy(asc(tarefaChecklists.ordem), asc(tarefaChecklists.id));
}

/** Os itens de TODOS os checklists da tarefa (o `checklistId` diz de qual), na ordem. */
export async function itensChecklist(tarefaId: number): Promise<ItemChecklist[]> {
  const l = await getDb()
    .select({
      id: tarefaChecklist.id,
      checklistId: tarefaChecklist.checklistId,
      texto: tarefaChecklist.texto,
      feito: tarefaChecklist.feito,
      ordem: tarefaChecklist.ordem,
      prazo: tarefaChecklist.prazo,
      responsavelId: tarefaChecklist.responsavelId,
    })
    .from(tarefaChecklist)
    .where(eq(tarefaChecklist.tarefaId, tarefaId))
    .orderBy(asc(tarefaChecklist.ordem), asc(tarefaChecklist.id));
  return l.map((i) => ({ ...i, checklistId: i.checklistId ?? 0 }));
}

/** Os checklists da tarefa como a CRIAÇÃO os pede (nome + textos, desmarcados) — recorrência e cópia. */
export async function checklistsParaCopiar(tarefaId: number): Promise<ChecklistNovo[]> {
  const [cls, itens] = await Promise.all([listarChecklists(tarefaId), itensChecklist(tarefaId)]);
  return cls.map((c) => ({ nome: c.nome, itens: itens.filter((i) => i.checklistId === c.id).map((i) => i.texto) }));
}

export async function getChecklist(id: number) {
  const [c] = await getDb().select().from(tarefaChecklists).where(eq(tarefaChecklists.id, id));
  return c ?? null;
}

/** CRIA um checklist nomeado (vazio) no fim da tarefa. */
export async function criarChecklist(tarefaId: number, nome: string): Promise<number> {
  const [c] = await getDb()
    .insert(tarefaChecklists)
    .values({ tarefaId, nome, ordem: sql`(SELECT COALESCE(MAX(ordem), 0) + 1 FROM tarefa_checklists WHERE tarefa_id = ${tarefaId})` })
    .returning({ id: tarefaChecklists.id });
  return c.id;
}

export async function renomearChecklist(id: number, nome: string) {
  await getDb().update(tarefaChecklists).set({ nome }).where(eq(tarefaChecklists.id, id));
}

/** Exclui o checklist e os itens dele (num lote — não depende do cascade). */
export async function excluirChecklist(id: number) {
  const db = getDb();
  await db.batch([db.delete(tarefaChecklist).where(eq(tarefaChecklist.checklistId, id)), db.delete(tarefaChecklists).where(eq(tarefaChecklists.id, id))]);
}

export async function getItemChecklist(id: number) {
  const [i] = await getDb().select().from(tarefaChecklist).where(eq(tarefaChecklist.id, id));
  return i ?? null;
}

/** Acrescenta um item ao FIM do checklist dado (da própria tarefa); sem ele, ao 1º — criado ("Checklist") se não houver. */
export async function criarItemChecklist(tarefaId: number, texto: string, checklistId?: number): Promise<{ id: number; checklistId: number } | null> {
  const db = getDb();
  let alvo = checklistId ?? null;
  if (alvo != null) {
    const c = await getChecklist(alvo);
    if (!c || c.tarefaId !== tarefaId) return null;
  } else alvo = (await listarChecklists(tarefaId))[0]?.id ?? (await criarChecklist(tarefaId, "Checklist"));
  const [i] = await db
    .insert(tarefaChecklist)
    .values({ tarefaId, checklistId: alvo, texto, ordem: sql`(SELECT COALESCE(MAX(ordem), 0) + 1 FROM tarefa_checklist WHERE checklist_id = ${alvo})` })
    .returning({ id: tarefaChecklist.id });
  return { id: i.id, checklistId: alvo };
}

/**
 * Edita o item (texto/feito/prazo/responsável) e, com vizinhos, o REORDENA entre eles DENTRO do checklist dele (ordem
 * fracionária; sem vão, renumera o checklist).
 */
export async function atualizarItemChecklist(
  item: { id: number; tarefaId: number; checklistId: number | null },
  d: { texto?: string; feito?: boolean; anteriorId?: number | null; proximoId?: number | null; prazo?: string | null; responsavelId?: number | null },
) {
  const db = getDb();
  let ordem: number | undefined;
  const renumeros: [number, number][] = [];
  if (d.anteriorId !== undefined || d.proximoId !== undefined) {
    const doChecklist = item.checklistId != null ? eq(tarefaChecklist.checklistId, item.checklistId) : eq(tarefaChecklist.tarefaId, item.tarefaId);
    const lista = (
      await db.select({ id: tarefaChecklist.id, ordem: tarefaChecklist.ordem }).from(tarefaChecklist).where(doChecklist).orderBy(asc(tarefaChecklist.ordem), asc(tarefaChecklist.id))
    ).filter((x) => x.id !== item.id);
    const de = (x: number | null | undefined) => (x == null ? null : (lista.find((l) => l.id === x)?.ordem ?? null));
    const r = ordemItem(de(d.anteriorId), de(d.proximoId));
    ordem = r.ordem;
    if (r.renumerar) {
      const pos = d.anteriorId == null ? 0 : lista.findIndex((l) => l.id === d.anteriorId) + 1;
      const nova = [...lista.slice(0, pos).map((l) => l.id), item.id, ...lista.slice(pos).map((l) => l.id)];
      ordem = pos + 1;
      nova.forEach((x, i) => {
        if (x !== item.id) renumeros.push([x, i + 1]);
      });
    }
  }
  const set = {
    ...(d.texto != null ? { texto: d.texto } : {}),
    ...(d.feito != null ? { feito: d.feito } : {}),
    ...(ordem != null ? { ordem } : {}),
    ...(d.prazo !== undefined ? { prazo: d.prazo } : {}),
    ...(d.responsavelId !== undefined ? { responsavelId: d.responsavelId } : {}),
  };
  const cmds = [
    ...(Object.keys(set).length ? [db.update(tarefaChecklist).set(set).where(eq(tarefaChecklist.id, item.id))] : []),
    ...renumeros.map(([x, o]) => db.update(tarefaChecklist).set({ ordem: o }).where(eq(tarefaChecklist.id, x))),
  ];
  if (cmds.length) await db.batch(cmds as [(typeof cmds)[number], ...(typeof cmds)[number][]]);
}

export async function excluirItemChecklist(id: number) {
  await getDb().delete(tarefaChecklist).where(eq(tarefaChecklist.id, id));
}

export async function getComentario(id: number) {
  const [c] = await getDb().select().from(tarefaComentarios).where(eq(tarefaComentarios.id, id));
  return c ?? null;
}

export async function criarComentario(d: { tarefaId: number; usuarioId: number; usuarioNome: string; texto: string; mencoes: number[] }): Promise<number> {
  const [c] = await getDb()
    .insert(tarefaComentarios)
    .values({ ...d, mencoes: JSON.stringify(d.mencoes) })
    .returning({ id: tarefaComentarios.id });
  return c.id;
}

export async function editarComentario(id: number, texto: string, mencoes: number[]) {
  await getDb()
    .update(tarefaComentarios)
    .set({ texto, mencoes: JSON.stringify(mencoes), editadoEm: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(tarefaComentarios.id, id));
}

export async function excluirComentario(id: number) {
  await getDb().delete(tarefaComentarios).where(eq(tarefaComentarios.id, id));
}

// ─── Massa · vínculos ────────────────────────────────────────────────────────────────────────────────────────

/** As tarefas pedidas (id, quadro, ticket, título, lista) — a conferência de acesso da edição em massa. */
export async function tarefasPorIds(ids: number[]) {
  const db = getDb();
  return (
    await Promise.all(
      lotesDeIds(ids).map((l) =>
        db
          .select({ id: tarefas.id, quadroId: tarefas.quadroId, ticket: tarefas.ticket, titulo: tarefas.titulo, listaId: tarefas.listaId, template: tarefas.template })
          .from(tarefas)
          .where(inArray(tarefas.id, l)),
      ),
    )
  ).flat();
}

/** Aplica a EDIÇÃO EM MASSA (ids já conferidos) num lote atômico. */
export async function aplicarMassaTarefas(ids: number[], acao: AcaoMassaTarefas, listaConcluida = false) {
  const db = getDb();
  const cmds = comandosMassa(db, ids, acao, listaConcluida);
  if (cmds.length) await db.batch(cmds as [(typeof cmds)[number], ...(typeof cmds)[number][]]);
}

/** Opções para VINCULAR uma tarefa (até 50 por busca): protocolos e DFDs no escopo de unidade do usuário; PCAs e
 * orçamentos (globais); TAREFAS dos quadros dos grupos do usuário. `q` casa nº/Id/assunto (protocolo), nº/planejamento (DFD) ou nome/ano (PCA/orçamento). */
export async function buscarVinculos(u: UsuarioSessao, tipo: TipoVinculo, q: string): Promise<{ id: number; rotulo: string; detalhe: string }[]> {
  const db = getDb();
  const termo = `%${q.trim().replace(/[%_]/g, "")}%`;
  const LIMITE = 50;
  if (tipo === "tarefa") {
    // As tarefas (não templates) dos quadros ATIVOS dos grupos do usuário — o ADM, todos; `q` casa o título ou o nº do ticket.
    const grupoIds = u.role === "admin" ? null : (await gruposDoUsuario(u.id)).map((g) => g.id);
    if (grupoIds && !grupoIds.length) return [];
    const ticket = /^#?\d{1,9}$/.test(q.trim()) ? Number(q.trim().replace("#", "")) : null;
    const linhas = await db
      .select({ id: tarefas.id, ticket: tarefas.ticket, titulo: tarefas.titulo, quadro: tarefaQuadros.nome, lista: tarefaListas.nome })
      .from(tarefas)
      .innerJoin(tarefaQuadros, eq(tarefaQuadros.id, tarefas.quadroId))
      .innerJoin(tarefaListas, eq(tarefaListas.id, tarefas.listaId))
      .where(
        and(
          eq(tarefas.template, false),
          eq(tarefaQuadros.arquivado, false),
          grupoIds ? inArray(tarefaQuadros.grupoId, grupoIds.slice(0, 90)) : undefined,
          quadroVisivel(u.id),
          ticket != null ? or(eq(tarefas.ticket, ticket), like(tarefas.titulo, termo)) : like(tarefas.titulo, termo),
        ),
      )
      .orderBy(tarefas.arquivada, desc(tarefas.id))
      .limit(LIMITE);
    return linhas.map((l) => ({ id: l.id, rotulo: `#${l.ticket} ${l.titulo}`, detalhe: `${l.quadro} › ${l.lista}` }));
  }
  if (tipo === "pca" || tipo === "orcamento") {
    const t = tipo === "pca" ? pcas : orcamentos;
    const linhas = await db
      .select({ id: t.id, nome: t.nome, ano: t.ano })
      .from(t)
      .where(or(like(t.nome, termo), like(sql`CAST(${t.ano} AS TEXT)`, termo)))
      .orderBy(desc(t.id))
      .limit(LIMITE);
    // O MESMO rótulo que `rotulosVinculos` dá ao vínculo gravado (orçamento = nome + ano).
    return linhas.map((l) =>
      tipo === "orcamento" ? { id: l.id, rotulo: `${l.nome} ${l.ano ?? ""}`.trim(), detalhe: "" } : { id: l.id, rotulo: l.nome, detalhe: l.ano ? String(l.ano) : "" },
    );
  }
  // O escopo de unidades da pessoa (o ADM e a "Geral" = todas; sem grupo/unidade = nenhuma).
  const { escopo: esc } = await unidadesDaSessao(u);
  const escopo = (col: typeof dfdProtocolos.reparticaoId | typeof dfds.reparticaoId) =>
    esc.tipo === "todas" ? undefined : esc.tipo === "nenhuma" ? sql`0 = 1` : or(sql`${col} IS NULL`, inArray(col, esc.ids.slice(0, 90)));
  if (tipo === "protocolo") {
    const linhas = await db
      .select({ id: dfdProtocolos.id, numero: dfdProtocolos.numero, idExterno: dfdProtocolos.idExterno, assunto: dfdProtocolos.assunto })
      .from(dfdProtocolos)
      .where(and(or(like(dfdProtocolos.numero, termo), like(dfdProtocolos.idExterno, termo), like(dfdProtocolos.assunto, termo)), escopo(dfdProtocolos.reparticaoId)))
      .orderBy(desc(dfdProtocolos.id))
      .limit(LIMITE);
    return linhas.map((l) => ({ id: l.id, rotulo: l.numero, detalhe: [l.idExterno ? `Id ${l.idExterno}` : "", l.assunto ?? ""].filter(Boolean).join(" · ") }));
  }
  const linhas = await db
    .select({ id: dfds.id, numero: dfds.numero, planejamento: dfds.planejamento, objeto: dfds.objeto })
    .from(dfds)
    .where(and(or(like(dfds.numero, termo), like(dfds.planejamento, termo), like(dfds.objeto, termo)), escopo(dfds.reparticaoId)))
    .orderBy(desc(dfds.id))
    .limit(LIMITE);
  return linhas.map((l) => ({ id: l.id, rotulo: `DFD ${l.numero}`, detalhe: [l.planejamento ? `Planej. ${l.planejamento}` : "", l.objeto ?? ""].filter(Boolean).join(" · ") }));
}

/** As tarefas LIGADAS a um alvo (protocolo/DFD/…) nos quadros que o usuário vê — o botão "Tarefas" dos banners da Mesa. */
export async function tarefasDoVinculo(u: UsuarioSessao, tipo: TipoVinculo, id: number) {
  const db = getDb();
  const grupoIds = u.role === "admin" ? null : (await gruposDoUsuario(u.id)).map((g) => g.id);
  if (grupoIds && !grupoIds.length) return [];
  return db
    .select({
      id: tarefas.id,
      ticket: tarefas.ticket,
      titulo: tarefas.titulo,
      prazo: tarefas.prazo,
      concluidaEm: tarefas.concluidaEm,
      arquivada: tarefas.arquivada,
      quadroId: tarefas.quadroId,
      quadroNome: tarefaQuadros.nome,
      quadroCor: tarefaQuadros.cor,
      listaNome: tarefaListas.nome,
    })
    .from(tarefaVinculos)
    .innerJoin(tarefas, eq(tarefas.id, tarefaVinculos.tarefaId))
    .innerJoin(tarefaQuadros, eq(tarefaQuadros.id, tarefas.quadroId))
    .innerJoin(tarefaListas, eq(tarefaListas.id, tarefas.listaId))
    .where(
      and(
        eq(tarefaVinculos.tipo, tipo),
        eq(tarefaVinculos.alvoId, id),
        eq(tarefas.template, false),
        eq(tarefaQuadros.arquivado, false),
        grupoIds ? inArray(tarefaQuadros.grupoId, grupoIds.slice(0, 90)) : undefined,
        quadroVisivel(u.id),
      ),
    )
    .orderBy(tarefas.arquivada, desc(tarefas.id))
    .limit(200);
}

/** O alvo do vínculo existe e o usuário o vê (protocolo/DFD no escopo de unidade dele; PCA/orçamento, globais). */
export async function vinculoAcessivel(u: UsuarioSessao, v: { tipo: TipoVinculo; id: number }): Promise<boolean> {
  const db = getDb();
  if (v.tipo === "tarefa") return (await tarefaAcessivel(u, v.id)) != null;
  if (v.tipo === "pca" || v.tipo === "orcamento") {
    const t = v.tipo === "pca" ? pcas : orcamentos;
    return (await db.select({ id: t.id }).from(t).where(eq(t.id, v.id))).length > 0;
  }
  const t = v.tipo === "protocolo" ? dfdProtocolos : dfds;
  const [r] = await db.select({ rep: t.reparticaoId }).from(t).where(eq(t.id, v.id));
  if (!r) return false;
  return (await unidadesDaSessao(u)).acessivel(r.rep);
}

// ─── Fase 3: avisos · recorrência · automações · modelos ─────────────────────────────────────────────────────

/** Avisa pessoas sobre UMA tarefa (sem o próprio autor). Nunca lança. */
export async function avisarSobreTarefa(
  u: UsuarioSessao,
  tipo: TipoNotificacao,
  destinos: number[],
  t: { id: number; ticket: number; titulo: string },
  quadro: { id: number; nome: string },
  titulo: string,
) {
  await notificar(
    destinos.map((usuarioId) => ({
      usuarioId,
      tipo,
      titulo,
      texto: `${rotuloTicket(t.ticket)} ${t.titulo} · ${quadro.nome}`,
      link: linkTarefa(quadro.id, t.id),
      tarefaId: t.id,
      quadroId: quadro.id,
      ...atorDe(u),
    })),
    u.id,
  );
}

/** "Tarefa atribuída a você" para os responsáveis NOVOS (os de `depois` que não estavam em `antes`). */
export async function avisarAtribuicao(u: UsuarioSessao, antes: number[], depois: number[], t: { id: number; ticket: number; titulo: string }, quadro: Quadro) {
  const novos = depois.filter((p) => !antes.includes(p));
  if (novos.length) await avisarSobreTarefa(u, "atribuida", novos, t, quadro, `${nomeExibicao(u)} atribuiu uma tarefa a você`);
}

/** O CONVITE a um evento (os convidados NOVOS) e a RESPOSTA (a quem criou) — no sino, com o link que abre o evento. */
export async function avisarConvite(u: UsuarioSessao, novos: number[], e: { id: number; titulo: string; data: string }, t: { id: number; ticket: number; titulo: string }, quadro: Quadro) {
  if (!novos.length) return;
  await notificar(
    novos.map((usuarioId) => ({
      usuarioId,
      tipo: "convite" as const,
      titulo: `${nomeExibicao(u)} convidou você: ${e.titulo}`,
      texto: `${dataBRCurta(e.data)} · ${rotuloTicket(t.ticket)} ${t.titulo} · ${quadro.nome}`,
      link: linkEvento(e.data, `e${e.id}`),
      tarefaId: t.id,
      quadroId: quadro.id,
      ...atorDe(u),
    })),
    u.id,
  );
}
export async function avisarResposta(u: UsuarioSessao, criadorId: number | null, resposta: RespostaConvite, e: { id: number; titulo: string; data: string }, t: { id: number }, quadroId: number) {
  if (!criadorId) return;
  const txt = resposta === "sim" ? "vai" : resposta === "nao" ? "não vai" : "talvez vá";
  await notificar(
    [{ usuarioId: criadorId, tipo: "resposta", titulo: `${nomeExibicao(u)} ${txt}: ${e.titulo}`, texto: dataBRCurta(e.data), link: linkEvento(e.data, `e${e.id}`), tarefaId: t.id, quadroId, ...atorDe(u) }],
    u.id,
  );
}
const dataBRCurta = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

/** As AUTOMAÇÕES do quadro (a de ação inválida some). */
export async function listarAutomacoes(quadroId: number): Promise<Automacao[]> {
  const linhas = await getDb().select().from(tarefaAutomacoes).where(eq(tarefaAutomacoes.quadroId, quadroId)).orderBy(asc(tarefaAutomacoes.id));
  return linhas.flatMap((l) => {
    const acao = lerAcaoAutomacao(l.acao);
    return acao && (GATILHOS as readonly string[]).includes(l.gatilho) ? [{ id: l.id, gatilho: l.gatilho as GatilhoAutomacao, listaId: l.listaId, acao, ativa: l.ativa }] : [];
  });
}

export async function getAutomacao(id: number) {
  const [a] = await getDb().select().from(tarefaAutomacoes).where(eq(tarefaAutomacoes.id, id));
  return a ?? null;
}

export async function criarAutomacao(quadroId: number, d: { gatilho: GatilhoAutomacao; listaId: number | null; acao: AcaoAutomacao }): Promise<number> {
  const [a] = await getDb()
    .insert(tarefaAutomacoes)
    .values({ quadroId, gatilho: d.gatilho, listaId: d.gatilho === "entrar_lista" ? d.listaId : null, acao: JSON.stringify(d.acao) })
    .returning({ id: tarefaAutomacoes.id });
  return a.id;
}

export async function atualizarAutomacao(id: number, ativa: boolean) {
  await getDb().update(tarefaAutomacoes).set({ ativa }).where(eq(tarefaAutomacoes.id, id));
}

export async function excluirAutomacao(id: number) {
  await getDb().delete(tarefaAutomacoes).where(eq(tarefaAutomacoes.id, id));
}

/** A ação de automação é válida NESTE quadro agora (a lista/etiqueta/pessoa ainda existe e é dele)? */
export async function acaoValida(quadro: Quadro, a: AcaoAutomacao): Promise<boolean> {
  if (a.tipo === "mover_lista") {
    const l = await getLista(a.listaId);
    return !!l && l.quadroId === quadro.id && !l.arquivada;
  }
  if (a.tipo === "etiquetar") return (await etiquetasDoQuadro(quadro.id, [a.etiquetaId])).length > 0;
  if (a.tipo === "atribuir") return pessoasValidas(quadro, [a.usuarioId]);
  return true;
}

/**
 * Depois que tarefas ENTRARAM numa lista (arrastar, trocar de lista, massa, criar) — ou foram CONCLUÍDAS no lugar
 * (`lista.id` null): roda as AUTOMAÇÕES do quadro
 * (profundidade 1 — uma ação não dispara outra regra) e, se terminaram CONCLUÍDAS, gera a PRÓXIMA ocorrência das
 * recorrentes. BEST-EFFORT: nunca derruba o movimento que já foi gravado. Devolve se mudou algo além do movimento
 * (a tela recarrega).
 */
export async function aposMovimento(u: UsuarioSessao, quadro: Quadro, todos: number[], lista: { id: number | null; concluida: boolean }): Promise<boolean> {
  // O TEMPLATE não é trabalho: nem automação nem recorrência.
  const ids = todos.length ? (await tarefasPorIds(todos)).filter((t) => !t.template).map((t) => t.id) : [];
  if (!ids.length) return false;
  let mudou = false;
  let concluida = lista.concluida;
  try {
    const acoes = automacoesDoEvento(await listarAutomacoes(quadro.id), { listaId: lista.id, concluida: lista.concluida });
    for (const a of acoes) {
      if (!(await acaoValida(quadro, a))) continue;
      const alvo = await tarefasPorIds(ids);
      if (a.tipo === "notificar") {
        for (const t of alvo) {
          const x = await getTarefa(t.id);
          if (x) await avisarSobreTarefa(u, "automacao", [...x.envolvidos, ...x.observadores], t, quadro, `Automação: tarefa ${concluida ? "concluída" : "movida"}`);
        }
        continue;
      }
      let destinoConcluida = false;
      if (a.tipo === "mover_lista") {
        destinoConcluida = (await getLista(a.listaId))?.concluida ?? false;
        concluida = destinoConcluida;
      }
      await aplicarMassaTarefas(
        ids,
        a.tipo === "mover_lista"
          ? { campo: "lista", listaId: a.listaId }
          : a.tipo === "atribuir"
            ? { campo: "responsavel", modo: "adicionar", usuarioId: a.usuarioId }
            : a.tipo === "etiquetar"
              ? { campo: "etiqueta", modo: "adicionar", etiquetaId: a.etiquetaId }
              : { campo: "prioridade", prioridade: a.prioridade },
        destinoConcluida,
      );
      mudou = true;
      for (const t of alvo) await registrarAuditoria({ usuario: u, acao: "editar", entidade: "tarefa", entidadeId: t.id, origem: "automacao", resumo: `Tarefa ${rotuloTicket(t.ticket)}: automação (${a.tipo})`, depois: a });
      if (a.tipo === "atribuir") for (const t of alvo) await avisarSobreTarefa(u, "atribuida", [a.usuarioId], t, quadro, "Uma automação atribuiu uma tarefa a você");
    }
    if (concluida && (await gerarRecorrentes(u, quadro, ids)) > 0) mudou = true;
  } catch (e) {
    console.error("pós-movimento das tarefas falhou", e);
  }
  return mudou;
}

/** Onde nasce a próxima ocorrência: na MESMA lista (concluída no lugar, lista comum ativa); senão, na 1ª aberta. */
async function listaDaProxima(atual: number, inicial: number): Promise<number> {
  const l = await getLista(atual);
  return l && !l.concluida && !l.arquivada ? l.id : inicial;
}

/**
 * Gera a PRÓXIMA ocorrência das tarefas RECORRENTES concluídas (na 1ª lista aberta do quadro, com os mesmos
 * responsáveis/observadores/etiquetas/vínculo e o checklist desmarcado). A anterior é ÚNICA no banco: concluir, reabrir e
 * concluir de novo nunca duplica. Devolve quantas nasceram.
 */
export async function gerarRecorrentes(u: UsuarioSessao, quadro: Quadro, ids: number[]): Promise<number> {
  const db = getDb();
  const candidatas = (
    await Promise.all(
      lotesDeIds(ids).map((l) =>
        db
          .select({ id: tarefas.id })
          .from(tarefas)
          .where(
            and(
              inArray(tarefas.id, l),
              eq(tarefas.template, false),
              sql`${tarefas.recorrencia} IS NOT NULL`,
              sql`${tarefas.concluidaEm} IS NOT NULL`,
              sql`NOT EXISTS (SELECT 1 FROM tarefas p WHERE p.recorrencia_anterior_id = ${tarefas.id})`,
            ),
          ),
      ),
    )
  ).flat();
  if (!candidatas.length) return 0;
  const [inicial] = await db
    .select({ id: tarefaListas.id })
    .from(tarefaListas)
    .where(and(eq(tarefaListas.quadroId, quadro.id), eq(tarefaListas.concluida, false), eq(tarefaListas.arquivada, false)))
    .orderBy(asc(tarefaListas.ordem), asc(tarefaListas.id))
    .limit(1);
  if (!inicial) return 0;
  const hoje = dataIsoBrasilia(new Date().toISOString());
  let n = 0;
  for (const { id } of candidatas) {
    const t = await getTarefa(id);
    const rec = t?.recorrencia;
    if (!t || !rec || !t.concluidaEm) continue;
    const { inicio, prazo } = proximaOcorrencia(rec, t, dataIsoBrasilia(t.concluidaEm) || hoje, hoje);
    const checklists = await checklistsParaCopiar(id);
    try {
      const nova = await criarTarefa({
        quadroId: quadro.id,
        // Concluída NO LUGAR (numa lista comum), a próxima nasce na MESMA lista; saindo de uma lista de concluídas, na 1ª aberta.
        listaId: await listaDaProxima(t.listaId, inicial.id),
        titulo: t.titulo,
        descricao: t.descricao,
        prioridade: t.prioridade,
        inicio,
        prazo,
        prazoHora: t.prazoHora,
        lembreteMin: t.lembreteMin,
        concluida: false,
        pessoas: t.pessoas,
        equipes: t.equipes,
        observadores: t.observadores,
        etiquetas: t.etiquetas,
        criadoPor: u.id,
        estimativaH: t.estimativaH,
        vinculos: t.vinculos.map((v) => ({ tipo: v.tipo, id: v.id })),
        recorrencia: rec,
        recorrenciaAnteriorId: id,
        checklists,
        blocos: t.blocos,
        campos: Object.entries(t.campos ?? {}).map(([c, v]) => ({ campoId: Number(c), valor: v })),
        tituloManual: t.tituloManual,
      });
      n++;
      await registrarAuditoria({
        usuario: u,
        acao: "criar",
        entidade: "tarefa",
        entidadeId: nova.id,
        origem: "recorrencia",
        resumo: `Tarefa ${rotuloTicket(nova.ticket)} "${t.titulo}" criada pela recorrência de ${rotuloTicket(t.ticket)} (prazo ${prazo})`,
      });
    } catch (e) {
      // Outra requisição já gerou a próxima (a anterior é ÚNICA) — nada a fazer. Qualquer outra falha fica registrada.
      if (!/UNIQUE/i.test(String((e as Error)?.message ?? e))) console.error("recorrência: falha ao gerar a próxima de", id, e);
    }
  }
  return n;
}

/**
 * As etiquetas, pessoas e equipes de uma tarefa num quadro de DESTINO: no MESMO quadro, as mesmas; em outro, as etiquetas
 * pelo NOME (as que faltam são criadas), só as pessoas do GRUPO do destino e as equipes de mesmo nome.
 */
async function vinculosNoDestino(t: TarefaCompleta, origem: Quadro, destino: Quadro) {
  if (origem.id === destino.id) return { etiquetas: t.etiquetas, novasEtiquetas: [], pessoas: t.pessoas, observadores: t.observadores, equipes: t.equipes };
  const [etO, etD, eqO, eqD, membros] = await Promise.all([
    etiquetasDoQuadroTodas(origem.id),
    etiquetasDoQuadroTodas(destino.id),
    listarEquipes([origem.id]),
    listarEquipes([destino.id]),
    origem.grupoId === destino.grupoId && !soDoDono(destino) ? null : pessoasDoQuadro(destino),
  ]);
  const { ids, criar } = mapearEtiquetas(
    etO.filter((e) => t.etiquetas.includes(e.id)),
    etD,
  );
  const noGrupo = membros ? new Set(membros.map((p) => p.id)) : null;
  const fica = (u: number) => !noGrupo || noGrupo.has(u);
  return {
    etiquetas: ids,
    novasEtiquetas: criar,
    pessoas: t.pessoas.filter(fica),
    observadores: t.observadores.filter(fica),
    equipes: mapearPorNome(
      eqO.filter((e) => t.equipes.includes(e.id)),
      eqD,
    ),
  };
}

/**
 * COPIA a tarefa para a lista dada (deste ou de outro quadro) — também "Criar template" (`template`) e "Criar a partir do
 * template". Vão sempre título (ou o dado), descrição, prioridade, estimativa, recorrência, vínculo e blocos; checklists
 * (desmarcados), etiquetas, pessoas/equipes e datas conforme as opções. Comentários, eventos e histórico ficam na origem.
 */
export async function copiarTarefa(
  u: UsuarioSessao,
  r: { tarefa: TarefaCompleta; quadro: Quadro },
  destino: Quadro,
  lista: { id: number; concluida: boolean },
  o: OpcoesCopia & { titulo?: string; noInicio?: boolean; template?: boolean },
): Promise<{ id: number; ticket: number }> {
  const t = r.tarefa;
  const [v, checklists, campos] = await Promise.all([
    vinculosNoDestino(t, r.quadro, destino),
    o.checklists ? checklistsParaCopiar(t.id) : Promise.resolve([]),
    camposNoDestino(t, r.quadro, destino),
  ]);
  const nova = await criarTarefa({
    quadroId: destino.id,
    listaId: lista.id,
    titulo: o.titulo?.trim() || t.titulo,
    descricao: t.descricao,
    prioridade: t.prioridade,
    inicio: o.datas ? t.inicio : null,
    prazo: o.datas ? t.prazo : null,
    prazoHora: o.datas ? t.prazoHora : null,
    lembreteMin: o.datas ? t.lembreteMin : null,
    concluida: lista.concluida && !o.template,
    pessoas: o.pessoas ? v.pessoas : [],
    observadores: o.pessoas ? v.observadores : [],
    equipes: o.pessoas ? v.equipes : [],
    etiquetas: o.etiquetas ? v.etiquetas : [],
    novasEtiquetas: o.etiquetas ? v.novasEtiquetas : [],
    criadoPor: u.id,
    estimativaH: t.estimativaH,
    vinculos: t.vinculos.map((v) => ({ tipo: v.tipo, id: v.id })),
    recorrencia: t.recorrencia,
    checklists,
    blocos: t.blocos,
    template: o.template ?? false,
    copiadaDe: t.id,
    noInicio: o.noInicio,
    campos,
    // Um título dado na cópia é escolha da pessoa; senão, segue como era na origem.
    tituloManual: o.titulo?.trim() ? true : t.tituloManual,
  });
  // A CAPA colorida vai junto (não é dado do lote de criação).
  if (t.capa) await getDb().update(tarefas).set({ capa: t.capa }).where(eq(tarefas.id, nova.id));
  return nova;
}

/** Até quantos TEMPLATES um quadro novo copia de outro. */
const MAX_TEMPLATES_COPIA = 30;

/**
 * Copia os TEMPLATES ativos de `origem` para a lista "TEMPLATES" de `destino` (criada como a 1ª lista, se não existir) —
 * o quadro do mês seguinte nasce com os mesmos templates. Devolve quantos vieram.
 */
export async function copiarTemplatesDe(u: UsuarioSessao, origem: Quadro, destino: Quadro): Promise<number> {
  const ids = (
    await getDb()
      .select({ id: tarefas.id })
      .from(tarefas)
      .where(and(eq(tarefas.quadroId, origem.id), eq(tarefas.template, true), eq(tarefas.arquivada, false)))
      .orderBy(asc(tarefas.ordem), asc(tarefas.id))
      .limit(MAX_TEMPLATES_COPIA)
  ).map((x) => x.id);
  if (!ids.length) return 0;
  const listas = await listasDoQuadro(destino.id);
  let lista = listaDeTemplates(listas, 0);
  if (!lista) {
    lista = await criarLista(destino.id, { nome: "TEMPLATES" });
    await ordenarListas(destino.id, [lista, ...listas.map((l) => l.id)]);
  }
  let n = 0;
  for (const id of ids) {
    const tarefa = await getTarefa(id);
    if (!tarefa) continue;
    await copiarTarefa(u, { tarefa, quadro: origem }, destino, { id: lista, concluida: false }, { ...OPCOES_COPIA_PADRAO, datas: false, template: true });
    n++;
  }
  return n;
}

/** MOVE a tarefa para OUTRO quadro (ticket novo do destino; checklists, comentários, eventos e histórico vão junto). */
export async function moverTarefaDeQuadro(r: { tarefa: TarefaCompleta; quadro: Quadro }, destino: Quadro, lista: { id: number; concluida: boolean }): Promise<{ id: number; ticket: number }> {
  const [v, campos] = await Promise.all([vinculosNoDestino(r.tarefa, r.quadro, destino), camposNoDestino(r.tarefa, r.quadro, destino)]);
  const db = getDb();
  const res = await db.batch(
    comandosMoverQuadro(db, {
      id: r.tarefa.id,
      quadroId: destino.id,
      listaId: lista.id,
      concluida: lista.concluida && !r.tarefa.template,
      etiquetas: v.etiquetas,
      novasEtiquetas: v.novasEtiquetas,
      pessoas: [...v.pessoas, ...v.observadores],
      equipes: v.equipes,
      campos,
    }),
  );
  const [x] = res[res.length - 1] as { id: number; ticket: number }[];
  return x;
}

/** Os QUADROS de destino de copiar/mover: os ativos que o usuário vê, com as listas ativas (e o grupo). */
export async function destinosDeTarefa(u: UsuarioSessao) {
  const grupoIds = u.role === "admin" ? null : (await gruposDoUsuario(u.id)).map((g) => g.id);
  if (grupoIds && !grupoIds.length) return [];
  const db = getDb();
  const qs = await db
    .select({ id: tarefaQuadros.id, nome: tarefaQuadros.nome, cor: tarefaQuadros.cor, grupoNome: grupos.nome })
    .from(tarefaQuadros)
    .innerJoin(grupos, eq(grupos.id, tarefaQuadros.grupoId))
    .where(and(eq(tarefaQuadros.arquivado, false), grupoIds ? inArray(tarefaQuadros.grupoId, grupoIds.slice(0, 90)) : undefined, quadroVisivel(u.id)))
    .orderBy(asc(tarefaQuadros.nome));
  const listas = (
    await Promise.all(
      lotesDeIds(qs.map((q) => q.id)).map((l) =>
        db
          .select({ id: tarefaListas.id, quadroId: tarefaListas.quadroId, nome: tarefaListas.nome, concluida: tarefaListas.concluida })
          .from(tarefaListas)
          .where(and(inArray(tarefaListas.quadroId, l), eq(tarefaListas.arquivada, false)))
          .orderBy(asc(tarefaListas.ordem), asc(tarefaListas.id)),
      ),
    )
  ).flat();
  return qs.map((q) => ({ ...q, listas: listas.filter((l) => l.quadroId === q.id).map(({ quadroId: _, ...l }) => l) }));
}
export type DestinoTarefa = Awaited<ReturnType<typeof destinosDeTarefa>>[number];

const lerConteudo = (v: string) => {
  try {
    return JSON.parse(v) as unknown;
  } catch {
    return {};
  }
};

/** Os MODELOS DE QUADRO dos grupos dados (`null` = todos — o ADM). */
export async function listarModelosQuadro(grupoIds: number[] | null): Promise<(ModeloResumo & { conteudo: ModeloQuadro })[]> {
  if (grupoIds && !grupoIds.length) return [];
  const linhas = await getDb()
    .select()
    .from(tarefaModelos)
    .where(and(eq(tarefaModelos.tipo, "quadro"), grupoIds ? inArray(tarefaModelos.grupoId, grupoIds.slice(0, 90)) : undefined))
    .orderBy(asc(tarefaModelos.nome));
  return linhas.map((m) => ({ id: m.id, tipo: "quadro", nome: m.nome, grupoId: m.grupoId, quadroId: m.quadroId, criadoPor: m.criadoPor, conteudo: modeloQuadroDe(m) }));
}

/** O conteúdo de um modelo de QUADRO gravado, já validado. */
export const modeloQuadroDe = (m: { conteudo: string }) => coerceModeloQuadro(lerConteudo(m.conteudo));

export async function getModelo(id: number) {
  const [m] = await getDb().select().from(tarefaModelos).where(eq(tarefaModelos.id, id));
  return m ?? null;
}

export async function criarModelo(d: { tipo: "quadro"; nome: string; grupoId: number | null; quadroId: number | null; conteudo: ModeloQuadro; criadoPor: number }): Promise<number> {
  const [m] = await getDb()
    .insert(tarefaModelos)
    .values({ ...d, conteudo: JSON.stringify(d.conteudo) })
    .returning({ id: tarefaModelos.id });
  return m.id;
}

export async function excluirModelo(id: number) {
  await getDb().delete(tarefaModelos).where(eq(tarefaModelos.id, id));
}

/** O RETRATO do quadro como modelo: as listas ativas (na ordem) e as etiquetas, a cor e a descrição. */
export async function modeloDoQuadro(q: Quadro): Promise<ModeloQuadro> {
  const { listas, etiquetas } = await dadosQuadro(q.id);
  return coerceModeloQuadro({
    cor: q.cor,
    descricao: q.descricao,
    listas: listas.filter((l) => !l.arquivada),
    etiquetas: etiquetas.map((e) => ({ nome: e.nome, cor: e.cor })),
  });
}

/** CRIA um quadro a partir de um modelo (listas + etiquetas num lote atômico). */
export async function criarQuadroDoModelo(grupoId: number, d: { nome: string; cor?: string; descricao?: string | null }, m: ModeloQuadro, usuarioId: number): Promise<number> {
  const db = getDb();
  const r = await db.batch(
    comandosCriarQuadroDoModelo(db, { grupoId, nome: d.nome, cor: d.cor ?? m.cor ?? "#6366f1", descricao: d.descricao ?? m.descricao ?? null, criadoPor: usuarioId }, m),
  );
  const [q] = r[r.length - 1] as { id: number }[];
  return q.id;
}

/** Um resultado da BUSCA do calendário (em todos os meses): o link abre o evento/tarefa no mês dele. */
export type ResultadoBuscaCalendario = { tipo: "evento" | "tarefa"; chave: string; titulo: string; data: string; hora: string | null; local: string | null; quadroId: number; ticket: number; repete: boolean };

/**
 * BUSCA do calendário em TODOS os meses (título, local e descrição dos eventos; título e #ticket das tarefas com prazo)
 * nos quadros da pessoa. O evento PRIVADO de quem não participa (nem criou nem foi convidado) não entra — a busca não pode
 * revelar o que o "Ocupado" esconde. A série aparece na PRÓXIMA ocorrência (a partir de hoje; senão a 1ª).
 */
export async function buscarNoCalendario(quadroIds: number[], termo: string, usuarioId: number, hoje: string): Promise<ResultadoBuscaCalendario[]> {
  const q = termo.trim().slice(0, 80);
  if (!quadroIds.length || q.length < 2) return [];
  const partes = await porLotesDeQuadros(quadroIds, (ids) => buscarNoLote(ids, q, usuarioId, hoje));
  // Os de hoje em diante primeiro (o mais próximo antes); depois os passados (o mais recente antes).
  return partes
    .sort((a, b) => ((a.data >= hoje) !== (b.data >= hoje) ? (a.data >= hoje ? -1 : 1) : a.data >= hoje ? a.data.localeCompare(b.data) : b.data.localeCompare(a.data)))
    .slice(0, 50);
}
async function buscarNoLote(ids: number[], q: string, usuarioId: number, hoje: string): Promise<ResultadoBuscaCalendario[]> {
  const db = getDb();
  const padrao = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const likeEsc = (col: Parameters<typeof like>[0]) => sql`${col} LIKE ${padrao} ESCAPE '\\'`;
  const ticket = /^#?\d{1,7}$/.test(q) ? Number(q.replace("#", "")) : null;
  const [evs, tfs] = await Promise.all([
    db
      .select({ id: tarefaEventos.id, titulo: tarefaEventos.titulo, data: tarefaEventos.data, dataFim: tarefaEventos.dataFim, horaInicio: tarefaEventos.horaInicio, local: tarefaEventos.local, recorrencia: tarefaEventos.recorrencia, quadroId: tarefas.quadroId, ticket: tarefas.ticket })
      .from(tarefaEventos)
      .innerJoin(tarefas, eq(tarefas.id, tarefaEventos.tarefaId))
      .where(
        and(
          inArray(tarefas.quadroId, ids),
          eq(tarefas.arquivada, false),
          eq(tarefas.template, false),
          listaAtiva,
          or(likeEsc(tarefaEventos.titulo), likeEsc(tarefaEventos.local), likeEsc(tarefaEventos.descricao)),
          // O privado só para quem PARTICIPA (a mesma régua de `participaDoEvento`): quem criou, os convidados e os
          // envolvidos da tarefa (responsáveis + equipes).
          or(
            eq(tarefaEventos.privado, false),
            eq(tarefaEventos.criadoPor, usuarioId),
            sql`EXISTS (SELECT 1 FROM tarefa_evento_convidados c WHERE c.evento_id = ${tarefaEventos.id} AND c.usuario_id = ${usuarioId})`,
            pessoaNaTarefa(usuarioId),
          ),
        ),
      )
      .orderBy(desc(tarefaEventos.data))
      .limit(40),
    db
      .select({ id: tarefas.id, titulo: tarefas.titulo, prazo: tarefas.prazo, quadroId: tarefas.quadroId, ticket: tarefas.ticket })
      .from(tarefas)
      .where(and(inArray(tarefas.quadroId, ids), eq(tarefas.arquivada, false), eq(tarefas.template, false), listaAtiva, sql`${tarefas.prazo} IS NOT NULL`, or(likeEsc(tarefas.titulo), ticket != null ? eq(tarefas.ticket, ticket) : undefined)))
      .orderBy(desc(tarefas.prazo))
      .limit(40),
  ]);
  const out: ResultadoBuscaCalendario[] = evs.map((e) => {
    const rec = lerRecorrenciaEvento(e.recorrencia);
    const d = rec ? (ocorrenciasDoEvento({ data: e.data, dataFim: e.dataFim, recorrencia: rec }, hoje > e.data ? hoje : e.data, somarDias(hoje, 3650), 1)[0] ?? e.data) : e.data;
    return { tipo: "evento", chave: d === e.data ? `e${e.id}` : `e${e.id}:${d}`, titulo: e.titulo, data: d, hora: e.horaInicio, local: e.local, quadroId: e.quadroId, ticket: e.ticket, repete: !!rec };
  });
  for (const t of tfs) if (t.prazo) out.push({ tipo: "tarefa", chave: `p${t.id}`, titulo: t.titulo, data: t.prazo, hora: null, local: null, quadroId: t.quadroId, ticket: t.ticket, repete: false });
  return out;
}

// ─── IMPORTAR DO TRELLO (F9) ──────────────────────────────────────────────────────────────────────────────

const nomeChave = (s: string) => s.trim().toLocaleLowerCase("pt-BR");

/**
 * A ESTRUTURA da importação: tira as listas VAZIAS do quadro (se pedido — o quadro novo nasce com 3), cria as listas do
 * Trello no fim (a arquivada, arquivada) e as ETIQUETAS (as de mesmo nome já no quadro são reusadas). Devolve os mapas
 * chave do Trello → id daqui.
 */
export async function importarEstrutura(
  quadroId: number,
  d: { listas: { chave: string; nome: string; arquivada: boolean }[]; etiquetas: { chave: string; nome: string; cor: string }[]; limparVazias: boolean },
): Promise<{ listas: Record<string, number>; etiquetas: Record<string, number> }> {
  const db = getDb();
  if (d.limparVazias)
    await db
      .delete(tarefaListas)
      .where(and(eq(tarefaListas.quadroId, quadroId), sql`NOT EXISTS (SELECT 1 FROM tarefas t WHERE t.lista_id = ${tarefaListas.id})`));
  const listas: Record<string, number> = {};
  for (const l of d.listas) {
    const id = await criarLista(quadroId, { nome: l.nome });
    if (l.arquivada) await atualizarLista(id, { arquivada: true });
    listas[l.chave] = id;
  }
  const existentes = new Map((await etiquetasDoQuadroTodas(quadroId)).map((e) => [nomeChave(e.nome), e.id]));
  const etiquetas: Record<string, number> = {};
  for (const e of d.etiquetas) {
    const ja = existentes.get(nomeChave(e.nome));
    const id = ja ?? (await criarEtiqueta(quadroId, { nome: e.nome, cor: e.cor }));
    existentes.set(nomeChave(e.nome), id);
    etiquetas[e.chave] = id;
  }
  return { listas, etiquetas };
}

/**
 * Os CARTÕES da importação (um lote atômico por cartão: a tarefa + checklists + comentários com o autor e a data do
 * Trello). Para no 1º erro e devolve o que já entrou (`ids`) + a falha — a tela retoma dali.
 */
export async function importarCartoes(u: UsuarioSessao, quadroId: number, cartoes: CartaoImportado[]): Promise<{ ids: Record<string, number>; falha: { chave: string; erro: string } | null }> {
  const db = getDb();
  const ids: Record<string, number> = {};
  for (const c of cartoes) {
    try {
      const comandos = comandosCriarTarefa(db, {
        quadroId,
        listaId: c.listaId,
        titulo: c.titulo,
        descricao: c.descricao || null,
        prioridade: "media",
        inicio: c.inicio,
        prazo: c.prazo,
        prazoHora: c.prazoHora,
        concluida: c.concluida,
        arquivada: c.arquivada,
        template: c.template,
        pessoas: c.pessoas,
        etiquetas: c.etiquetas,
        criadoPor: u.id,
        checklists: c.checklists,
        blocos: c.links.length ? c.links.map((l, i) => ({ id: `l${i + 1}`, tipo: "link" as const, url: l.url, titulo: l.titulo })) : null,
        tituloManual: true,
      });
      const r = await db.batch(comandos);
      const [nova] = r[r.length - 1] as { id: number }[];
      const coment = comandosComentariosImportados(db, nova.id, c.comentarios);
      if (coment.length) await db.batch(coment as [(typeof coment)[number], ...typeof coment]);
      ids[c.chave] = nova.id;
    } catch (e) {
      return { ids, falha: { chave: c.chave, erro: (e as Error)?.message ?? String(e) } };
    }
  }
  return { ids, falha: null };
}

/** Os VÍNCULOS tarefa ↔ tarefa da importação — só entre tarefas DESTE quadro; o par repetido (ou o inverso) entra uma vez. */
export async function importarVinculos(quadroId: number, pares: { de: number; para: number }[]): Promise<number> {
  const db = getDb();
  const todos = [...new Set(pares.flatMap((p) => [p.de, p.para]))];
  const doQuadro = new Set(
    (
      await Promise.all(lotesDeIds(todos).map((l) => db.select({ id: tarefas.id }).from(tarefas).where(and(eq(tarefas.quadroId, quadroId), inArray(tarefas.id, l)))))
    )
      .flat()
      .map((x) => x.id),
  );
  const vistos = new Set<string>();
  const validos = pares.filter((p) => {
    const k = [Math.min(p.de, p.para), Math.max(p.de, p.para)].join(":");
    if (p.de === p.para || !doQuadro.has(p.de) || !doQuadro.has(p.para) || vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
  if (!validos.length) return 0;
  const cmds = validos.map((p) => db.insert(tarefaVinculos).values({ tarefaId: p.de, tipo: "tarefa", alvoId: p.para }).onConflictDoNothing());
  for (let i = 0; i < cmds.length; i += 50) {
    const l = cmds.slice(i, i + 50);
    await db.batch(l as [(typeof l)[number], ...typeof l]);
  }
  return validos.length;
}
