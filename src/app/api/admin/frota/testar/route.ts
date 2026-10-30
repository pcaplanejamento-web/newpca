import { exigirAdmin } from "@/lib/api-auth";
import { getConfigFrota, clienteDaConfig, gravarConfigFrota, listarContratos } from "@/lib/frota";
import { erro, ok } from "@/lib/http";
import { ErroVolus } from "@/lib/volus-api";
import { produtoProvavel } from "@/lib/volus-core";

export const dynamic = "force-dynamic";

/** TESTA a credencial na Vólus: autentica e lista os contratos (empresas) que ela alcança — os que faltam no cadastro voltam
 * como sugestão. Nada de transação é gravado. */
export async function POST() {
  const a = await exigirAdmin();
  if ("erro" in a) return a.erro;
  const cfg = await getConfigFrota();
  const c = await clienteDaConfig(cfg);
  if (!c.cliente) return erro(c.erro, 422);
  try {
    const t = await c.cliente.autenticar(true);
    // A configuração RELIDA agora (o teste leva segundos — uma gravação feita no meio nunca é desfeita): só o resultado do
    // teste muda, e só se a credencial testada ainda é a gravada.
    const atual = await getConfigFrota();
    if (atual.clientId === cfg.clientId && atual.clientSecret === cfg.clientSecret) await gravarConfigFrota({ ...atual, testadoEm: new Date().toISOString(), empresasNoTeste: t.empresas.length }, a.u.id);
    const cadastrados = new Set((await listarContratos()).map((x) => x.codigo));
    return ok({
      empresas: t.empresas.map((e) => ({ ...e, cadastrado: cadastrados.has(e.id), produto: produtoProvavel(e.id) })),
    });
  } catch (e) {
    return erro(e instanceof ErroVolus ? e.message : "Falha ao falar com a Vólus.", 502);
  }
}
