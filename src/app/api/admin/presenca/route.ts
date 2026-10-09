import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { ok, parseCorpo } from "@/lib/http";
import { getConfigPresenca, gravarConfigPresenca } from "@/lib/presenca";
import { configPresencaSchema } from "@/lib/presenca-validation";

export const dynamic = "force-dynamic";

// Configurações → Presença (ADM): mostrar quem do grupo está online, o "ausente" e a opção de aparecer invisível. Mesma
// linha `configuracoes` id=1 (chave `presenca`) — as chaves irmãs ficam.

export async function GET() {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  return ok({ presenca: await getConfigPresenca({ fresco: true }) });
}

const ROTULO = { ativo: "mostrar quem está online", ausente: "mostrar ausentes", invisivel: "permitir aparecer invisível", atividade: "mostrar onde cada pessoa está" } as const;

export async function PATCH(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const p = await parseCorpo(configPresencaSchema, req);
  if ("resp" in p) return p.resp;
  const antes = await getConfigPresenca({ fresco: true });
  const presenca = await gravarConfigPresenca(p.data, g.u.id);
  const diff = (Object.keys(ROTULO) as (keyof typeof ROTULO)[]).filter((k) => antes[k] !== presenca[k]).map((k) => `${ROTULO[k]} ${presenca[k] ? "ligado" : "desligado"}`);
  if (antes.inativoMin !== presenca.inativoMin) diff.push(`ausente após ${presenca.inativoMin} min`);
  await registrarAuditoria({ usuario: g.u, acao: "editar", entidade: "configuracao", entidadeId: 1, resumo: `Presença (ADM): ${diff.join("; ") || "sem mudança"}` });
  return ok({ presenca });
}
