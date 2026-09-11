import { eq } from "drizzle-orm";
import { AcessoRestrito } from "@/components/AcessoRestrito";
import { AparenciaAdmin } from "@/components/AparenciaAdmin";
import { configuracoes } from "@/db/schema";
import { getUsuarioAtual } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { parseAparencia } from "@/lib/theme";

export const dynamic = "force-dynamic";

export default async function AparenciaPage() {
  const u = await getUsuarioAtual();
  if (!u || u.role !== "admin") {
    return <AcessoRestrito mensagem="Somente administradores podem personalizar a aparência." />;
  }

  const [row] = await getDb()
    .select({ dados: configuracoes.dados })
    .from(configuracoes)
    .where(eq(configuracoes.id, 1))
    .limit(1);

  return <AparenciaAdmin inicial={parseAparencia(row?.dados)} />;
}
