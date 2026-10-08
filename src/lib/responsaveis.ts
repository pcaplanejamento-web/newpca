import { and, asc, eq, ne, sql } from "drizzle-orm";
import { orgaos, reparticoes, responsaveis, responsaveisVinculos, usuarios } from "@/db/schema";
import { cargoCadastrado, listarCargos, normalizarCargo } from "./cargos";
import { getDb } from "./db";
import { CODIGO_GERAL } from "./escopo-unidades-core";
import { urlFoto } from "./pessoa";
import { ORDEM_ORGAOS } from "./orgaos";
import {
  type Alvo,
  alvoQueVale,
  avisoRedirecionado,
  chaveNome,
  type DadosVinculo,
  normalizarVinculo,
  type PessoaResponsavel,
  type PlanilhaResponsaveis,
  type PlanoRealinhar,
  planoRealinhar,
  type VinculoComPessoa,
  type VinculoResponsavel,
  vinculoConflita,
} from "./responsaveis-planilha-core";
import { comandosRealinhar, consultaTodosVinculos, linhaVinculo } from "./responsaveis-sql";

/**
 * RESPONSÁVEIS POR DFDs — a PLANILHA ÚNICA no D1 (pessoas + vínculos com unidades e órgãos). Só escopo de request.
 * A leitura usada na conferência da assinatura é `responsaveisPorReparticao` (`reparticoes.ts`).
 */

/** As colunas da pessoa + a foto do usuário ligado (a URL da rota da foto — nunca o data-URL). */
const colunasPessoa = {
  id: responsaveis.id,
  nome: responsaveis.nome,
  matricula: responsaveis.matricula,
  cargo: responsaveis.cargo,
  usuarioId: responsaveis.usuarioId,
  exoneradoEm: responsaveis.exoneradoEm,
  temFoto: sql<number>`(${usuarios.foto} IS NOT NULL AND ${usuarios.foto} <> '')`,
  versao: usuarios.atualizadoEm,
};

function pessoaDaLinha({ temFoto, versao, ...p }: { id: number; nome: string; matricula: string; cargo: string; usuarioId: number | null; exoneradoEm: string | null; temFoto: number | null; versao: string | null }): PessoaResponsavel {
  return { ...p, foto: p.usuarioId != null ? urlFoto(p.usuarioId, !!temFoto, versao) : null };
}

type Db = ReturnType<typeof getDb>;
type ConfigAlvos = Pick<PlanilhaResponsaveis, "orgaos" | "unidades">;

const consultaOrgaos = (db: Db) =>
  db.select({ id: orgaos.id, sigla: orgaos.sigla, nome: orgaos.nome, assinaturaUnica: orgaos.assinaturaUnica, oculto: orgaos.oculto }).from(orgaos).orderBy(...ORDEM_ORGAOS);

const consultaUnidades = (db: Db) =>
  db
    .select({ id: reparticoes.id, codigo: reparticoes.codigo, nome: reparticoes.nome, orgaoId: reparticoes.orgaoId, oculto: reparticoes.oculto, orgaoProprio: reparticoes.orgaoProprio })
    .from(reparticoes)
    .where(ne(reparticoes.codigo, CODIGO_GERAL))
    .orderBy(asc(reparticoes.ordem), asc(reparticoes.id));

/** A configuração de órgãos e unidades (a regra do lugar que vale). */
export async function configAlvos(): Promise<ConfigAlvos> {
  const db = getDb();
  const [os, us] = await Promise.all([consultaOrgaos(db), consultaUnidades(db)]);
  return { orgaos: os, unidades: us };
}

/** A planilha inteira: as pessoas, os vínculos, os alvos possíveis (órgãos e unidades, sem a "Geral"), os cargos
 * cadastrados e os usuários ativos (para ligar). */
export async function listarPlanilha(): Promise<PlanilhaResponsaveis> {
  const db = getDb();
  const [pessoas, vinculos, os, us, cargos, users] = await Promise.all([
    db
      .select(colunasPessoa)
      .from(responsaveis)
      .leftJoin(usuarios, eq(usuarios.id, responsaveis.usuarioId))
      .orderBy(asc(responsaveis.chave), asc(responsaveis.id)),
    consultaTodosVinculos(db),
    consultaOrgaos(db),
    consultaUnidades(db),
    listarCargos(),
    db
      .select({
        id: usuarios.id,
        nome: usuarios.nome,
        apelido: usuarios.apelido,
        matricula: usuarios.matricula,
        temFoto: sql<number>`(${usuarios.foto} IS NOT NULL AND ${usuarios.foto} <> '')`,
        versao: usuarios.atualizadoEm,
      })
      .from(usuarios)
      .where(eq(usuarios.status, "ativo"))
      .orderBy(asc(usuarios.nome)),
  ]);
  return {
    pessoas: pessoas.map(pessoaDaLinha),
    vinculos: vinculos.map(linhaVinculo),
    orgaos: os,
    unidades: us,
    cargos: cargos.map((c) => c.nome),
    usuarios: users.map(({ temFoto, versao, ...u }) => ({ ...u, matricula: u.matricula ?? "", foto: urlFoto(u.id, !!temFoto, versao) })),
  };
}

export async function getPessoa(id: number): Promise<PessoaResponsavel | null> {
  const [p] = await getDb().select(colunasPessoa).from(responsaveis).leftJoin(usuarios, eq(usuarios.id, responsaveis.usuarioId)).where(eq(responsaveis.id, id)).limit(1);
  return p ? pessoaDaLinha(p) : null;
}

export const MSG_CARGO_FORA = "Escolha um cargo ou função cadastrado (Configurações → Cargos e funções).";

/** O cargo a gravar: vazio, o nome CADASTRADO (a grafia do cadastro) ou o `atual` mantido (fora da lista — dado antigo);
 * `null` = não está na lista (422). */
export async function cargoParaGravar(nome: string, atual?: string): Promise<string | null> {
  const n = normalizarCargo(nome);
  if (!n) return "";
  if (atual != null && n.toLowerCase() === normalizarCargo(atual).toLowerCase()) return atual;
  return cargoCadastrado(n);
}

/** Por que o usuário não pode ser ligado a esta pessoa (`null` = pode): tem de existir e não estar em OUTRA pessoa. */
export async function motivoUsuarioInvalido(usuarioId: number, pessoaId?: number): Promise<{ status: 404 | 409; motivo: string } | null> {
  const db = getDb();
  const [u] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.id, usuarioId)).limit(1);
  if (!u) return { status: 404, motivo: "Usuário não encontrado." };
  const conds = [eq(responsaveis.usuarioId, usuarioId)];
  if (pessoaId != null) conds.push(ne(responsaveis.id, pessoaId));
  const [outra] = await db.select({ nome: responsaveis.nome }).from(responsaveis).where(and(...conds)).limit(1);
  return outra ? { status: 409, motivo: `Este usuário já está ligado a ${outra.nome} na planilha.` } : null;
}

/** Outra pessoa com o MESMO nome (sem acento/caixa) e a MESMA matrícula → o id dela (a planilha não repete pessoas). */
export async function pessoaRepetida(nome: string, matricula: string, ignorar?: number): Promise<number | null> {
  const conds = [eq(responsaveis.chave, chaveNome(nome)), eq(responsaveis.matricula, matricula.trim())];
  if (ignorar != null) conds.push(ne(responsaveis.id, ignorar));
  const [p] = await getDb().select({ id: responsaveis.id }).from(responsaveis).where(and(...conds)).limit(1);
  return p?.id ?? null;
}

export type DadosPessoa = { nome: string; matricula: string; cargo: string; usuarioId: number | null };

export async function criarPessoa(d: DadosPessoa): Promise<number> {
  const [r] = await getDb()
    .insert(responsaveis)
    .values({ nome: d.nome.trim(), matricula: d.matricula.trim(), chave: chaveNome(d.nome), cargo: d.cargo, usuarioId: d.usuarioId })
    .returning({ id: responsaveis.id });
  return r.id;
}

export async function atualizarPessoa(id: number, d: Partial<DadosPessoa & { exoneradoEm: string | null }>) {
  const set: Record<string, unknown> = { atualizadoEm: sql`(CURRENT_TIMESTAMP)` };
  if (d.nome !== undefined) {
    set.nome = d.nome.trim();
    set.chave = chaveNome(d.nome);
  }
  if (d.matricula !== undefined) set.matricula = d.matricula.trim();
  if (d.cargo !== undefined) set.cargo = d.cargo;
  if (d.usuarioId !== undefined) set.usuarioId = d.usuarioId;
  if (d.exoneradoEm !== undefined) set.exoneradoEm = d.exoneradoEm;
  await getDb().update(responsaveis).set(set).where(eq(responsaveis.id, id));
}

/** Os vínculos de UMA pessoa (o impacto ao excluir). */
export async function vinculosDaPessoa(id: number): Promise<VinculoComPessoa[]> {
  return (await consultaTodosVinculos(getDb())).map(linhaVinculo).filter((v) => v.responsavelId === id);
}

export async function excluirPessoa(id: number) {
  // Os vínculos saem em cascata (FK).
  await getDb().delete(responsaveis).where(eq(responsaveis.id, id));
}

type LinhaVinculoBruta = typeof responsaveisVinculos.$inferSelect;

function vinculoDaLinha(v: LinhaVinculoBruta): VinculoResponsavel {
  return {
    id: v.id,
    responsavelId: v.responsavelId,
    orgaoId: v.orgaoId,
    reparticaoId: v.reparticaoId,
    tipo: v.tipo === "temporario" ? "temporario" : "padrao",
    funcao: v.funcao,
    atoTipo: v.atoTipo === "portaria" || v.atoTipo === "decreto" || v.atoTipo === "lei" ? v.atoTipo : null,
    atoNumero: v.atoNumero,
    atoLink: v.atoLink,
    inicio: v.inicio,
    fim: v.fim,
    ordem: v.ordem,
  };
}

export async function getVinculo(id: number): Promise<VinculoResponsavel | null> {
  const [v] = await getDb().select().from(responsaveisVinculos).where(eq(responsaveisVinculos.id, id)).limit(1);
  return v ? vinculoDaLinha(v) : null;
}

/** O alvo existe? (órgão; ou unidade que não seja a "Geral"). */
export async function alvoExiste(alvo: { orgaoId: number | null; reparticaoId: number | null }): Promise<boolean> {
  const db = getDb();
  if (alvo.orgaoId != null) return (await db.select({ id: orgaos.id }).from(orgaos).where(eq(orgaos.id, alvo.orgaoId)).limit(1)).length > 0;
  if (alvo.reparticaoId == null) return false;
  const [u] = await db.select({ codigo: reparticoes.codigo }).from(reparticoes).where(eq(reparticoes.id, alvo.reparticaoId)).limit(1);
  return !!u && u.codigo !== CODIGO_GERAL;
}

/** ONDE o vínculo é gravado: o lugar que vale pela regra do órgão (`alvoQueVale` — a unidade de órgão com assinatura
 * única vai ao órgão; o órgão "por unidade", à unidade própria) + o aviso quando não é o pedido; `erro` = não há um lugar
 * único (o órgão "por unidade" sem unidade própria — escolha as unidades). */
export async function alvoParaGravar(pedido: Alvo): Promise<{ alvo: Alvo; aviso: string | null } | { erro: string }> {
  const conf = await configAlvos();
  const existe = pedido.orgaoId != null ? conf.orgaos.some((o) => o.id === pedido.orgaoId) : conf.unidades.some((u) => u.id === pedido.reparticaoId);
  if (!existe) return { erro: "Unidade ou órgão não encontrado." };
  const alvo = alvoQueVale(pedido, conf);
  if (!alvo) return { erro: "Este órgão tem assinatura por unidade — vincule o responsável a cada unidade." };
  return { alvo, aviso: avisoRedirecionado(pedido, conf) };
}

/** O REALINHAMENTO dos vínculos com a configuração (a atual, ou a que vai ser gravada — `ajustar`): o plano + os
 * comandos para entrar no MESMO lote da mudança. */
export async function planejarRealinhamento(
  ajustar?: (c: ConfigAlvos) => ConfigAlvos,
  destinos?: Readonly<Record<number, readonly number[]>>,
): Promise<{ plano: PlanoRealinhar; config: ConfigAlvos }> {
  const db = getDb();
  const [conf, vinculos] = await Promise.all([configAlvos(), db.select().from(responsaveisVinculos)]);
  const config = ajustar ? ajustar(conf) : conf;
  return { plano: planoRealinhar(config, vinculos.map(vinculoDaLinha), destinos), config };
}

/** Os comandos do plano (para o `db.batch` de quem muda a configuração). */
export function comandosDoPlano(plano: PlanoRealinhar) {
  return comandosRealinhar(getDb(), plano.passos);
}

/** Realinha AGORA (depois de uma mudança já gravada — promover, rebaixar, "também unidade", trocar a unidade de órgão).
 * Os ambíguos e os conflitos ficam como estão (a Conferência aponta). Devolve o plano aplicado. */
export async function realinharVinculos(): Promise<PlanoRealinhar> {
  const { plano } = await planejarRealinhamento();
  const cmds = comandosDoPlano(plano);
  if (cmds.length) await getDb().batch(cmds as [(typeof cmds)[number], ...(typeof cmds)[number][]]);
  return plano;
}

/** O texto do que o realinhamento fez (auditoria/aviso) — vazio quando nada mudou. */
export function resumoRealinhamento(plano: PlanoRealinhar): string {
  const n = (t: string) => plano.passos.filter((p) => p.tipo === t).length;
  const partes = [
    n("mover") && `${n("mover")} vínculo(s) movido(s)`,
    n("copiar") && `${n("copiar")} copiado(s)`,
    n("apagar") && `${n("apagar")} repetido(s) removido(s)`,
    plano.conflitos.length && `${new Set(plano.conflitos.map((c) => c.id)).size} a revisar (período que se cruza)`,
  ].filter(Boolean);
  return partes.join(", ");
}

/** Os vínculos do MESMO alvo (a conferência do conflito). */
async function vinculosDoAlvo(alvo: { orgaoId: number | null; reparticaoId: number | null }): Promise<VinculoResponsavel[]> {
  const cond =
    alvo.orgaoId != null ? eq(responsaveisVinculos.orgaoId, alvo.orgaoId) : eq(responsaveisVinculos.reparticaoId, alvo.reparticaoId ?? -1);
  return (await getDb().select().from(responsaveisVinculos).where(cond)).map(vinculoDaLinha);
}

/** O motivo de recusa (409) ao gravar o vínculo, ou `null`. */
export async function conflitoDoVinculo(novo: {
  id?: number;
  responsavelId: number;
  orgaoId: number | null;
  reparticaoId: number | null;
  tipo: DadosVinculo["tipo"];
  inicio: string | null;
  fim: string | null;
}): Promise<string | null> {
  return vinculoConflita(novo, await vinculosDoAlvo(novo));
}

export async function criarVinculo(d: DadosVinculo & { responsavelId: number; orgaoId: number | null; reparticaoId: number | null }): Promise<number> {
  const n = normalizarVinculo(d);
  const db = getDb();
  const cond = d.orgaoId != null ? eq(responsaveisVinculos.orgaoId, d.orgaoId) : eq(responsaveisVinculos.reparticaoId, d.reparticaoId ?? -1);
  const [{ max }] = await db.select({ max: sql<number>`COALESCE(MAX(${responsaveisVinculos.ordem}), -1)` }).from(responsaveisVinculos).where(cond);
  const [r] = await db
    .insert(responsaveisVinculos)
    .values({ ...n, responsavelId: d.responsavelId, orgaoId: d.orgaoId, reparticaoId: d.reparticaoId, ordem: Number(max) + 1 })
    .returning({ id: responsaveisVinculos.id });
  return r.id;
}

/** Atualiza o vínculo; com `alvo` (onde responde mudou), ele vai ao fim da ordem do alvo novo. */
export async function atualizarVinculo(
  id: number,
  d: DadosVinculo & { responsavelId: number },
  alvo?: { orgaoId: number | null; reparticaoId: number | null },
) {
  const db = getDb();
  let extra: { orgaoId?: number | null; reparticaoId?: number | null; ordem?: number } = {};
  if (alvo) {
    const cond = alvo.orgaoId != null ? eq(responsaveisVinculos.orgaoId, alvo.orgaoId) : eq(responsaveisVinculos.reparticaoId, alvo.reparticaoId ?? -1);
    const [{ max }] = await db.select({ max: sql<number>`COALESCE(MAX(${responsaveisVinculos.ordem}), -1)` }).from(responsaveisVinculos).where(cond);
    extra = { orgaoId: alvo.orgaoId, reparticaoId: alvo.reparticaoId, ordem: Number(max) + 1 };
  }
  await db
    .update(responsaveisVinculos)
    .set({ ...normalizarVinculo(d), responsavelId: d.responsavelId, ...extra })
    .where(eq(responsaveisVinculos.id, id));
}

export async function excluirVinculo(id: number) {
  await getDb().delete(responsaveisVinculos).where(eq(responsaveisVinculos.id, id));
}
