import type { Acesso } from "./acesso";
import { podeTela } from "./acesso";
import { getDb } from "./db";
import { chaveEscopoEmpenhos, type EscopoEmpenhos } from "./empenhos-tela-core";
import { consultaAnosExecucao, consultaMetaExecucao, consultaVersaoExecucao, type FontesSql, motivoDoErro, textoPacoteExecucao } from "./execucao-sql";
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
/** A leitura do pacote nunca fechou na mesma versão (importações concluindo no meio). */
class DadosMudando extends Error {}

/** O último pacote BOM de cada chave — servido quando a versão muda em todas as leituras (em geral o MESMO texto do memo). */
const ultimoBom = new Map<string, string>();
const MAX_ULTIMOS = 2;
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

/** O texto JSON da resposta (`{"ok":true,"pacote":…}`); `null` = uma importação concluída no meio impediu ler (e não há pacote anterior desta chave); outra falha LANÇA. */
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
  const extra = `,"anos":${JSON.stringify(anos)},"disponiveis":${JSON.stringify(disponiveis)},"fontes":${JSON.stringify(fontes)}`;
  const chave = `${anos.join(",")}|${fontes.liquidacoes ? 1 : 0}${fontes.pagamentos ? 1 : 0}|${chaveEscopoEmpenhos(escopo)}`;
  const texto = await memo
    .obter(chave, `${ver}|${dados.dados}`, async () => {
      const t = await textoPacoteExecucao(db, anos, escopo, fontes, extra);
      if (t == null) throw new DadosMudando();
      return t;
    })
    .catch((e: unknown) => {
      // Uma importação concluída no meio de TODAS as leituras: vale o último pacote bom desta chave (melhor que a tela vazia).
      if (e instanceof DadosMudando) return ultimoBom.get(chave) ?? null;
      // Qualquer outra falha é REAL (limite do D1, consulta): vai aos logs e à tela com o motivo — nunca "atualizando".
      console.error(`[execucao] falha ao montar o pacote (anos ${anos.join(",")}): ${motivoDoErro(e)}`, e);
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
