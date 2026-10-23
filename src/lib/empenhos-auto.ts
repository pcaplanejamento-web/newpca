import { registrarAuditoria } from "./auditoria";
import { listarApisCenti, registrarLeitura } from "./centi-apis";
import { type ApiCenti, importavel } from "./centi-apis-core";
import { diaUtil, feriadosNoIntervalo } from "./calendario-core";
import { getDb } from "./db";
import { criarLote, getLote, listarPassos, loteEmAndamento, ultimaLeituraPorAno } from "./empenhos";
import {
  anoDaVez,
  anosDaApi,
  apiNaHora,
  CONDUTOR_AUTO,
  errosSeguidos,
  LEITOR_EMPENHOS,
  MAX_ERROS_AUTO,
  PAGINAS_POR_PASSADA,
  proximoPedido,
  QUEM_AUTO,
  rotuloPeriodo,
  usaPeriodo,
} from "./empenhos-core";
import { concluirLoteEmpenhos, fecharLoteEmpenhos, lerPaginaDoLote, PedidoInvalido } from "./empenhos-importacao";
import { comandoConduzir, comandosFecharLote } from "./empenhos-sql";
import { listarFeriados } from "./feriados";
import { dataIsoBrasilia } from "./format";
import { horaAgoraBrasilia } from "./tarefas-core";

/**
 * A ATUALIZAÇÃO AUTOMÁTICA dos empenhos (o cron chama a cada 5 min): para cada API LIGADA no cadastro (desligadas por
 * padrão), continua o lote que está lendo ou, na hora certa (horário, dias úteis, frequência), começa o do ano da vez — e
 * lê poucas páginas por passada, com a MESMA leitura e a MESMA conferência da importação manual. Nunca aceita uma QUEDA
 * suspeita sozinha (o lote fecha como parcial — a pessoa confirma numa importação manual) e nunca disputa o lote com uma
 * aba (a trava de quem conduz).
 */
export async function atualizarEmpenhosAuto(agora = new Date()): Promise<{ api: string; situacao: string }[]> {
  const apis = (await listarApisCenti()).filter((a) => a.ativa && a.implementada && importavel(a.chave));
  if (!apis.length) return [];
  const hoje = dataIsoBrasilia(agora.toISOString());
  const util = apis.some((a) => a.diasUteis) ? diaUtil(hoje, feriadosNoIntervalo(await listarFeriados(), hoje, hoje)) : true;
  const instante = { ms: agora.getTime(), hora: horaAgoraBrasilia(agora), diaUtil: util, ano: Number(hoje.slice(0, 4)) };
  const r: { api: string; situacao: string }[] = [];
  for (const api of apis) {
    try {
      r.push({ api: api.chave, situacao: await umaApi(api, instante) });
    } catch (e) {
      console.error(`[cron empenhos] ${api.chave}:`, (e as Error).message);
      r.push({ api: api.chave, situacao: `erro: ${(e as Error).message}` });
    }
  }
  return r;
}

async function umaApi(api: ApiCenti, agora: { ms: number; hora: string; diaUtil: boolean; ano: number }): Promise<string> {
  const db = getDb();
  let lote = await loteEmAndamento(api.chave);
  if (!lote) {
    if (!apiNaHora(api, agora)) return "fora da hora";
    const ano = anoDaVez(anosDaApi(agora.ano, api.anos), await ultimaLeituraPorAno(api.chave));
    lote = await criarLote(api.chave, ano, QUEM_AUTO, CONDUTOR_AUTO);
    await registrarAuditoria({ usuario: null, acao: "importar", entidade: "centi_api", entidadeId: api.id, resumo: `${api.nome} ${ano}: atualização automática começou` });
  }
  if (lote.leitor !== LEITOR_EMPENHOS) {
    // Um lote começado por uma versão anterior do leitor nunca é terminado por outra: a automática encerra o dela.
    if (lote.iniciadoPor !== QUEM_AUTO) return "importação manual de versão anterior em andamento";
    await db.batch(comandosFecharLote(db, lote.id, "cancelado", "Começou com uma versão anterior do leitor.") as never);
    return "lote de versão anterior encerrado";
  }
  for (let i = 0; i < PAGINAS_POR_PASSADA; i++) {
    const [conduz] = await comandoConduzir(db, lote.id, CONDUTOR_AUTO);
    if (!conduz) return "conduzida por uma aba";
    const passos = await listarPassos(lote.id);
    const pedido = proximoPedido(lote.ano, passos, usaPeriodo(api.parametros));
    if (!pedido) return concluir(api, lote);
    if (errosSeguidos(passos, pedido) >= MAX_ERROS_AUTO) {
      await fecharLoteEmpenhos(api, lote, "falhou", `${rotuloPeriodo(pedido.periodo)}, página ${pedido.pagina}: ${MAX_ERROS_AUTO} erros seguidos — a atualização automática desistiu.`);
      return "falhou (erros seguidos)";
    }
    let res: Awaited<ReturnType<typeof lerPaginaDoLote>>;
    try {
      res = await lerPaginaDoLote(api, lote, pedido.periodo, pedido.pagina);
    } catch (e) {
      if (!(e instanceof PedidoInvalido)) throw e;
      await fecharLoteEmpenhos(api, lote, "falhou", e.message);
      return "falhou (pedido inválido)";
    }
    if (res.erro && !res.dividir) {
      // A Centi respondeu algo que não é a lista: repetir não adianta. Erro de rede: tenta de novo na próxima passada.
      if (res.erro.tipo === "resposta") {
        await fecharLoteEmpenhos(api, lote, "falhou", res.erro.mensagem);
        return "falhou (resposta inválida)";
      }
      return "erro de rede — tenta na próxima passada";
    }
    const atual = await getLote(lote.id, api.chave);
    if (!atual || atual.estado !== "lendo") return "encerrado no meio";
    lote = atual;
  }
  return `lendo ${lote.ano}`;
}

async function concluir(api: ApiCenti, lote: NonNullable<Awaited<ReturnType<typeof getLote>>>): Promise<string> {
  const c = await concluirLoteEmpenhos(api, lote, { aceitarQueda: false, usuario: null });
  if (c.estado !== "queda") return c.estado;
  // A QUEDA nunca passa sozinha: o lote fecha como parcial e a pessoa confirma numa importação manual.
  const db = getDb();
  const motivo = `${c.queda} Confirme numa importação manual (a atualização automática não aceita uma queda sozinha).`;
  await db.batch(comandosFecharLote(db, lote.id, "parcial", motivo) as never);
  await registrarLeitura(api.id, "parcial", lote.unicos + lote.recusados, lote.totalInformado);
  await registrarAuditoria({ usuario: null, acao: "importar", entidade: "centi_api", entidadeId: api.id, resumo: `${api.nome} ${lote.ano} (atualização automática): PARCIAL — ${motivo}` });
  return "parcial (queda)";
}
