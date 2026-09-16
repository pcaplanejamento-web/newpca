import { exigirEditor } from "@/lib/api-auth";
import { codigosEmConflito } from "@/lib/catalogo";
import { verificarCatalogoSchema } from "@/lib/catalogo-validation";
import { ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Pré-checagem de conflito de CÓDIGO (unicidade global) antes de importar — permite o
 * preview mostrar os conflitos e bloquear o botão. Devolve os códigos já presentes em
 * OUTRO catálogo (`conflitos`) e os repetidos no PRÓPRIO arquivo (`duplicadosNoArquivo`).
 * O servidor reconfere no `POST /api/catalogo` (fonte da verdade). Só editor.
 */
export async function POST(req: Request) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;

  const p = await parseCorpo(verificarCatalogoSchema, req);
  if ("resp" in p) return p.resp;
  const { codigos, catalogoId } = p.data;

  const conflitos = await codigosEmConflito(codigos, catalogoId);

  const vistos = new Set<string>();
  const dups = new Set<string>();
  for (const c of codigos) {
    const k = c.trim();
    if (!k) continue;
    if (vistos.has(k)) dups.add(k);
    else vistos.add(k);
  }

  return ok({ conflitos, duplicadosNoArquivo: [...dups] });
}
