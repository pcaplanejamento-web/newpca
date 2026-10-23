import { textoDoEvento } from "@/lib/acessos-core";
import { exigirUsuarioLivre } from "@/lib/api-auth";
import { eventoProtecaoSchema } from "@/lib/eventos-validation";
import { ok, parseCorpo } from "@/lib/http";
import { getConfigProtecao } from "@/lib/protecao";
import { contarTentativa } from "@/lib/seguranca-acesso";
import { registrarEventoProtecao } from "@/lib/seguranca-alertas";
import { resumoNavegador } from "@/lib/seguranca-core";

export const dynamic = "force-dynamic";

/** Registra no usuário uma CÓPIA, CAPTURA ou IMPRESSÃO (Proteção de dados → "Registrar…"). Fora da auditoria e da versão
 * dos dados; best-effort — nunca atrapalha a tela. */
export async function POST(req: Request) {
  const g = await exigirUsuarioLivre();
  if ("erro" in g) return g.erro;
  const p = await parseCorpo(eventoProtecaoSchema, req);
  if ("resp" in p) return p.resp;
  if (!(await getConfigProtecao()).registrar) return ok({ gravado: false });
  if ((await contarTentativa("eventosProtecao", String(g.u.id))) > 0) return ok({ gravado: false });
  const t = textoDoEvento(p.data.texto);
  await registrarEventoProtecao({
    usuarioId: g.u.id,
    em: new Date().toISOString(),
    tipo: p.data.tipo,
    rota: p.data.rota,
    tela: p.data.tela,
    itens: p.data.itens,
    texto: p.data.tipo === "copia" ? t.texto : null,
    tamanho: t.tamanho,
    origem: p.data.origem,
    navegador: resumoNavegador(req.headers.get("user-agent")),
    ip: req.headers.get("cf-connecting-ip"),
  });
  return ok({ gravado: true });
}
