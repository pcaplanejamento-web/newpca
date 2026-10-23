import { exigirAdmin } from "@/lib/api-auth";
import { baixarSeguro } from "@/lib/busca-segura";
import { orgaosDoCadastro } from "@/lib/centi-apis";
import { lerParametros, montarCorpo, motivoApiInvalida, pedidosDoAno, type ResultadoTeste, resumoResposta, urlDaApi, varsDoTeste } from "@/lib/centi-apis-core";
import { testarCentiApiSchema } from "@/lib/centi-apis-validation";
import { erro, ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Até 12 MB de resposta (o teste lê a 1ª semana do ano — em 2026, 5,7 MB) e 30 s. */
const MAX_BYTES = 12_000_000;
const TEMPO_MS = 30_000;

/**
 * TESTA uma API da Centi com a edição EM CURSO (ainda não salva): faz SÓ o pedido escolhido do ano (a 1ª página) e
 * devolve o que veio — status, tempo, quantos registros, o total informado, os campos e uma amostra. NADA é gravado
 * (nem o cadastro, nem os dados, nem a auditoria — é uma leitura).
 */
export async function POST(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const p = await parseCorpo(testarCentiApiSchema, req);
  if ("resp" in p) return p.resp;
  const { edicao, ano, pedido } = p.data;
  const cadastro = await orgaosDoCadastro();
  const motivo = motivoApiInvalida({ ...edicao, ativa: false }, false, cadastro);
  if (motivo) return erro(motivo, 422);
  const params = lerParametros(edicao.parametros);
  const vars = pedidosDoAno(edicao, ano, cadastro)[pedido];
  if (!params.ok || !vars) return erro("Esse pedido não existe para a configuração atual.", 422);
  const corpo = montarCorpo(params.valor, varsDoTeste(vars));
  const url = urlDaApi(edicao);
  const inicio = Date.now();
  try {
    const r = await baixarSeguro(url, { accept: "application/json", maxBytes: MAX_BYTES, quem: "A API da Centi", tempoMs: TEMPO_MS, post: JSON.stringify(corpo), comErro: true });
    const resumo = resumoResposta(r.texto);
    const resultado: ResultadoTeste = {
      ok: r.status >= 200 && r.status < 300 && !resumo.mensagem?.startsWith("A resposta não"),
      status: r.status,
      ms: Date.now() - inicio,
      url,
      corpo,
      ...resumo,
      mensagem: r.status >= 300 ? `A API respondeu ${r.status}. ${resumo.mensagem ?? ""}`.trim() : resumo.mensagem,
    };
    return ok({ resultado });
  } catch (e) {
    const resultado: ResultadoTeste = {
      ok: false,
      status: 0,
      ms: Date.now() - inicio,
      url,
      corpo,
      itens: 0,
      total: null,
      campos: [],
      amostra: [],
      mensagem: e instanceof Error ? e.message : "Não foi possível acessar a API.",
    };
    return ok({ resultado });
  }
}
