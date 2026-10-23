import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { dfdItens, dfdProtocolos, dfds, mesaExcluidos, orgaos, pcas, protocoloSituacoes, reparticoes, usuarios } from "@/db/schema";
import type { EscopoMesa } from "./acesso-mesa";
import { getDb } from "./db";
import { comandoTotaisDfd } from "./dfd-sql";
import { type DestinoProtocolo, destinoDoDfd, dfdsQueVoltamComProtocolo, sequenciaisQueVoltam } from "./mesa-excluidos-core";
import { excluidoVisivel } from "./mesa-excluidos";
import {
  comandoInserirDfd,
  comandoInserirProtocolo,
  comandoMarcarRestaurados,
  comandoReativarSequenciais,
  comandosInserirItens,
  type DfdRestaurado,
  type ItemRestaurado,
} from "./mesa-excluidos-sql";
import { sincronizarDfdNoPca } from "./pca-sincronia";

/**
 * RESTAURAR da lixeira da Mesa — a régua (núcleo puro em `mesa-excluidos-core.ts`):
 * - cada exclusão é independente: o protocolo volta com os DFDs que saíram JUNTO (o esvaziado, com o DFD que o esvaziou);
 *   o DFD excluído ANTES fica na lixeira;
 * - nunca nº duplicado (protocolo de mesmo nº/Id da capa, DFD de mesmo nº) nem protocolo vazio;
 * - o DFD/item que volta sozinho precisa de um protocolo/DFD vivo (o mesmo id, o reimportado de mesmo Id da capa ou nº);
 * - o protocolo volta com o MESMO id (histórico ligado); incorporado num PCA que ainda existe volta incorporado e os itens
 *   com o MESMO sequencial.
 */
type Db = ReturnType<typeof getDb>;
type Stmt = Parameters<Db["batch"]>[0][number];
type Ator = { id: number; nome: string };

type Linha = typeof mesaExcluidos.$inferSelect;
const obj = (t: string | null): Record<string, unknown> => {
  try {
    const o = t ? JSON.parse(t) : null;
    return o && typeof o === "object" ? (o as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};
const s = (v: unknown) => (typeof v === "string" ? v : null);
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export type ResumoRestauracao = { tipo: Linha["tipo"]; numero: string | null; destino: string | null; voltam: string[]; ficam: number; sequenciais: number };
export type Plano = { ok: true; resumo: ResumoRestauracao; executar: (u: Ator) => Promise<void> } | { ok: false; erro: string; status: number };

const falha = (erro: string, status = 409): Plano => ({ ok: false, erro, status });

/** Os FKs que ainda existem (o que sumiu volta vazio). */
async function existentes(db: Db, ids: { usuarios: number[]; orgaos: number[]; reparticoes: number[]; pcas: number[] }) {
  const q = async (tabela: typeof usuarios | typeof orgaos | typeof reparticoes | typeof pcas, l: number[]) =>
    l.length ? new Set((await db.select({ id: tabela.id }).from(tabela).where(inArray(tabela.id, l))).map((r) => r.id)) : new Set<number>();
  const [u, o, r, p] = await Promise.all([q(usuarios, ids.usuarios), q(orgaos, ids.orgaos), q(reparticoes, ids.reparticoes), q(pcas, ids.pcas)]);
  return { u, o, r, p };
}
const so = (set: Set<number>, v: number | null) => (v != null && set.has(v) ? v : null);
const lista = (...v: (number | null)[]) => [...new Set(v.filter((x): x is number => x != null))];

/** Os itens do retrato de um DFD prontos para gravar (o nº do PCA só quando volta junto). */
function itensDoRetrato(d: Record<string, unknown>, seqs: number[], pcaId: number | null): ItemRestaurado[] {
  const its = (Array.isArray(d.itens) ? d.itens : []) as Record<string, unknown>[];
  return its.map((i) => {
    const seq = n(i.pcaSequencial);
    const volta = pcaId != null && n(i.pcaId) === pcaId && seq != null && seqs.includes(seq);
    return {
      item: n(i.item),
      codigo: s(i.codigo),
      descricao: s(i.descricao),
      unidade: s(i.unidade),
      quantidade: n(i.quantidade),
      valorUnitario: n(i.valorUnitario),
      valorTotal: n(i.valorTotal),
      sequencial: n(i.sequencial),
      pcaId: volta ? pcaId : null,
      pcaSequencial: volta ? seq : null,
      classificacao: s(i.classificacao),
      dominio: s(i.dominio),
    };
  });
}
const itensBrutos = (d: Record<string, unknown>) =>
  ((Array.isArray(d.itens) ? d.itens : []) as Record<string, unknown>[]).map((i) => ({ pcaId: n(i.pcaId), pcaSequencial: n(i.pcaSequencial) }));

function dfdDoRetrato(id: number, d: Record<string, unknown>, protocoloId: number | null, fk: Awaited<ReturnType<typeof existentes>>): DfdRestaurado {
  return {
    id,
    numero: String(d.numero),
    planejamento: s(d.planejamento),
    tipo: s(d.tipo),
    objeto: s(d.objeto),
    orgaoEntidade: s(d.orgaoEntidade),
    setorRequisitante: s(d.setorRequisitante),
    siglaSetor: s(d.siglaSetor),
    orgaoId: so(fk.o, n(d.orgaoId)),
    reparticaoId: so(fk.r, n(d.reparticaoId)),
    protocoloId,
    responsavel: s(d.responsavel),
    matricula: s(d.matricula),
    email: s(d.email),
    telefone: s(d.telefone),
    anoPca: n(d.anoPca),
    numeroContrato: s(d.numeroContrato),
    numeroAta: s(d.numeroAta),
    numeroLicitacao: s(d.numeroLicitacao),
    valorTotal: n(d.valorTotal),
    totalItens: n(d.totalItens) ?? 0,
    secoes: s(d.secoes),
    assinaturas: s(d.assinaturas),
    nomeArquivo: s(d.nomeArquivo),
    execucaoCenti: s(d.execucaoCenti),
    execucaoCentiEm: s(d.execucaoCentiEm),
    conferenciaCenti: s(d.conferenciaCenti),
    conferenciaCentiMotivo: s(d.conferenciaCentiMotivo),
    criadoPor: so(fk.u, n(d.criadoPor)),
    criadoEm: s(d.criadoEm) ?? undefined,
  };
}

/** O protocolo vivo como destino. */
async function protocoloVivo(db: Db, onde: ReturnType<typeof eq>): Promise<DestinoProtocolo | null> {
  const [p] = await db
    .select({ id: dfdProtocolos.id, numero: dfdProtocolos.numero, pcaId: dfdProtocolos.pcaId, inc: dfdProtocolos.pcaIncorporadoEm })
    .from(dfdProtocolos)
    .where(onde)
    .limit(1);
  return p ? { id: p.id, numero: p.numero, pcaId: p.pcaId, incorporado: p.inc != null } : null;
}

/** DFDs vivos com estes nºs ou ids (o conflito: nunca dois DFDs de mesmo nº). */
async function dfdsEmConflito(db: Db, numeros: string[], ids: number[]) {
  if (!numeros.length && !ids.length) return [];
  return db
    .select({ id: dfds.id, numero: dfds.numero, protocolo: dfdProtocolos.numero })
    .from(dfds)
    .leftJoin(dfdProtocolos, eq(dfdProtocolos.id, dfds.protocoloId))
    .where(or(numeros.length ? inArray(dfds.numero, numeros) : undefined, ids.length ? inArray(dfds.id, ids) : undefined));
}
const textoConflito = (c: { numero: string; protocolo: string | null }) => `O DFD ${c.numero} existe hoje${c.protocolo ? ` no protocolo ${c.protocolo}` : " na Mesa"}.`;

/** Analisa a restauração de uma linha da lixeira (sem gravar): o plano com o resumo e o `executar`, ou o motivo da recusa. */
export async function analisarRestauracao(id: number, esc: EscopoMesa, usuarioId: number): Promise<Plano> {
  const db = getDb();
  const [e] = await db.select().from(mesaExcluidos).where(eq(mesaExcluidos.id, id)).limit(1);
  if (!e) return falha("Não encontrado.", 404);
  if (e.restauradoEm) return falha("Já foi restaurado.");
  if (!excluidoVisivel(esc, usuarioId, e)) return falha("Sem acesso.", 403);
  if (e.tipo === "protocolo") return planoProtocolo(db, e, esc, usuarioId);
  if (e.tipo === "dfd") return planoDfd(db, e, esc);
  return planoItem(db, e, esc);
}

async function planoProtocolo(db: Db, e: Linha, esc: EscopoMesa, usuarioId: number): Promise<Plano> {
  const r = obj(e.retrato);
  const numero = s(r.numero) ?? e.numero ?? "";
  const idExterno = s(r.idExterno);
  const linhas = await db
    .select()
    .from(mesaExcluidos)
    .where(and(eq(mesaExcluidos.tipo, "dfd"), eq(mesaExcluidos.protocoloId, e.protocoloId ?? -1), isNull(mesaExcluidos.restauradoEm)));
  const voltamIds = dfdsQueVoltamComProtocolo(e, linhas);
  if (!voltamIds.length) return falha("O protocolo não tem nenhum DFD para voltar com ele — não se restaura um protocolo vazio.");
  const voltam = linhas.filter((l) => voltamIds.includes(l.id));
  if (voltam.some((l) => !excluidoVisivel(esc, usuarioId, l))) return falha("Um dos DFDs deste protocolo é de uma unidade sem acesso.", 403);
  // Conflitos: o mesmo protocolo vivo (id, nº ou Id da capa) e os DFDs de mesmo nº/id.
  const vivo = await protocoloVivo(db, or(eq(dfdProtocolos.id, e.alvoId), eq(dfdProtocolos.numero, numero), idExterno ? eq(dfdProtocolos.idExterno, idExterno) : undefined) as ReturnType<typeof eq>);
  if (vivo) return falha(`O protocolo ${vivo.numero} existe hoje na Mesa${idExterno ? " (mesmo nº ou Id da capa)" : ""}.`);
  const retratos = voltam.map((l) => ({ l, d: obj(l.retrato) }));
  const conflitos = await dfdsEmConflito(db, retratos.map((x) => String(x.d.numero ?? x.l.numero)), retratos.map((x) => x.l.alvoId));
  if (conflitos.length) return falha(conflitos.map(textoConflito).join(" "));
  const responsavel = n(r.responsavelId);
  const fk = await existentes(db, {
    usuarios: lista(responsavel, ...retratos.map((x) => n(x.d.criadoPor))),
    orgaos: lista(n(r.orgaoId), ...retratos.map((x) => n(x.d.orgaoId))),
    reparticoes: lista(n(r.reparticaoId), ...retratos.map((x) => n(x.d.reparticaoId))),
    pcas: lista(n(r.pcaId)),
  });
  const pcaId = so(fk.p, n(r.pcaId));
  const incorporado = pcaId != null && s(r.pcaIncorporadoEm) != null;
  const destino: DestinoProtocolo = { id: e.alvoId, numero, pcaId, incorporado };
  const [sit] = s(r.situacao) ? await db.select({ id: protocoloSituacoes.id }).from(protocoloSituacoes).where(eq(protocoloSituacoes.nome, s(r.situacao) as string)).limit(1) : [];
  const [criador] = s(r.criadoPorNome) ? await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.nome, s(r.criadoPorNome) as string)).limit(1) : [];
  const seqs = retratos.map((x) => sequenciaisQueVoltam(itensBrutos(x.d), destino));
  const ficam = linhas.filter((l) => !voltamIds.includes(l.id) && l.motivo !== "cascata").length;
  return {
    ok: true,
    resumo: { tipo: "protocolo", numero, destino: pcaId ? "o PCA" : "a Mesa do sistema", voltam: retratos.map((x) => String(x.d.numero ?? x.l.numero)), ficam, sequenciais: seqs.flat().length },
    executar: async () => {
      const cmds: Stmt[] = [
        comandoInserirProtocolo(db, {
          id: e.alvoId,
          numero,
          idExterno,
          data: s(r.data),
          interessado: s(r.interessado),
          documento: s(r.documento),
          assunto: s(r.assunto),
          observacao: s(r.observacao),
          valorCapa: n(r.valorCapa),
          anoPca: n(r.anoPca),
          orgaoId: so(fk.o, n(r.orgaoId)),
          reparticaoId: so(fk.r, n(r.reparticaoId)),
          localReparticao: s(r.localReparticao),
          nomeArquivo: s(r.nomeArquivo),
          responsavelId: so(fk.u, responsavel),
          situacaoId: sit?.id ?? null,
          pcaId,
          pcaEnviadoEm: pcaId ? (s(r.pcaEnviadoEm) ?? new Date().toISOString().slice(0, 19).replace("T", " ")) : null,
          pcaIncorporadoEm: incorporado ? s(r.pcaIncorporadoEm) : null,
          criadoPor: criador?.id ?? null,
          criadoEm: s(r.criadoEm) ?? undefined,
        }),
      ];
      retratos.forEach((x, k) => {
        cmds.push(comandoInserirDfd(db, dfdDoRetrato(x.l.alvoId, x.d, e.alvoId, fk)));
        cmds.push(...comandosInserirItens(db, x.l.alvoId, itensDoRetrato(x.d, seqs[k], pcaId)));
        if (incorporado && pcaId && seqs[k].length) cmds.push(comandoReativarSequenciais(db, pcaId, x.l.alvoId, e.alvoId, seqs[k]));
        cmds.push(comandoTotaisDfd(db, x.l.alvoId));
      });
      cmds.push(comandoMarcarRestaurados(db, [e.id, ...voltamIds]));
      await db.batch(cmds as [Stmt, ...Stmt[]]);
      if (incorporado) for (const x of retratos) await sincronizarDfdNoPca(x.l.alvoId, usuarioId, "todos");
    },
  };
}

/** O destino de um DFD/item: o protocolo vivo (mesmo id → mesmo Id da capa → mesmo nº) ou o motivo de não haver. */
async function destinoPara(db: Db, protocoloId: number | null, protocoloNumero: string | null) {
  if (protocoloId == null) return destinoDoDfd({ protocoloId: null, protocoloNumero, idExterno: null }, { porId: null, porIdExterno: null, porNumero: null }, false);
  const [naLixeira] = await db
    .select({ retrato: mesaExcluidos.retrato })
    .from(mesaExcluidos)
    .where(and(eq(mesaExcluidos.tipo, "protocolo"), eq(mesaExcluidos.alvoId, protocoloId), isNull(mesaExcluidos.restauradoEm)))
    .limit(1);
  const idExterno = naLixeira ? s(obj(naLixeira.retrato).idExterno) : null;
  const [porId, porIdExterno, porNumero] = await Promise.all([
    protocoloVivo(db, eq(dfdProtocolos.id, protocoloId)),
    idExterno ? protocoloVivo(db, eq(dfdProtocolos.idExterno, idExterno)) : null,
    protocoloNumero ? protocoloVivo(db, eq(dfdProtocolos.numero, protocoloNumero)) : null,
  ]);
  return destinoDoDfd({ protocoloId, protocoloNumero, idExterno }, { porId, porIdExterno, porNumero }, !!naLixeira);
}

async function planoDfd(db: Db, e: Linha, esc: EscopoMesa): Promise<Plano> {
  const d = obj(e.retrato);
  const numero = String(d.numero ?? e.numero ?? "");
  const conflitos = await dfdsEmConflito(db, [numero], [e.alvoId]);
  if (conflitos.length) return falha(conflitos.map(textoConflito).join(" "));
  const dest = await destinoPara(db, e.protocoloId, e.protocoloNumero);
  if ("erro" in dest) return falha(dest.erro);
  const destino = dest.destino;
  const fk = await existentes(db, { usuarios: lista(n(d.criadoPor)), orgaos: lista(n(d.orgaoId)), reparticoes: lista(n(d.reparticaoId)), pcas: [] });
  if (!esc.acessivel(so(fk.r, n(d.reparticaoId)))) return falha("A unidade deste DFD está fora do seu acesso.", 403);
  const seqs = sequenciaisQueVoltam(itensBrutos(d), destino);
  return {
    ok: true,
    resumo: { tipo: "dfd", numero, destino: destino ? `o protocolo ${destino.numero}` : "a Mesa (avulso)", voltam: [numero], ficam: 0, sequenciais: seqs.length },
    executar: async (u) => {
      const cmds: Stmt[] = [
        comandoInserirDfd(db, dfdDoRetrato(e.alvoId, d, destino?.id ?? null, fk)),
        ...comandosInserirItens(db, e.alvoId, itensDoRetrato(d, seqs, destino?.pcaId ?? null)),
      ];
      if (destino?.pcaId && seqs.length) cmds.push(comandoReativarSequenciais(db, destino.pcaId, e.alvoId, destino.id, seqs));
      cmds.push(comandoTotaisDfd(db, e.alvoId), comandoMarcarRestaurados(db, [e.id]));
      await db.batch(cmds as [Stmt, ...Stmt[]]);
      if (destino?.incorporado) await sincronizarDfdNoPca(e.alvoId, u.id, "todos");
    },
  };
}

async function planoItem(db: Db, e: Linha, esc: EscopoMesa): Promise<Plano> {
  const r = obj(e.retrato);
  const it = (r.item && typeof r.item === "object" ? r.item : {}) as Record<string, unknown>;
  const dfdNumero = s(r.dfdNumero);
  const [vivo] = await db
    .select({ id: dfds.id, numero: dfds.numero, rep: dfds.reparticaoId, protocoloId: dfds.protocoloId, pcaId: dfdProtocolos.pcaId, inc: dfdProtocolos.pcaIncorporadoEm })
    .from(dfds)
    .leftJoin(dfdProtocolos, eq(dfdProtocolos.id, dfds.protocoloId))
    .where(or(eq(dfds.id, e.dfdId ?? -1), dfdNumero ? eq(dfds.numero, dfdNumero) : undefined))
    .orderBy(sql`${dfds.id} = ${e.dfdId ?? -1} DESC`)
    .limit(1);
  if (!vivo) return falha(`O DFD ${dfdNumero ?? ""} não está na Mesa: restaure-o primeiro (o item volta dentro dele).`.replace("  ", " "));
  if (!esc.acessivel(vivo.rep)) return falha("A unidade deste DFD está fora do seu acesso.", 403);
  const destino: DestinoProtocolo | null = vivo.protocoloId ? { id: vivo.protocoloId, numero: "", pcaId: vivo.pcaId, incorporado: vivo.inc != null } : null;
  const seqs = sequenciaisQueVoltam([{ pcaId: n(it.pcaId), pcaSequencial: n(it.pcaSequencial) }], destino);
  return {
    ok: true,
    resumo: { tipo: "item", numero: e.numero, destino: `o DFD ${vivo.numero}`, voltam: [], ficam: 0, sequenciais: seqs.length },
    executar: async (u) => {
      const [m] = await db.select({ m: sql<number>`COALESCE(MAX(${dfdItens.sequencial}), 0)` }).from(dfdItens).where(eq(dfdItens.dfdId, vivo.id));
      const [item] = itensDoRetrato({ itens: [it] }, seqs, destino?.pcaId ?? null);
      const cmds: Stmt[] = [...comandosInserirItens(db, vivo.id, [{ ...item, sequencial: Number(m?.m ?? 0) + 1 }])];
      if (destino?.pcaId && seqs.length) cmds.push(comandoReativarSequenciais(db, destino.pcaId, vivo.id, destino.id, seqs));
      cmds.push(comandoTotaisDfd(db, vivo.id), comandoMarcarRestaurados(db, [e.id]));
      await db.batch(cmds as [Stmt, ...Stmt[]]);
      if (destino?.incorporado) await sincronizarDfdNoPca(vivo.id, u.id, "todos");
    },
  };
}
