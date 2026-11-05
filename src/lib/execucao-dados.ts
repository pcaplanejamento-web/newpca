import type { Acesso } from "./acesso";
import { podeTela } from "./acesso";
import { getDb } from "./db";
import { chaveEscopoEmpenhos, type EscopoEmpenhos } from "./empenhos-tela-core";
import {
  consultaAnosExecucao,
  consultaMetaExecucao,
  consultaPacotesEmUso,
  consultaVersaoExecucao,
  comandoLimparPacotes,
  erroDeSobrecarga,
  type FontesSql,
  lerPedidoPacote,
  motivoDoErro,
  PacoteEmMontagem,
  type PedidoPacote,
  pacotePronto,
} from "./execucao-sql";
import { sinalizarBancoOcupado } from "./importacoes-cron";
import { avisarFalhaSistema } from "./notificacoes";
import { depoisDaResposta } from "./segundo-plano";
import { proximaAtualizacaoMs, textoIntervalo } from "./empenho-cards-core";
import type { MetaExec } from "./execucao-dash-core";
import { getConfigImportacoes } from "./importacoes-config";
import { criarMemoVersao } from "./memo-versao-core";
import { versaoDados } from "./versao-dados";

/**
 * Os dados do DASHBOARD DA EXECUÇÃO no D1. O pacote (o texto montado pelo banco — `execucao-sql.ts`) fica na MEMÓRIA do
 * Worker enquanto a versão for a mesma: a última importação promovida de qualquer card + os vínculos + os cards
 * (`consultaVersaoExecucao`) e a versão `dados` do sistema (renomear uma unidade ou um órgão muda os rótulos). A chave leva
 * os anos, as etapas que a pessoa vê e o escopo — nunca a pessoa.
 */
// Até 4 pacotes (cada um tem alguns MB — a memória do Worker é de 128 MB, junto com o resto do sistema).
const memo = criarMemoVersao({ max: 4, ttlMs: 2 * 60 * 60_000, agora: () => Date.now() });
/** O último pacote BOM de cada chave — servido quando o D1 está sobrecarregado (em geral o MESMO texto do memo). */
const ultimoBom = new Map<string, string>();
const MAX_ULTIMOS = 2;
/** Depois de uma SOBRECARGA do D1, a chave fica sem ir ao banco por este tempo (repetir na hora só piora). */
const ESPERA_SOBRECARGA_MS = 30_000;
const sobrecarga = new Map<string, number>();
// Os ANOS do escopo (percorre os empenhos): lidos UMA vez por versão e escopo, nunca a cada pedido.
const memoAnos = criarMemoVersao({ max: 24, ttlMs: 2 * 60 * 60_000, agora: () => Date.now() });

/** Até quantos anos de uma vez (o volume do pacote). */
export const MAX_ANOS_EXECUCAO = 5;

/** As etapas que a pessoa vê (a tela de cada uma); sem Empenhos, nada. */
export function fontesDoAcesso(acesso: Acesso): { empenhos: boolean } & FontesSql {
  return {
    empenhos: podeTela(acesso, "empenhos").visualizar,
    liquidacoes: podeTela(acesso, "liquidacoes").visualizar,
    pagamentos: podeTela(acesso, "pagamentos").visualizar,
  };
}

/** Os anos pedidos (`2025,2026`) que existem; nenhum válido = o mais recente. */
export function anosPedidos(texto: string | null, disponiveis: readonly number[]): number[] {
  const pedidos = [...new Set((texto ?? "").split(",").map((x) => Number(x.trim())))].filter((a) => Number.isInteger(a) && disponiveis.includes(a));
  const l = pedidos.length ? pedidos : disponiveis.slice(0, 1);
  return l.sort((a, b) => b - a).slice(0, MAX_ANOS_EXECUCAO);
}

/** Os campos que vão junto com o pacote (anos pedidos, os disponíveis e as etapas). */
const extraDoPacote = (p: PedidoPacote, disponiveis: readonly number[]) => `,"anos":${JSON.stringify(p.anos)},"disponiveis":${JSON.stringify(disponiveis)},"fontes":${JSON.stringify(p.fontes)}`;
/** A chave do pacote: os anos, as etapas e o escopo — nunca a pessoa. */
const chaveDoPacote = (p: PedidoPacote) => `${p.anos.join(",")}|${p.fontes.liquidacoes ? 1 : 0}${p.fontes.pagamentos ? 1 : 0}|${chaveEscopoEmpenhos(p.escopo)}`;

/** Pacotes abertos nas últimas 24 h são remontados quando a versão muda; sem uso há 7 dias, saem. */
const DIA_MS = 24 * 3_600_000;

/**
 * PRÉ-MONTAGEM (o cron dos e-mails e o fim de cada promoção de lote): os pacotes que alguém abriu nas últimas 24 h e cuja
 * versão mudou são montados e GUARDADOS antes de a pessoa pedir — a tela só lê. No máximo `max` por chamada (o limite de
 * consultas por execução); cada um com a trava de `pacotePronto` (nunca dois montando a mesma chave). Nunca lança.
 */
export async function premontarExecucao(max = 2): Promise<number> {
  const db = getDb();
  const agora = new Date();
  let feitos = 0;
  try {
    await db.batch([comandoLimparPacotes(db, new Date(agora.getTime() - 7 * DIA_MS).toISOString(), agora.toISOString())]);
    const [ver, dados, usados] = await Promise.all([consultaVersaoExecucao(db), versaoDados().catch(() => ({ dados: "" })), consultaPacotesEmUso(db, new Date(agora.getTime() - DIA_MS).toISOString())]);
    const versao = `${ver}|${dados.dados}`;
    for (const u of usados) {
      if (feitos >= max) break;
      if (u.versao === versao) continue;
      const pedido = lerPedidoPacote(u.pedido);
      if (!pedido || chaveDoPacote(pedido) !== u.chave) continue;
      const disponiveis = await memoAnos.obter(chaveEscopoEmpenhos(pedido.escopo), ver, () => consultaAnosExecucao(db, pedido.escopo));
      feitos++;
      await pacotePronto(db, u.chave, versao, pedido, extraDoPacote(pedido, disponiveis), agora).catch((e: unknown) => {
        if (!(e instanceof PacoteEmMontagem)) console.warn(`[execucao] pré-montagem: ${motivoDoErro(e)}`);
      });
    }
  } catch (e) {
    console.warn(`[execucao] pré-montagem: ${motivoDoErro(e)}`);
  }
  return feitos;
}

/** A sobrecarga do D1: a chave pausa (o último bom) e a importação automática CEDE a vez às telas. */
function cederAoUso(chave: string, e: unknown) {
  console.warn(`[execucao] D1 sobrecarregado: ${motivoDoErro(e)}`);
  sobrecarga.set(chave, Date.now() + ESPERA_SOBRECARGA_MS);
  depoisDaResposta(sinalizarBancoOcupado(), "importacoes");
}

/** O texto JSON da resposta (`{"ok":true,"pacote":…}`); `null` = o D1 está sobrecarregado e não há pacote anterior desta chave; outra falha LANÇA. */
export async function respostaExecucao(anosTexto: string | null, fontes: FontesSql, escopo: EscopoEmpenhos): Promise<string | null> {
  const db = getDb();
  // A versão dos dados nunca derruba a resposta: sem ela, o pacote vale só pela versão das importações.
  const [metaSql, ver, dados, cfg] = await Promise.all([consultaMetaExecucao(db), consultaVersaoExecucao(db), versaoDados().catch(() => ({ dados: "" })), getConfigImportacoes()]);
  // O INTERVALO MÍNIMO: a etapa só fica travada quando NENHUM card dela pode começar outra importação (a mais antiga das
  // concluídas ainda dentro do intervalo e nenhum card livre).
  const meta: MetaExec[] = metaSql.map(({ livres, ultimaCompleta, ...m }) => {
    const ate = livres > 0 ? null : proximaAtualizacaoMs(ultimaCompleta, cfg.intervaloMin);
    return { ...m, intervalo: ate ? { ate: new Date(ate).toISOString(), texto: textoIntervalo(ate, cfg.intervaloMin) } : null };
  });
  const disponiveis = await memoAnos.obter(chaveEscopoEmpenhos(escopo), ver, () => consultaAnosExecucao(db, escopo));
  const anos = anosPedidos(anosTexto, disponiveis);
  const pedido: PedidoPacote = { anos, fontes, escopo };
  const extra = extraDoPacote(pedido, disponiveis);
  const chave = chaveDoPacote(pedido);
  const versao = `${ver}|${dados.dados}`;
  const ultimo = ultimoBom.get(chave);
  let texto: string | null;
  if ((sobrecarga.get(chave) ?? 0) > Date.now()) texto = ultimo ?? null;
  else
    texto = await memo
      .obter(chave, versao, async () => {
        const t = await pacotePronto(db, chave, versao, pedido, extra);
        sobrecarga.delete(chave);
        return t;
      })
      .catch((e: unknown) => {
        // Outra execução está montando a versão nova (ou o banco ficou sobrecarregado no meio): o pacote ANTERIOR guardado.
        if (e instanceof PacoteEmMontagem) {
          if (e.cause) cederAoUso(chave, e.cause);
          return e.anterior;
        }
        // D1 SOBRECARREGADO (importações rodando): o último pacote bom desta chave e uma pausa antes de pedir de novo.
        if (erroDeSobrecarga(e)) {
          cederAoUso(chave, e);
          if (!ultimo) depoisDaResposta(avisarFalhaSistema("banco", `O banco ficou sobrecarregado ao abrir a Execução e não havia dados anteriores para mostrar: ${motivoDoErro(e)}`, "/painel/execucao"), "notificacao");
          return ultimo ?? null;
        }
        // Qualquer outra falha é REAL (tamanho, consulta): vai aos logs, à tela com o motivo e ao sino dos ADMs.
        console.error(`[execucao] falha ao montar o pacote (anos ${anos.join(",")}): ${motivoDoErro(e)}`, e);
        depoisDaResposta(avisarFalhaSistema("execucao", `Os dados da Execução não foram montados: ${motivoDoErro(e)}`, "/painel/execucao"), "notificacao");
        throw e;
      });
  if (texto == null) return null;
  ultimoBom.delete(chave);
  ultimoBom.set(chave, texto);
  while (ultimoBom.size > MAX_ULTIMOS) {
    const primeira = ultimoBom.keys().next().value;
    if (primeira === undefined) break;
    ultimoBom.delete(primeira);
  }
  // A situação dos cards (importação em andamento, erro) muda sem dado novo: vai à parte, lida a cada pedido.
  return `{"ok":true,"pacote":${texto},"meta":${JSON.stringify(meta)}}`;
}
