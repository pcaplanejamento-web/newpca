import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import { notificacoes, preferenciasTabela, tarefaChecklist, tarefaEventos, tarefaQuadros, tarefas, usuarios } from "@/db/schema";
import { type GrupoAcesso, gruposComAbas } from "./acesso";
import type { UsuarioSessao } from "./auth";
import { LEMBRETE_MAX_MIN, lembreteDaTarefa, lembreteDevido, notificacaoDeLembrete } from "./calendario-core";
import { getDb } from "./db";
import { enviarPendentesDepois } from "./email";
import { dataIsoBrasilia } from "./format";
import { podeNaTela, telasAbertas } from "./papeis-core";
import { nomeExibicao, urlFoto } from "./pessoa";
import { avisoVersaoExtensao } from "./automacao-centi-core";
import { avisoNovaVersao, mudancasVisiveis, VERSOES } from "./versoes";
import { lerRecorrenciaEvento, notificacaoDePrazo, notificacaoDePrazoItem, ocorrenciasDoEvento, somarDias, type TipoNotificacao, TIPOS_NOTIFICACAO } from "./tarefas-core";
import { comandosNotificacoes, pessoaNaTarefa, quadroVisivel, type NovaNotificacao } from "./tarefas-sql";
import { agendarAoVivo, avisarAoVivo } from "./notificacoes-ao-vivo";
import { getConfigNotificacoes } from "./notificacoes-config";
import { CHAVE_PREF_PESSOA, emailAposPara, sqlUtc, lerPrefsEmail, lerPrefsPessoa, noSino, type PrefsEmail, type PrefsPessoa, querEmail, silenciado } from "./notificacoes-config-core";
import { CHAVE_PREF_EMAIL } from "./email-core";
import { type AlvoLeitura, type AlvoLimpeza, comandoMarcarLidas, comandosExcluirNotificacoes, consultaDispensadas } from "./notificacoes-sql";

/**
 * NOTIFICAÇÕES do sino (migrações `0044`/`0083`) — acesso ao D1 (só escopo de request). As de EVENTO (atribuída, menção,
 * comentário, automação, protocolo…) são gravadas por `notificar` (BEST-EFFORT: nunca derruba a ação que as gerou; nunca
 * avisa o próprio autor; o ADM decide em Configurações → Notificações se o aviso existe no sino e se vai por e-mail) e
 * chegam AO VIVO às abas abertas da pessoa. As de PRAZO (vence hoje/amanhã, atrasada) e os LEMBRETES são DERIVADOS: a
 * leitura do sino (no máximo a cada `INTERVALO_DERIVAR`) e o cron criam as linhas com uma CHAVE única (tarefa + prazo;
 * evento + início + antecedência) — o "lida" persiste, nada repete e o que a pessoa LIMPOU fica dispensado (não volta).
 */

export type Notificacao = {
  id: number;
  tipo: TipoNotificacao;
  /** A tarefa e o quadro do aviso (AGRUPAR os repetidos; silenciar a tarefa/o quadro). */
  tarefaId: number | null;
  quadroId: number | null;
  titulo: string;
  texto: string | null;
  link: string | null;
  lida: boolean;
  /** Marcada como NÃO lida pela pessoa: ver não a marca como lida. */
  travada: boolean;
  criadoEm: string | null;
  ator: { id: number; nome: string; foto: string | null } | null;
};

/**
 * GRAVA os avisos (a config do ADM: o desligado no sino não existe; o sem e-mail já nasce tratado) num lote só e avisa
 * AO VIVO quem recebeu; o e-mail sai DEPOIS da resposta. Devolve as pessoas que receberam algo novo. Nunca lança.
 */
async function gravarAvisos(linhas: NovaNotificacao[]): Promise<number[]> {
  if (!linhas.length) return [];
  try {
    const cfg = await getConfigNotificacoes();
    const doSino = linhas.filter((n) => noSino(cfg, n.tipo));
    if (!doSino.length) return [];
    // As escolhas de CADA destinatário (uma consulta): o silenciado não entra; o e-mail que ele não quer já nasce tratado;
    // o do resumo/silêncio espera o horário dele.
    const prefs = await preferenciasDe([...new Set(doSino.map((n) => n.usuarioId))]);
    const agora = Date.now();
    const validas = doSino.flatMap((n) => {
      const p = prefs.get(n.usuarioId);
      if (p && silenciado(p.pessoa, n)) return [];
      const canal = cfg[n.tipo];
      const email = p?.email ?? lerPrefsEmail(null);
      const querMail = querEmail(cfg, email, n.tipo);
      return [{ ...n, semEmail: !querMail, emailApos: querMail ? emailAposPara(email, agora, !canal.desligavel) : null }];
    });
    if (!validas.length) return [];
    const db = getDb();
    const cmds = comandosNotificacoes(db, validas);
    const res = (await db.batch(cmds as [(typeof cmds)[number], ...(typeof cmds)[number][]])) as { usuarioId: number }[][];
    const quem = [...new Set(res.flat().map((r) => r.usuarioId))];
    if (quem.length) {
      avisarAoVivo(quem);
      if (validas.some((n) => !n.semEmail)) enviarPendentesDepois();
    }
    return quem;
  } catch (e) {
    console.error("gravar avisos falhou", e);
    return [];
  }
}

/** As preferências de notificação (e-mail + sino) de várias pessoas — uma consulta; a sem preferência = o padrão. */
export async function preferenciasDe(ids: number[]): Promise<Map<number, { email: PrefsEmail; pessoa: PrefsPessoa }>> {
  const m = new Map<number, { email: PrefsEmail; pessoa: PrefsPessoa }>();
  if (!ids.length) return m;
  const linhas = await getDb()
    .select({ u: preferenciasTabela.usuarioId, chave: preferenciasTabela.chave, valor: preferenciasTabela.valor })
    .from(preferenciasTabela)
    .where(and(sql`${preferenciasTabela.usuarioId} IN (SELECT value FROM json_each(${JSON.stringify(ids)}))`, inArray(preferenciasTabela.chave, [CHAVE_PREF_EMAIL, CHAVE_PREF_PESSOA])));
  for (const id of ids) m.set(id, { email: lerPrefsEmail(null), pessoa: lerPrefsPessoa(null) });
  for (const l of linhas) {
    let v: unknown = null;
    try {
      v = JSON.parse(l.valor);
    } catch {
      /* corrompida = padrão */
    }
    const atual = m.get(l.u);
    if (!atual) continue;
    if (l.chave === CHAVE_PREF_EMAIL) atual.email = lerPrefsEmail(v);
    else atual.pessoa = lerPrefsPessoa(v);
  }
  return m;
}

/** Grava as notificações de um evento (sem o próprio ator, sem repetir a pessoa). Nunca lança. */
export async function notificar(linhas: NovaNotificacao[], atorId?: number | null): Promise<void> {
  const vistos = new Set<string>();
  const validas = linhas.filter((n) => {
    const k = `${n.usuarioId}|${n.tipo}|${n.tarefaId ?? ""}`;
    if (n.usuarioId === atorId || vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
  await gravarAvisos(validas);
}

/** O autor (snapshot) de uma notificação de evento. */
export const atorDe = (u: UsuarioSessao) => ({ atorId: u.id, atorNome: nomeExibicao(u) });

/** A lista da tarefa não está arquivada (a tarefa de lista arquivada não avisa). */
const listaAtiva = sql`EXISTS (SELECT 1 FROM tarefa_listas l WHERE l.id = ${tarefas.listaId} AND l.arquivada = 0)`;

/**
 * DERIVA as notificações de PRAZO da pessoa (tarefas abertas em que é responsável, nos quadros dos grupos dela — o ADM,
 * todos; prazo entre 30 dias atrás e amanhã) e grava as que faltam (a chave repetida é ignorada). Nunca lança.
 */
async function derivarPrazos(u: UsuarioSessao, grupoIds: number[] | null): Promise<NovaNotificacao[]> {
  if (grupoIds && !grupoIds.length) return [];
  try {
    const db = getDb();
    const hoje = dataIsoBrasilia(new Date().toISOString());
    const linhas = await db
      .select({ id: tarefas.id, ticket: tarefas.ticket, titulo: tarefas.titulo, prazo: tarefas.prazo, quadroId: tarefas.quadroId, quadroNome: tarefaQuadros.nome })
      .from(tarefas)
      .innerJoin(tarefaQuadros, eq(tarefaQuadros.id, tarefas.quadroId))
      .where(
        and(
          pessoaNaTarefa(u.id),
          isNull(tarefas.concluidaEm),
          eq(tarefas.arquivada, false),
          eq(tarefas.template, false),
          eq(tarefaQuadros.arquivado, false),
          listaAtiva,
          gte(tarefas.prazo, somarDias(hoje, -30)),
          lte(tarefas.prazo, somarDias(hoje, 1)),
          grupoIds ? inArray(tarefaQuadros.grupoId, grupoIds.slice(0, 90)) : undefined,
          quadroVisivel(u.id),
        ),
      )
      .orderBy(desc(tarefas.prazo))
      .limit(200);
    const novas: NovaNotificacao[] = [];
    for (const t of linhas) {
      const n = notificacaoDePrazo(t, hoje);
      if (n) novas.push({ usuarioId: u.id, ...n, tarefaId: t.id, quadroId: t.quadroId });
    }
    // Os ITENS de checklist com prazo em que a pessoa é a RESPONSÁVEL (não marcados, tarefa aberta).
    const itens = await db
      .select({
        itemId: tarefaChecklist.id,
        texto: tarefaChecklist.texto,
        prazo: tarefaChecklist.prazo,
        tarefaId: tarefas.id,
        ticket: tarefas.ticket,
        titulo: tarefas.titulo,
        quadroId: tarefas.quadroId,
      })
      .from(tarefaChecklist)
      .innerJoin(tarefas, eq(tarefas.id, tarefaChecklist.tarefaId))
      .innerJoin(tarefaQuadros, eq(tarefaQuadros.id, tarefas.quadroId))
      .where(
        and(
          eq(tarefaChecklist.responsavelId, u.id),
          eq(tarefaChecklist.feito, false),
          isNull(tarefas.concluidaEm),
          eq(tarefas.arquivada, false),
          eq(tarefas.template, false),
          eq(tarefaQuadros.arquivado, false),
          listaAtiva,
          gte(tarefaChecklist.prazo, somarDias(hoje, -30)),
          lte(tarefaChecklist.prazo, somarDias(hoje, 1)),
          grupoIds ? inArray(tarefaQuadros.grupoId, grupoIds.slice(0, 90)) : undefined,
          quadroVisivel(u.id),
        ),
      )
      .orderBy(desc(tarefaChecklist.prazo))
      .limit(200);
    for (const i of itens) {
      const n = notificacaoDePrazoItem(i, hoje);
      if (n) novas.push({ usuarioId: u.id, ...n, tarefaId: i.tarefaId, quadroId: i.quadroId });
    }
    return novas;
  } catch (e) {
    console.error("derivar prazos falhou", e);
    return [];
  }
}

/** "AAAA-MM-DDTHH:MM" de agora em Brasília. */
function agoraBrasilia(): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour === "24" ? "00" : p.hour}:${p.minute}`;
}

/**
 * DERIVA os LEMBRETES devidos dos EVENTOS em que a pessoa está (responsável/observadora da tarefa ou quem criou o
 * evento), nos quadros dos grupos dela (o ADM, todos) — eventos de hoje até 1 semana à frente (o maior lembrete). Nunca
 * lança.
 */
async function derivarLembretes(u: UsuarioSessao, grupoIds: number[] | null): Promise<NovaNotificacao[]> {
  if (grupoIds && !grupoIds.length) return [];
  try {
    const db = getDb();
    const agora = agoraBrasilia();
    const hoje = agora.slice(0, 10);
    const ate = somarDias(hoje, Math.ceil(LEMBRETE_MAX_MIN / 1440) + 1);
    const linhas = await db
      .select({
        id: tarefaEventos.id,
        titulo: tarefaEventos.titulo,
        data: tarefaEventos.data,
        diaInteiro: tarefaEventos.diaInteiro,
        horaInicio: tarefaEventos.horaInicio,
        horaFim: tarefaEventos.horaFim,
        lembreteMin: tarefaEventos.lembreteMin,
        local: tarefaEventos.local,
        dataFim: tarefaEventos.dataFim,
        recorrencia: tarefaEventos.recorrencia,
        tarefaId: tarefas.id,
        ticket: tarefas.ticket,
        tarefaTitulo: tarefas.titulo,
        quadroId: tarefas.quadroId,
      })
      .from(tarefaEventos)
      .innerJoin(tarefas, eq(tarefas.id, tarefaEventos.tarefaId))
      .innerJoin(tarefaQuadros, eq(tarefaQuadros.id, tarefas.quadroId))
      .where(
        and(
          sql`${tarefaEventos.lembreteMin} IS NOT NULL`,
          lte(tarefaEventos.data, ate),
          // O evento de hoje em diante — ou a SÉRIE (repetição) que ainda não terminou.
          sql`(${tarefaEventos.data} >= ${hoje} OR (${tarefaEventos.recorrencia} IS NOT NULL AND COALESCE(json_extract(${tarefaEventos.recorrencia}, '$.ate'), '9999-12-31') >= ${hoje}))`,
          // O evento de tarefa CONCLUÍDA não lembra mais.
          isNull(tarefas.concluidaEm),
          eq(tarefas.arquivada, false),
          eq(tarefas.template, false),
          eq(tarefaQuadros.arquivado, false),
          listaAtiva,
          grupoIds ? inArray(tarefaQuadros.grupoId, grupoIds.slice(0, 90)) : undefined,
          quadroVisivel(u.id),
          // Quem criou, os convidados que não recusaram e os envolvidos da tarefa (responsáveis + equipes) — o
          // OBSERVADOR só no evento NÃO privado (o privado é só de quem participa: `participaDoEvento`).
          sql`(${tarefaEventos.criadoPor} = ${u.id} OR ${pessoaNaTarefa(u.id)} OR (${tarefaEventos.privado} = 0 AND ${pessoaNaTarefa(u.id, true)}) OR EXISTS (SELECT 1 FROM tarefa_evento_convidados c WHERE c.evento_id = ${tarefaEventos.id} AND c.usuario_id = ${u.id} AND c.resposta <> 'nao'))`,
        ),
      )
      .orderBy(asc(tarefaEventos.data))
      .limit(200);
    const novas: NovaNotificacao[] = [];
    for (const e of linhas)
      // Cada OCORRÊNCIA da janela (a série repete o lembrete).
      for (const data of ocorrenciasDoEvento({ data: e.data, dataFim: e.dataFim, recorrencia: lerRecorrenciaEvento(e.recorrencia) }, hoje, ate, 20)) {
        const oc = { ...e, data, serieInicio: e.data };
        if (lembreteDevido(oc, agora)) novas.push({ usuarioId: u.id, ...notificacaoDeLembrete(oc, { ticket: e.ticket, titulo: e.tarefaTitulo }, hoje), tarefaId: e.tarefaId, quadroId: e.quadroId });
      }
    // O LEMBRETE do PRAZO das tarefas abertas em que a pessoa está (responsável, equipe ou observadora).
    const prazos = await db
      .select({ id: tarefas.id, quadroId: tarefas.quadroId, ticket: tarefas.ticket, titulo: tarefas.titulo, prazo: tarefas.prazo, prazoHora: tarefas.prazoHora, lembreteMin: tarefas.lembreteMin })
      .from(tarefas)
      .innerJoin(tarefaQuadros, eq(tarefaQuadros.id, tarefas.quadroId))
      .where(
        and(
          sql`${tarefas.lembreteMin} IS NOT NULL`,
          isNull(tarefas.concluidaEm),
          eq(tarefas.arquivada, false),
          eq(tarefas.template, false),
          eq(tarefaQuadros.arquivado, false),
          listaAtiva,
          gte(tarefas.prazo, hoje),
          lte(tarefas.prazo, ate),
          grupoIds ? inArray(tarefaQuadros.grupoId, grupoIds.slice(0, 90)) : undefined,
          quadroVisivel(u.id),
          pessoaNaTarefa(u.id, true),
        ),
      )
      .orderBy(asc(tarefas.prazo))
      .limit(200);
    for (const t of prazos) {
      const n = lembreteDaTarefa(t, agora, hoje);
      if (n) novas.push({ usuarioId: u.id, ...n, tarefaId: t.id, quadroId: t.quadroId });
    }
    return novas;
  } catch (e) {
    console.error("derivar lembretes falhou", e);
    return [];
  }
}

/** NOVA VERSÃO do sistema: a cada pessoa, um aviso por versão com SÓ o que mudou nas telas que os GRUPOS dela abrem (o
 * ADM, tudo; nada nelas = nenhum aviso). A nova versão da extensão da Automação (Centi), só ao ADM. A chave dedup — limpo,
 * não volta. */
async function versaoDerivar(u: UsuarioSessao): Promise<NovaNotificacao[]> {
  if (u.admin) {
    const sistema = avisoNovaVersao(u.id);
    return [...(sistema ? [sistema] : []), avisoVersaoExtensao(u.id)];
  }
  const grupos = await gruposComAbas(u.id);
  const telas = new Set<string>(grupos.flatMap((g) => telasAbertas({ admin: false, capacidades: u.papel.capacidades, abas: g.abas })));
  const aviso = avisoNovaVersao(u.id, mudancasVisiveis(VERSOES[0], telas, false));
  return aviso ? [aviso] : [];
}

/** No máximo uma derivação por pessoa a cada tanto (por isolate do Worker) — a contagem do sino não refaz o trabalho. */
const INTERVALO_DERIVAR = 5 * 60_000;
const derivadoEm = new Map<number, number>();

/**
 * As notificações DERIVADAS (prazos + lembretes + nova versão da extensão) — em paralelo, sem as que a pessoa LIMPOU
 * (dispensadas), gravadas num lote só. `forcar` = ignora o intervalo (o cron). Nunca lança.
 */
async function derivar(u: UsuarioSessao, grupoIds: number[] | null, forcar = false): Promise<void> {
  const agora = Date.now();
  if (!forcar && agora - (derivadoEm.get(u.id) ?? 0) < INTERVALO_DERIVAR) return;
  derivadoEm.set(u.id, agora);
  if (derivadoEm.size > 2000) derivadoEm.clear();
  try {
    const [prazos, lembretes, versao, dispensadas] = await Promise.all([
      derivarPrazos(u, grupoIds),
      derivarLembretes(u, grupoIds),
      versaoDerivar(u),
      consultaDispensadas(getDb(), u.id),
    ]);
    const fora = new Set(dispensadas.map((d) => d.chave));
    await gravarAvisos([...prazos, ...lembretes, ...versao].filter((n) => !n.chave || !fora.has(n.chave)));
  } catch (e) {
    console.error("derivar falhou", e);
  }
}

/**
 * DERIVA os avisos de prazo e lembrete de uma pessoa FORA da leitura do sino (o cron: o aviso nasce mesmo que ninguém
 * abra o sistema). Nunca lança.
 */
export async function derivarDaPessoa(u: UsuarioSessao): Promise<void> {
  try {
    await derivar(u, await gruposDe(u), true);
  } catch (e) {
    console.error("derivar da pessoa falhou", e);
  }
}

/** Os grupos dos avisos DERIVADOS (prazo, lembrete): só onde a pessoa abre Tarefas ou o Calendário (grupo libera +
 * papel visualiza). `null` = o Administrador (todos). */
export function gruposDosAvisos(u: UsuarioSessao, lista: readonly GrupoAcesso[]): number[] | null {
  if (u.admin) return null;
  const abre = (g: GrupoAcesso) =>
    (["tarefas", "calendario"] as const).some((t) => podeNaTela({ admin: false, capacidades: u.papel.capacidades, abas: g.abas }, t).visualizar);
  return lista.filter(abre).map((g) => g.id);
}

const gruposDe = async (u: UsuarioSessao, lista?: readonly GrupoAcesso[]) => gruposDosAvisos(u, lista ?? (await gruposComAbas(u.id)));

/**
 * O aviso ainda é ACESSÍVEL à pessoa: sem quadro (Mesa, Administração…) sempre; de tarefa, só o quadro visível (o privado,
 * só o dono) dos grupos em que ela abre Tarefas/Calendário — quem saiu do grupo deixa de ver os avisos de lá.
 */
const acessivel = (u: UsuarioSessao, grupoIds: number[] | null) =>
  sql`(${notificacoes.quadroId} IS NULL OR EXISTS (SELECT 1 FROM tarefa_quadros q WHERE q.id = ${notificacoes.quadroId} AND (q.privado = 0 OR q.criado_por = ${u.id})${
    grupoIds ? sql` AND q.grupo_id IN (SELECT value FROM json_each(${JSON.stringify(grupoIds)}))` : sql``
  }))`;

/** O aviso ADIADO pela pessoa some do sino até a hora escolhida. */
const visivelAgora = sql`(${notificacoes.adiadaAte} IS NULL OR ${notificacoes.adiadaAte} <= datetime('now'))`;

const condNaoLidas = (u: UsuarioSessao, grupoIds: number[] | null) => and(eq(notificacoes.usuarioId, u.id), eq(notificacoes.lida, false), acessivel(u, grupoIds), visivelAgora);

/** Quantas NÃO LIDAS (o número do sino — o layout passa os grupos que já carregou). Falha = `null` (a tela mantém o último). */
export async function contarNaoLidas(u: UsuarioSessao, grupos?: readonly GrupoAcesso[]): Promise<number | null> {
  try {
    const g = await gruposDe(u, grupos);
    await derivar(u, g);
    const [r] = await getDb().select({ n: sql<number>`COUNT(*)` }).from(notificacoes).where(condNaoLidas(u, g));
    return Number(r?.n ?? 0);
  } catch {
    return null;
  }
}

export type PaginaNotificacoes = { itens: Notificacao[]; naoLidas: number; mais: boolean };

/** Uma PÁGINA da lista (as mais recentes antes do cursor `antes`; só as não lidas ou todas) + a contagem de não lidas. */
export async function listarNotificacoes(u: UsuarioSessao, p: { antes?: number; filtro: "nao-lidas" | "todas"; limite: number }): Promise<PaginaNotificacoes> {
  const db = getDb();
  const g = await gruposDe(u);
  await derivar(u, g);
  const [linhas, [cont]] = await Promise.all([
    db
      .select({
        id: notificacoes.id,
        tipo: notificacoes.tipo,
        titulo: notificacoes.titulo,
        texto: notificacoes.texto,
        link: notificacoes.link,
        lida: notificacoes.lida,
        travada: notificacoes.travada,
        criadoEm: notificacoes.criadoEm,
        tarefaId: notificacoes.tarefaId,
        quadroId: notificacoes.quadroId,
        atorId: notificacoes.atorId,
        atorNome: notificacoes.atorNome,
        temFoto: sql<number>`(${usuarios.foto} IS NOT NULL AND ${usuarios.foto} <> '')`,
        versao: usuarios.atualizadoEm,
      })
      .from(notificacoes)
      .leftJoin(usuarios, eq(usuarios.id, notificacoes.atorId))
      .where(
        and(
          eq(notificacoes.usuarioId, u.id),
          acessivel(u, g),
          visivelAgora,
          p.antes ? lt(notificacoes.id, p.antes) : undefined,
          p.filtro === "nao-lidas" ? eq(notificacoes.lida, false) : undefined,
        ),
      )
      .orderBy(desc(notificacoes.id))
      .limit(p.limite + 1),
    db.select({ n: sql<number>`COUNT(*)` }).from(notificacoes).where(condNaoLidas(u, g)),
  ]);
  return {
    naoLidas: Number(cont?.n ?? 0),
    mais: linhas.length > p.limite,
    itens: linhas.slice(0, p.limite).map((l) => ({
      id: l.id,
      tipo: (TIPOS_NOTIFICACAO as readonly string[]).includes(l.tipo) ? (l.tipo as TipoNotificacao) : "automacao",
      titulo: l.titulo,
      texto: l.texto,
      link: l.link,
      lida: l.lida,
      travada: l.travada,
      criadoEm: l.criadoEm,
      tarefaId: l.tarefaId,
      quadroId: l.quadroId,
      ator: l.atorId != null ? { id: l.atorId, nome: l.atorNome ?? "", foto: urlFoto(l.atorId, !!l.temFoto, l.versao) } : null,
    })),
  };
}

/** Marca como LIDAS (ou NÃO lidas) as pedidas (só as da pessoa), ou todas como lidas. As outras abas acompanham ao vivo. */
export async function marcarLidas(u: UsuarioSessao, alvo: AlvoLeitura): Promise<number> {
  const db = getDb();
  const feitas = await comandoMarcarLidas(db, u.id, alvo);
  if (feitas.length) avisarAoVivo([u.id]);
  return feitas.length;
}

/** EXCLUI do banco (as pedidas, as lidas ou todas) — os derivados ficam dispensados. Devolve quantas saíram. */
export async function excluirNotificacoes(u: UsuarioSessao, alvo: AlvoLimpeza): Promise<number> {
  const db = getDb();
  const [, apagadas] = await db.batch(comandosExcluirNotificacoes(db, u.id, alvo));
  avisarAoVivo([u.id]);
  return apagadas.length;
}

/** ADIA avisos (só os da pessoa): somem do sino até `ate` e voltam como NÃO lidos — ao vivo, no horário. */
export async function adiarNotificacoes(u: UsuarioSessao, ids: number[], ate: number) {
  await getDb()
    .update(notificacoes)
    .set({ adiadaAte: sqlUtc(ate), lida: false, lidaEm: null })
    .where(and(eq(notificacoes.usuarioId, u.id), inArray(notificacoes.id, ids.slice(0, 90))));
  avisarAoVivo([u.id]);
  agendarAoVivo(u.id, ate);
}
