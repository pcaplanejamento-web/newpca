/**
 * RESPONSÁVEIS POR DFDs numa PLANILHA ÚNICA — núcleo PURO (testado em `tests/responsaveis-planilha.test.ts`).
 *
 * A PESSOA é cadastrada UMA vez (nome + matrícula + o CARGO/FUNÇÃO dela — da lista de cargos — e, opcionalmente, o
 * USUÁRIO da plataforma, que dá a foto) e VINCULADA a unidades ou órgãos como padrão ou temporário. O VÍNCULO guarda a
 * nomeação (ato) e o PERÍODO: o padrão segue o cargo da pessoa, tem início e um fim opcional (vazio = em aberto); o
 * temporário tem o cargo PRÓPRIO do período, início e fim. A montagem devolve o MESMO `Responsaveis` de sempre
 * (`reparticao-responsaveis.ts`), então a conferência da assinatura, a previsão da unidade e o solicitante não mudam.
 */

import { norm } from "./parse-dfd-comum.ts";
import {
  RESPONSAVEIS_VAZIO,
  type Responsaveis,
  type ResponsavelTemporario,
  responsaveisVigentes,
  type TipoAto,
} from "./reparticao-responsaveis.ts";

export type TipoVinculo = "padrao" | "temporario";

/** Uma pessoa da planilha: `cargo` = o nome do cargo cadastrado; `usuarioId`/`foto` = o usuário ligado (URL da foto);
 * `exoneradoEm` = a data da EXONERAÇÃO ("AAAA-MM-DD"; null = em exercício); `externo` = FUNCIONÁRIO DE FORA DO MUNICÍPIO
 * (não tem matrícula). */
export type PessoaResponsavel = {
  id: number;
  nome: string;
  matricula: string;
  cargo: string;
  usuarioId: number | null;
  foto: string | null;
  exoneradoEm: string | null;
  externo: boolean;
};

/** A matrícula que a pessoa GRAVA: o funcionário de fora do município não tem (sempre vazia). */
export function matriculaParaGravar(externo: boolean, matricula: string): string {
  return externo ? "" : matricula.trim();
}

/** O texto da matrícula nas telas: "Fora do município" · "Matrícula N" · "Sem matrícula". */
export function rotuloMatricula(p: { matricula: string; externo?: boolean } | null | undefined): string {
  if (p?.externo) return "Fora do município";
  return p?.matricula.trim() ? `Matrícula ${p.matricula.trim()}` : "Sem matrícula";
}

/** Um vínculo pessoa → unidade OU órgão (exatamente um dos dois). */
export type VinculoResponsavel = {
  id: number;
  responsavelId: number;
  orgaoId: number | null;
  reparticaoId: number | null;
  tipo: TipoVinculo;
  /** O cargo do TEMPORÁRIO (o padrão não guarda — segue o `cargo` da pessoa). */
  funcao: string;
  atoTipo: TipoAto | null;
  atoNumero: string;
  atoLink: string;
  inicio: string | null;
  fim: string | null;
  ordem: number;
};

/** O vínculo com a pessoa (a forma que as telas e a montagem usam) — `cargo` = o da pessoa. */
export type VinculoComPessoa = VinculoResponsavel & { nome: string; matricula: string; cargo: string };

/** A função que VALE no vínculo: a do período no temporário; a da pessoa no padrão. */
export function funcaoDoVinculo(v: { tipo: TipoVinculo; funcao: string; cargo: string }): string {
  return (v.tipo === "temporario" ? v.funcao : v.cargo).trim();
}

/**
 * A PRIORIDADE de um cargo: a posição na lista de Configurações → Cargos e funções (mais acima = mais prioridade), sem
 * caixa; cargo fora da lista vem depois dos da lista e sem cargo por último.
 */
export function prioridadeCargo(cargo: string, cargos: readonly string[]): number {
  const c = cargo.trim().toLowerCase();
  if (!c) return Number.MAX_SAFE_INTEGER;
  const i = cargos.findIndex((x) => x.trim().toLowerCase() === c);
  return i < 0 ? cargos.length : i;
}

const comparaNome = (a: string, b: string) => a.localeCompare(b, "pt-BR", { sensitivity: "base" });

/** As pessoas na ORDEM de prioridade do cargo, depois pelo nome. */
export function ordenarPorPrioridade<T extends { nome: string; cargo: string }>(pessoas: readonly T[], cargos: readonly string[]): T[] {
  return [...pessoas].sort((a, b) => prioridadeCargo(a.cargo, cargos) - prioridadeCargo(b.cargo, cargos) || comparaNome(a.nome, b.nome));
}

/** Os vínculos separados em PADRÃO e TEMPORÁRIOS (as duas seções das telas). Com `cargos`, cada seção vai na prioridade do
 * cargo que vale no vínculo (`funcaoDoVinculo`) e depois pelo nome; sem eles, na ordem gravada. */
export function separarVinculos<T extends { tipo: TipoVinculo; ordem: number; id: number; nome?: string; cargo?: string; funcao?: string }>(
  lista: readonly T[],
  cargos?: readonly string[],
): { padroes: T[]; temporarios: T[] } {
  let ord = ordenarVinculos([...lista]);
  if (cargos) {
    const p = (v: T) => prioridadeCargo(funcaoDoVinculo({ tipo: v.tipo, funcao: v.funcao ?? "", cargo: v.cargo ?? "" }), cargos);
    ord = [...ord].sort((a, b) => p(a) - p(b) || comparaNome(a.nome ?? "", b.nome ?? ""));
  }
  return { padroes: ord.filter((v) => v.tipo === "padrao"), temporarios: ord.filter((v) => v.tipo === "temporario") };
}

/** O nº do ato comparável: sem espaços, sem caixa e sem zeros à esquerda em cada parte ("1912 / 2026" = "1912/2026"). */
export function numeroAtoNormal(numero: string): string {
  return numero
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/\b0+(\d)/g, "$1");
}

/** A chave da NOMEAÇÃO de um vínculo — a MESMA pessoa, o mesmo tipo (padrão/temporário) e o mesmo ato (tipo + nº);
 * `null` quando não há nº do ato (não se unifica). */
export function chaveNomeacao(v: { responsavelId: number; tipo: TipoVinculo; atoTipo: string | null; atoNumero: string }): string | null {
  const n = numeroAtoNormal(v.atoNumero);
  return n ? `${v.responsavelId}|${v.tipo}|${v.atoTipo ?? ""}|${n}` : null;
}

/** Os vínculos UNIFICADOS pelo ato: os de mesma nomeação (`chaveNomeacao`) viram UM grupo, na ordem em que aparecem
 * (o 1º de cada grupo marca a posição); sem nº do ato, cada vínculo é um grupo próprio. */
export function agruparPorNomeacao<T extends { id: number; responsavelId: number; tipo: TipoVinculo; atoTipo: string | null; atoNumero: string }>(
  vinculos: readonly T[],
): T[][] {
  const grupos: T[][] = [];
  const porChave = new Map<string, T[]>();
  for (const v of vinculos) {
    const k = chaveNomeacao(v);
    const g = k ? porChave.get(k) : undefined;
    if (g) g.push(v);
    else {
      const novo = [v];
      grupos.push(novo);
      if (k) porChave.set(k, novo);
    }
  }
  return grupos;
}

/** A CHAVE da pessoa: o nome sem acento/caixa/espaços repetidos (a mesma régua da conferência da assinatura). */
export function chaveNome(nome: string): string {
  return norm(nome);
}

/** Lê o tipo do ato (o que não é portaria/decreto/lei vira `null`). */
export function lerTipoAto(v: unknown): TipoAto | null {
  return v === "portaria" || v === "decreto" || v === "lei" ? v : null;
}

function ordenarVinculos<T extends { ordem: number; id: number }>(lista: T[]): T[] {
  return [...lista].sort((a, b) => a.ordem - b.ordem || a.id - b.id);
}

/** Os vínculos de UM alvo → o `Responsaveis` de sempre (padrões e temporários na ordem; temporário sem período fica de
 * fora, como o `serializeResponsaveis` já fazia). A função do padrão é o cargo da pessoa; o padrão leva o período
 * quando tem (sem período = como antes — vale sempre). */
export function responsaveisDosVinculos(vinculos: readonly VinculoComPessoa[]): Responsaveis {
  if (vinculos.length === 0) return RESPONSAVEIS_VAZIO;
  const padroes: Responsaveis["padroes"] = [];
  const temporarios: ResponsavelTemporario[] = [];
  for (const v of ordenarVinculos(vinculos as VinculoComPessoa[])) {
    const nome = v.nome.trim();
    if (!nome) continue;
    const base = {
      nome,
      matricula: v.matricula,
      funcao: funcaoDoVinculo(v),
      nomeacao: { tipo: v.atoTipo, numero: v.atoNumero, link: v.atoLink },
    };
    if (v.tipo === "temporario") {
      if (v.inicio && v.fim) temporarios.push({ ...base, inicio: v.inicio, fim: v.fim });
    } else padroes.push({ ...base, ...(v.inicio ? { inicio: v.inicio } : {}), ...(v.fim ? { fim: v.fim } : {}) });
  }
  return { padroes, temporarios };
}

/** De QUAL alvo saem os responsáveis de uma unidade: do ÓRGÃO com assinatura única, senão da própria unidade. */
export function alvoEfetivo(u: { reparticaoId: number; orgaoId: number | null; assinaturaUnica: boolean }): { orgaoId: number } | { reparticaoId: number } {
  return u.assinaturaUnica && u.orgaoId != null ? { orgaoId: u.orgaoId } : { reparticaoId: u.reparticaoId };
}

/** Agrupa os vínculos por alvo (`o<id>` | `u<id>`). */
export function chaveAlvo(v: { orgaoId: number | null; reparticaoId: number | null }): string {
  return v.orgaoId != null ? `o${v.orgaoId}` : `u${v.reparticaoId}`;
}

export function porAlvo(vinculos: readonly VinculoComPessoa[]): Map<string, VinculoComPessoa[]> {
  const m = new Map<string, VinculoComPessoa[]>();
  for (const v of vinculos) {
    const k = chaveAlvo(v);
    const l = m.get(k);
    if (l) l.push(v);
    else m.set(k, [v]);
  }
  return m;
}

/** Os responsáveis EFETIVOS de cada unidade pedida (a regra do órgão aplicada) a partir dos vínculos já lidos. */
export function responsaveisEfetivosDasUnidades(
  unidades: readonly { id: number; orgaoId: number | null; assinaturaUnica: boolean }[],
  vinculos: readonly VinculoComPessoa[],
): Record<number, Responsaveis> {
  const grupos = porAlvo(vinculos);
  const out: Record<number, Responsaveis> = {};
  for (const u of unidades) {
    const alvo = alvoEfetivo({ reparticaoId: u.id, orgaoId: u.orgaoId, assinaturaUnica: u.assinaturaUnica });
    const k = "orgaoId" in alvo ? `o${alvo.orgaoId}` : `u${alvo.reparticaoId}`;
    out[u.id] = responsaveisDosVinculos(grupos.get(k) ?? []);
  }
  return out;
}

/** Os dados do vínculo que se gravam (sem id/pessoa) — a mesma régua na tela e no servidor (`funcao` = o cargo do
 * temporário; o padrão grava vazio). */
export type DadosVinculo = {
  tipo: TipoVinculo;
  funcao: string;
  atoTipo: TipoAto | null;
  atoNumero: string;
  atoLink: string;
  inicio: string | null;
  fim: string | null;
};

const DATA = /^\d{4}-\d{2}-\d{2}$/;

/** O que está errado nos dados de um vínculo (vazio = pode gravar). O padrão precisa do início (o fim é opcional — vazio
 * = em aberto); o temporário, do cargo do período e das duas datas. */
export function motivoVinculoInvalido(d: DadosVinculo): string | null {
  if (d.tipo === "temporario") {
    if (!d.funcao.trim()) return "Escolha o cargo ou a função do temporário.";
    if (!d.inicio || !d.fim) return "O temporário precisa do início e do fim.";
  } else if (!d.inicio) return "Informe a data inicial do padrão (o fim pode ficar em aberto).";
  if ((d.inicio && !DATA.test(d.inicio)) || (d.fim && !DATA.test(d.fim))) return "Datas inválidas.";
  if (d.inicio && d.fim && d.inicio > d.fim) return "O início vem depois do fim.";
  if (d.atoLink && !/^https?:\/\//i.test(d.atoLink)) return "O link da nomeação precisa começar com http:// ou https://.";
  return null;
}

const dataBR = (iso: string) => iso.split("-").reverse().join("/");

/** A pessoa está EXONERADA (a data já chegou). Os vínculos dela continuam valendo — a exoneração só fecha vínculos novos. */
export function exonerado(p: { exoneradoEm: string | null }, hoje: string): boolean {
  return !!p.exoneradoEm && p.exoneradoEm <= hoje;
}

/**
 * O motivo de NÃO vincular a pessoa (`null` = pode) — a mesma régua na tela e no servidor (409): com a exoneração em
 * vigor, nenhum vínculo NOVO (`novo` = criar o vínculo ou trocá-lo para esta pessoa); e nenhum vínculo começa DEPOIS da
 * data da exoneração.
 */
export function motivoNaoVincular(p: { exoneradoEm: string | null }, d: { inicio: string | null }, hoje: string, novo: boolean): string | null {
  if (!p.exoneradoEm) return null;
  if (novo && exonerado(p, hoje)) return `Pessoa exonerada em ${dataBR(p.exoneradoEm)} — não recebe vínculos novos.`;
  if (d.inicio && d.inicio > p.exoneradoEm) return `O vínculo não pode começar depois da exoneração (${dataBR(p.exoneradoEm)}).`;
  return null;
}

/** Normaliza: o padrão não guarda função (segue o cargo da pessoa); sem tipo de ato, o número e o link continuam (a
 * nomeação antiga só tinha o texto). */
export function normalizarVinculo(d: DadosVinculo): DadosVinculo {
  return {
    tipo: d.tipo,
    funcao: d.tipo === "padrao" ? "" : d.funcao.trim().replace(/\s+/g, " "),
    atoTipo: lerTipoAto(d.atoTipo),
    atoNumero: d.atoNumero.trim(),
    atoLink: d.atoLink.trim(),
    inicio: d.inicio?.trim() || null,
    fim: d.fim?.trim() || null,
  };
}

function cruzam(a: { inicio: string | null; fim: string | null }, b: { inicio: string | null; fim: string | null }): boolean {
  return (a.inicio ?? "") <= (b.fim ?? "9999-12-31") && (b.inicio ?? "") <= (a.fim ?? "9999-12-31");
}

/** A mesma pessoa no MESMO alvo e no MESMO tipo com períodos que se cruzam (fim vazio = em aberto) → o motivo (409). */
export function vinculoConflita(
  novo: { id?: number; responsavelId: number; orgaoId: number | null; reparticaoId: number | null; tipo: TipoVinculo; inicio: string | null; fim: string | null },
  existentes: readonly VinculoResponsavel[],
): string | null {
  for (const v of existentes) {
    if (v.id === novo.id || v.responsavelId !== novo.responsavelId) continue;
    if (v.orgaoId !== novo.orgaoId || v.reparticaoId !== novo.reparticaoId || v.tipo !== novo.tipo) continue;
    if (cruzam(v, novo))
      return novo.tipo === "padrao" ? "Esta pessoa já é responsável padrão aqui num período que se cruza com este." : "Esta pessoa já tem um período temporário que se cruza com este aqui.";
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------
// CONFERÊNCIA — o que está mal cadastrado (as mensagens da célula Estado: `resumoEstado`).

export type MensagemConferencia = { status: "erro" | "atencao"; chave: string; texto: string; rotulo: string };

/** O cargo é da LISTA de Configurações → Cargos e funções (sem caixa)? Sem lista (nada cadastrado) ou vazio = não confere. */
export function cargoForaDaLista(cargo: string, cargos?: readonly string[]): boolean {
  const c = cargo.trim().toLowerCase();
  return !!c && !!cargos?.length && !cargos.some((x) => x.trim().toLowerCase() === c);
}

/** Problemas de UM vínculo (cargo do temporário — vazio ou FORA DA LISTA de cargos —, nomeação, início do padrão). O cargo
 * da PESSOA (o do padrão) é conferido na pessoa; o vínculo ENCERRADO não é problema (fica à parte, em cinza). */
export function problemasDoVinculo(v: VinculoResponsavel, cargos?: readonly string[]): MensagemConferencia[] {
  const out: MensagemConferencia[] = [];
  const temp = v.tipo === "temporario";
  if (temp && !v.funcao.trim()) out.push({ status: "atencao", chave: "resp.funcao", texto: "Temporário sem o cargo ou a função do período.", rotulo: "Temporário sem cargo" });
  if (temp && cargoForaDaLista(v.funcao, cargos))
    out.push({
      status: "erro",
      chave: "resp.funcaoFora",
      texto: `O cargo do temporário (“${v.funcao.trim()}”) não está na lista de Cargos e funções — escolha um cadastrado.`,
      rotulo: "Cargo fora da lista",
    });
  if (!temp && !v.inicio) out.push({ status: "atencao", chave: "resp.semInicio", texto: "Padrão sem a data inicial.", rotulo: "Padrão sem início" });
  if (!v.atoTipo && !v.atoNumero.trim()) out.push({ status: "atencao", chave: "resp.ato", texto: "Vínculo sem a nomeação (portaria, decreto ou lei).", rotulo: "Sem nomeação" });
  return out;
}

/** Problemas de UMA pessoa (matrícula, vínculos, homônimos com outra matrícula) + os dos vínculos dela. */
export function problemasDaPessoa(
  p: PessoaResponsavel,
  vinculos: readonly VinculoResponsavel[],
  todas: readonly PessoaResponsavel[],
  hoje: string,
  cargos?: readonly string[],
): MensagemConferencia[] {
  const out: MensagemConferencia[] = [];
  // O funcionário de FORA DO MUNICÍPIO não tem matrícula (não é falta).
  if (!p.externo && !p.matricula.trim()) out.push({ status: "atencao", chave: "resp.matricula", texto: "Pessoa sem matrícula.", rotulo: "Sem matrícula" });
  if (!p.cargo.trim()) out.push({ status: "atencao", chave: "resp.semCargo", texto: "Pessoa sem o cargo ou a função padrão.", rotulo: "Sem cargo" });
  if (cargoForaDaLista(p.cargo, cargos))
    out.push({
      status: "erro",
      chave: "resp.cargoFora",
      texto: `O cargo “${p.cargo.trim()}” não está na lista de Cargos e funções — escolha um cadastrado.`,
      rotulo: "Cargo fora da lista",
    });
  const chave = chaveNome(p.nome);
  const homonimos = todas.filter((o) => o.id !== p.id && chaveNome(o.nome) === chave);
  if (homonimos.length)
    out.push({
      status: "atencao",
      chave: "resp.duplicada",
      texto: `Mesmo nome de outra pessoa da planilha (${homonimos.map((o) => rotuloMatricula(o).toLowerCase()).join(", ")}) — confira se é a mesma.`,
      rotulo: "Possível duplicidade",
    });
  if (vinculos.length === 0) out.push({ status: "atencao", chave: "resp.semVinculo", texto: "Pessoa sem vínculo com unidade ou órgão.", rotulo: "Sem vínculo" });
  for (const v of vinculos) for (const m of problemasDoVinculo(v, cargos)) if (!out.some((o) => o.chave === m.chave)) out.push(m);
  return out;
}

/**
 * Problemas de um ALVO (órgão ou unidade): sem responsável VIGENTE (erro — a assinatura dos DFDs não é conferida) e
 * vínculos que não valem pela regra do órgão (atenção).
 * - `valem`: os responsáveis deste alvo são os usados (unidade de órgão "por unidade"; órgão de assinatura única).
 * - `vinculos`: quantos vínculos o alvo tem.
 */
export function problemasDoAlvo(
  a: { valem: boolean; vinculos: readonly VinculoComPessoa[]; ehOrgao: boolean },
  hoje: string,
  cargos?: readonly string[],
): MensagemConferencia[] {
  const out: MensagemConferencia[] = [];
  if (!a.valem) {
    if (a.vinculos.length)
      out.push({
        status: "atencao",
        chave: "resp.naoValem",
        texto: a.ehOrgao
          ? "Os responsáveis do órgão não valem: cada unidade tem os seus (assinatura por unidade)."
          : "Os responsáveis desta unidade não valem: o órgão tem assinatura única.",
        rotulo: "Responsáveis sem efeito",
      });
    return out;
  }
  const vigentes = responsaveisVigentes(responsaveisDosVinculos(a.vinculos), hoje);
  if (vigentes.length === 0)
    out.push({ status: "erro", chave: "resp.semVigente", texto: "Sem responsável vigente — a assinatura dos DFDs não é conferida.", rotulo: "Sem responsável" });
  for (const v of a.vinculos) for (const m of problemasDoVinculo(v, cargos)) if (!out.some((o) => o.chave === m.chave)) out.push(m);
  // O cargo da PESSOA fora da lista também é erro no lugar em que ela responde (o padrão segue o cargo dela).
  const foraPessoa = a.vinculos.find((v) => v.tipo === "padrao" && cargoForaDaLista(v.cargo, cargos));
  if (foraPessoa && !out.some((o) => o.chave === "resp.cargoFora"))
    out.push({
      status: "erro",
      chave: "resp.cargoFora",
      texto: `O cargo de ${foraPessoa.nome} (“${foraPessoa.cargo.trim()}”) não está na lista de Cargos e funções.`,
      rotulo: "Cargo fora da lista",
    });
  return out;
}

/** O período por extenso ("01/01/2026 a 31/01/2026", "desde 01/01/2026", "sem data inicial"). */
export function periodoVinculo(v: { inicio: string | null; fim: string | null }): string {
  const br = (d: string) => d.split("-").reverse().join("/");
  if (v.inicio && v.fim) return `${br(v.inicio)} a ${br(v.fim)}`;
  if (v.inicio) return `desde ${br(v.inicio)}`;
  return v.fim ? `até ${br(v.fim)}` : "sem data inicial";
}

/** Rótulo curto do vínculo ("Padrão desde 01/01/2026" | "Temporário 01/01/2026 a 31/01/2026"). */
export function rotuloVinculo(v: { tipo: TipoVinculo; inicio: string | null; fim: string | null }): string {
  return `${v.tipo === "padrao" ? "Padrão" : "Temporário"} ${periodoVinculo(v)}`;
}

// ---------------------------------------------------------------------------------------------------------------------
// A PLANILHA como a tela a recebe (`GET /api/admin/responsaveis`) + as regras das telas.

export type AlvoOrgao = { id: number; sigla: string; nome: string; assinaturaUnica: boolean; oculto: boolean };
/** `orgaoProprio` = a UNIDADE PRÓPRIA de um órgão que também é unidade (dual). */
export type AlvoUnidade = { id: number; codigo: string; nome: string; orgaoId: number | null; oculto: boolean; orgaoProprio?: boolean };
/** Um usuário que pode ser ligado a uma pessoa (a foto como URL). */
export type UsuarioLigavel = { id: number; nome: string; apelido: string | null; matricula: string; foto: string | null };
export type PlanilhaResponsaveis = {
  pessoas: PessoaResponsavel[];
  vinculos: VinculoComPessoa[];
  orgaos: AlvoOrgao[];
  unidades: AlvoUnidade[];
  /** Os nomes dos cargos cadastrados (Configurações → Cargos e funções), na ordem. */
  cargos: string[];
  /** Os usuários ATIVOS (ligar a pessoa a um usuário). */
  usuarios: UsuarioLigavel[];
};

/** A matrícula sem zeros à esquerda (a régua da matrícula única dos usuários). */
const semZeros = (m: string) => m.trim().replace(/^0+/, "");

/** O usuário de MESMA matrícula (só quando há UM) — a sugestão ao ligar a pessoa. */
export function usuarioSugerido(matricula: string, usuarios: readonly UsuarioLigavel[]): UsuarioLigavel | null {
  const m = semZeros(matricula);
  if (!m) return null;
  const achados = usuarios.filter((u) => semZeros(u.matricula) === m);
  return achados.length === 1 ? achados[0] : null;
}

/** O vínculo VALE pela regra do órgão? Órgão = só com assinatura única; unidade = só quando o órgão dela é "por unidade". */
export function alvoVale(alvo: { orgaoId: number | null; reparticaoId: number | null }, p: Pick<PlanilhaResponsaveis, "orgaos" | "unidades">): boolean {
  if (alvo.orgaoId != null) return p.orgaos.find((o) => o.id === alvo.orgaoId)?.assinaturaUnica ?? false;
  const u = p.unidades.find((x) => x.id === alvo.reparticaoId);
  if (!u) return false;
  return !(u.orgaoId != null && p.orgaos.find((o) => o.id === u.orgaoId)?.assinaturaUnica);
}

/** Por que NÃO se vincula aqui agora (a regra do órgão) — o mesmo texto na tela e no servidor. */
export function motivoAlvoNaoVale(alvo: { orgaoId: number | null; reparticaoId: number | null }): string {
  return alvo.orgaoId != null
    ? "Este órgão tem assinatura por unidade — vincule o responsável a cada unidade."
    : "O órgão desta unidade tem assinatura única — vincule o responsável ao órgão.";
}

export type Alvo = { orgaoId: number | null; reparticaoId: number | null };
type Config = Pick<PlanilhaResponsaveis, "orgaos" | "unidades">;

const mesmoAlvo = (a: Alvo, b: Alvo) => a.orgaoId === b.orgaoId && a.reparticaoId === b.reparticaoId;

/** A unidade PRÓPRIA (dual) de um órgão, se houver. */
function unidadePropria(orgaoId: number, p: Config) {
  return p.unidades.find((u) => u.orgaoId === orgaoId && u.orgaoProprio);
}

/**
 * O LUGAR QUE VALE para um alvo pedido — a REGRA ÚNICA do cadastro (o vínculo mora SEMPRE no alvo efetivo):
 * unidade de órgão com assinatura única → o ÓRGÃO; órgão "por unidade" → a unidade PRÓPRIA dele (órgão que também é
 * unidade), senão `null` (não há um lugar único — escolha as unidades); os demais → ele mesmo. Alvo inexistente → `null`.
 */
export function alvoQueVale(alvo: Alvo, p: Config): Alvo | null {
  if (alvo.orgaoId != null) {
    const o = p.orgaos.find((x) => x.id === alvo.orgaoId);
    if (!o) return null;
    if (o.assinaturaUnica) return { orgaoId: o.id, reparticaoId: null };
    const propria = unidadePropria(o.id, p);
    return propria ? { orgaoId: null, reparticaoId: propria.id } : null;
  }
  const u = p.unidades.find((x) => x.id === alvo.reparticaoId);
  if (!u) return null;
  const o = u.orgaoId != null ? p.orgaos.find((x) => x.id === u.orgaoId) : undefined;
  return o?.assinaturaUnica ? { orgaoId: o.id, reparticaoId: null } : { orgaoId: null, reparticaoId: u.id };
}

/** O texto de por que o vínculo VAI para outro lugar ao gravar ("Gravado em AMMT (órgão) — …"); `null` = fica onde foi pedido. */
export function avisoRedirecionado(pedido: Alvo, p: Config): string | null {
  const vale = alvoQueVale(pedido, p);
  if (!vale || mesmoAlvo(vale, pedido)) return null;
  const r = rotuloAlvo(vale, p);
  return vale.orgaoId != null
    ? `Gravado no órgão ${r.sigla} — o órgão tem assinatura única (vale para todas as unidades).`
    : `Gravado na unidade ${r.sigla} — o órgão tem assinatura por unidade (a unidade própria dele).`;
}

/** Um passo do realinhamento: MOVER o vínculo ao lugar que vale, COPIAR (o mesmo vínculo em mais uma unidade) ou APAGAR
 * (já existe um IGUAL no destino). */
export type PassoRealinhar = { tipo: "mover"; id: number; para: Alvo } | { tipo: "copiar"; id: number; para: Alvo } | { tipo: "apagar"; id: number };

export type PlanoRealinhar = {
  passos: PassoRealinhar[];
  /** Vínculos que ficam onde estão: no destino já há um período da mesma pessoa que se CRUZA (revisar à mão). */
  conflitos: { id: number; para: Alvo; motivo: string }[];
  /** Órgãos "por unidade" sem unidade própria e com VÁRIAS unidades: o ADM escolhe para quais vão os vínculos do órgão. */
  ambiguos: { orgaoId: number; unidades: number[]; vinculos: number[] }[];
};

const igualPeriodo = (a: VinculoResponsavel, b: VinculoResponsavel) =>
  a.responsavelId === b.responsavelId && a.tipo === b.tipo && (a.inicio ?? "") === (b.inicio ?? "") && (a.fim ?? "") === (b.fim ?? "");

/**
 * O REALINHAMENTO (puro): cada vínculo fora do lugar que vale (`alvoQueVale`) vai para ele — o igual já existente lá é
 * apagado, o que cruza com outro da mesma pessoa fica (conflito). O vínculo de órgão "por unidade" sem unidade própria vai
 * para a única unidade dele ou para as escolhidas em `destinos[orgaoId]` (a 1ª = mover, as demais = copiar); sem escolha
 * com várias unidades = `ambiguos`. Idempotente: com tudo no lugar, nenhum passo.
 */
export function planoRealinhar(p: Config, vinculos: readonly VinculoResponsavel[], destinos: Readonly<Record<number, readonly number[]>> = {}): PlanoRealinhar {
  const plano: PlanoRealinhar = { passos: [], conflitos: [], ambiguos: [] };
  const ordenados = [...vinculos].sort((a, b) => a.id - b.id);
  const fora: { v: VinculoResponsavel; para: Alvo[] }[] = [];
  // Onde cada vínculo fica (os que já estão no lugar entram primeiro; os movidos, à medida que o plano anda).
  const lugares: VinculoResponsavel[] = [];
  const ambiguos = new Map<number, { orgaoId: number; unidades: number[]; vinculos: number[] }>();
  for (const v of ordenados) {
    const vale = alvoQueVale(v, p);
    if (vale && mesmoAlvo(vale, v)) {
      lugares.push(v);
      continue;
    }
    if (vale) {
      fora.push({ v, para: [vale] });
      continue;
    }
    // Sem lugar único: órgão "por unidade" sem unidade própria (o alvo que não existe mais fica).
    if (v.orgaoId == null || !p.orgaos.some((o) => o.id === v.orgaoId)) continue;
    const unidades = p.unidades.filter((u) => u.orgaoId === v.orgaoId && !u.oculto).map((u) => u.id);
    const escolhidas = (destinos[v.orgaoId] ?? []).filter((id) => unidades.includes(id));
    const alvos = escolhidas.length ? escolhidas : unidades.length === 1 ? unidades : [];
    if (alvos.length) fora.push({ v, para: alvos.map((id) => ({ orgaoId: null, reparticaoId: id })) });
    else if (unidades.length) {
      const a = ambiguos.get(v.orgaoId) ?? { orgaoId: v.orgaoId, unidades, vinculos: [] };
      a.vinculos.push(v.id);
      ambiguos.set(v.orgaoId, a);
    }
  }
  for (const { v, para } of fora) {
    const livres: Alvo[] = [];
    let igual = false;
    for (const alvo of para) {
      const noDestino = lugares.filter((x) => mesmoAlvo(x, alvo) && x.responsavelId === v.responsavelId && x.tipo === v.tipo);
      if (noDestino.some((x) => igualPeriodo(x, v))) {
        igual = true;
        continue;
      }
      const cruza = vinculoConflita({ ...v, id: -1, ...alvo }, noDestino);
      if (cruza) plano.conflitos.push({ id: v.id, para: alvo, motivo: cruza });
      else livres.push(alvo);
    }
    if (livres.length) {
      plano.passos.push({ tipo: "mover", id: v.id, para: livres[0] });
      lugares.push({ ...v, ...livres[0] });
      for (const alvo of livres.slice(1)) {
        plano.passos.push({ tipo: "copiar", id: v.id, para: alvo });
        lugares.push({ ...v, ...alvo });
      }
      // O que conflitou num destino mas foi a outro já está resolvido.
      plano.conflitos = plano.conflitos.filter((c) => c.id !== v.id);
    } else if (igual && !plano.conflitos.some((c) => c.id === v.id)) plano.passos.push({ tipo: "apagar", id: v.id });
  }
  plano.ambiguos = [...ambiguos.values()];
  return plano;
}

/** Uma opção do "Onde responde": `grupo` = o órgão das unidades (o cabeçalho da lista). */
export type OpcaoAlvo = { valor: string; rotulo: string; detalhe: string; grupo?: string };
export type AlvosParaVincular = {
  /** Os órgãos com assinatura ÚNICA (o vínculo vale para todas as unidades deles). */
  orgaos: OpcaoAlvo[];
  /** As unidades dos órgãos "por unidade", agrupadas pelo órgão (na ordem dos órgãos). */
  unidades: OpcaoAlvo[];
  /** Por que os demais lugares não aparecem (o "(?)"). */
  fora: string[];
};

/** Os lugares em que se pode VINCULAR agora, separados em ÓRGÃOS e UNIDADES (só os que valem pela regra; sem os
 * ocultos), opcionalmente só os de UM órgão. */
export function alvosParaVincular(p: Config, orgaoId?: number): AlvosParaVincular {
  const out: AlvosParaVincular = { orgaos: [], unidades: [], fora: [] };
  for (const o of p.orgaos) {
    if (o.oculto || (orgaoId != null && o.id !== orgaoId)) continue;
    const dele = p.unidades.filter((u) => u.orgaoId === o.id && !u.oculto);
    if (o.assinaturaUnica) {
      const n = dele.filter((u) => !u.orgaoProprio).length;
      out.orgaos.push({
        valor: `o${o.id}`,
        rotulo: `${o.sigla} — ${o.nome}`,
        detalhe: n ? `Assinatura única · vale para ${n} unidade${n === 1 ? "" : "s"}` : "Assinatura única",
      });
      if (dele.length) out.fora.push(`Unidades de ${o.sigla}: o órgão tem assinatura única — escolha o órgão.`);
    } else {
      const grupo = `${o.sigla} — ${o.nome}`;
      for (const u of dele)
        out.unidades.push({
          valor: `u${u.id}`,
          rotulo: u.orgaoProprio ? `${u.codigo} — ${u.nome} (o próprio órgão)` : `${u.codigo} — ${u.nome}`,
          detalhe: `Unidade · ${o.sigla}`,
          grupo,
        });
      out.fora.push(
        dele.length
          ? `Órgão ${o.sigla}: assinatura por unidade — escolha ${dele.some((u) => u.orgaoProprio) ? "a unidade do próprio órgão ou " : ""}as unidades.`
          : `Órgão ${o.sigla}: assinatura por unidade e sem unidades cadastradas.`,
      );
    }
  }
  return out;
}

export type EstadoVinculo = "vigente" | "agendado" | "encerrado" | "inativo";

/** O estado do vínculo hoje pelo período (o padrão sem fim segue em aberto; sem início — dado antigo — vale desde
 * sempre); o padrão vigente fica INATIVO enquanto um temporário do alvo vale. */
export function estadoDoVinculo(v: VinculoResponsavel, doAlvo: readonly VinculoResponsavel[], hoje: string): EstadoVinculo {
  const vale = (t: VinculoResponsavel) => !!t.inicio && !!t.fim && t.inicio <= hoje && hoje <= t.fim;
  if (v.tipo === "temporario") return vale(v) ? "vigente" : v.inicio && hoje < v.inicio ? "agendado" : "encerrado";
  if (v.inicio && hoje < v.inicio) return "agendado";
  if (v.fim && hoje > v.fim) return "encerrado";
  return doAlvo.some((t) => t.tipo === "temporario" && vale(t)) ? "inativo" : "vigente";
}

export const ROTULO_ESTADO_VINCULO: Record<EstadoVinculo, string> = {
  vigente: "Vigente",
  agendado: "Agendado",
  encerrado: "Encerrado",
  inativo: "Inativo (temporário vigente)",
};

/** Conferência de uma UNIDADE: os responsáveis dela (quando o órgão é "por unidade"). */
export function conferenciaDaUnidade(
  u: { id: number },
  orgaoUnico: boolean,
  grupos: Map<string, VinculoComPessoa[]>,
  hoje: string,
  cargos?: readonly string[],
): MensagemConferencia[] {
  return problemasDoAlvo({ valem: !orgaoUnico, vinculos: grupos.get(`u${u.id}`) ?? [], ehOrgao: false }, hoje, cargos);
}

/** Conferência de um ÓRGÃO: os responsáveis dele (assinatura única) ou quantas unidades VISÍVEIS estão sem responsável. */
export function conferenciaDoOrgao(
  o: { id: number; assinaturaUnica: boolean },
  unidades: readonly { id: number; oculto: boolean }[],
  grupos: Map<string, VinculoComPessoa[]>,
  hoje: string,
  cargos?: readonly string[],
): MensagemConferencia[] {
  const msgs = problemasDoAlvo({ valem: o.assinaturaUnica, vinculos: grupos.get(`o${o.id}`) ?? [], ehOrgao: true }, hoje, cargos);
  if (!o.assinaturaUnica) {
    const sem = unidades.filter((u) => !u.oculto && conferenciaDaUnidade(u, false, grupos, hoje).some((m) => m.chave === "resp.semVigente")).length;
    if (sem)
      msgs.push({ status: "atencao", chave: "resp.unidadesSem", texto: `${sem} unidade(s) sem responsável vigente.`, rotulo: `Unidades sem responsável (${sem})` });
  }
  return msgs;
}

/** Os nomes dos responsáveis VIGENTES de um alvo (a célula da tabela) e se algum é temporário. */
export function vigentesDoAlvo(vinculos: readonly VinculoComPessoa[], hoje: string): { nomes: string[]; temporario: boolean } {
  const vig = responsaveisVigentes(responsaveisDosVinculos(vinculos), hoje);
  return { nomes: vig.map((v) => v.resp.nome), temporario: vig.some((v) => v.tipo === "temporario") };
}

/** Conferência de uma PESSOA na planilha: os problemas dela e dos vínculos + o vínculo num alvo que não vale. */
export function conferenciaDaPessoa(p: PessoaResponsavel, planilha: PlanilhaResponsaveis, hoje: string): MensagemConferencia[] {
  const dela = planilha.vinculos.filter((v) => v.responsavelId === p.id);
  const msgs = problemasDaPessoa(p, dela, planilha.pessoas, hoje, planilha.cargos);
  if (dela.some((v) => !alvoVale(v, planilha)))
    msgs.push({
      status: "atencao",
      chave: "resp.naoValem",
      texto: "Vinculada onde não vale pela regra de assinatura do órgão (única × por unidade).",
      rotulo: "Vínculo sem efeito",
    });
  return msgs;
}

/** O nome de um alvo ("SMS — Secretaria…" / "SMS — Secretaria… · PMRV") e se é órgão. */
export function rotuloAlvo(alvo: { orgaoId: number | null; reparticaoId: number | null }, p: Pick<PlanilhaResponsaveis, "orgaos" | "unidades">): { sigla: string; texto: string; orgao: boolean } {
  if (alvo.orgaoId != null) {
    const o = p.orgaos.find((x) => x.id === alvo.orgaoId);
    return { sigla: o?.sigla ?? `#${alvo.orgaoId}`, texto: o ? `${o.sigla} — ${o.nome}` : `Órgão #${alvo.orgaoId}`, orgao: true };
  }
  const u = p.unidades.find((x) => x.id === alvo.reparticaoId);
  const o = u?.orgaoId != null ? p.orgaos.find((x) => x.id === u.orgaoId) : undefined;
  return { sigla: u?.codigo ?? `#${alvo.reparticaoId}`, texto: u ? `${u.codigo} — ${u.nome}${o ? ` · ${o.sigla}` : ""}` : `Unidade #${alvo.reparticaoId}`, orgao: false };
}

/** `o<id>` | `u<id>` → o alvo (ou `null`). */
export function alvoDoValor(valor: string): { orgaoId: number | null; reparticaoId: number | null } | null {
  const m = /^([ou])(\d+)$/.exec(valor);
  if (!m) return null;
  const id = Number(m[2]);
  return m[1] === "o" ? { orgaoId: id, reparticaoId: null } : { orgaoId: null, reparticaoId: id };
}
