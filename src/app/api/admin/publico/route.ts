import { z } from "zod";
import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { ok, parseCorpo } from "@/lib/http";
import { getConfigPublico, gravarConfigPublico } from "@/lib/publico";
import { ABAS_PUBLICAS, diffPublico, MENUS_PUBLICO } from "@/lib/publico-core";

export const dynamic = "force-dynamic";

// Configurações → Tela pública (ADM): as abas do PCA publicadas na consulta sem login. Mesma linha `configuracoes` id=1
// (chave `publico`) — as chaves irmãs ficam. Só as da lista fechada são aceitas (Mesa/Importação/Configuração nunca).
const publicoSchema = z.strictObject({ abas: z.array(z.enum(ABAS_PUBLICAS)).max(ABAS_PUBLICAS.length), menu: z.enum(MENUS_PUBLICO), cartoesSoImagem: z.boolean() });

export async function GET() {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  return ok({ publico: await getConfigPublico({ fresco: true }) });
}

export async function PATCH(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const p = await parseCorpo(publicoSchema, req);
  if ("resp" in p) return p.resp;
  const antes = await getConfigPublico({ fresco: true });
  const publico = await gravarConfigPublico(p.data, g.u.id);
  await registrarAuditoria({ usuario: g.u, acao: "editar", entidade: "configuracao", entidadeId: 1, resumo: `Tela pública (ADM): ${diffPublico(antes, publico)}` });
  return ok({ publico });
}
