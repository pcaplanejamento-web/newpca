import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { itens, unidades } from "@/db/schema";
import { normalizarLinha } from "@/lib/normalize";
import { uploadSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

// 6 linhas x 14 colunas = 84 parâmetros (< limite de 100 do D1 por statement).
const CHUNK = 6;

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return bad("Corpo da requisição não é um JSON válido.");
  }

  const parsed = uploadSchema.safeParse(json);
  if (!parsed.success) {
    return bad(parsed.error.issues[0]?.message ?? "Dados inválidos.", 422);
  }

  const { codigo, municipio, nomeArquivo, rows } = parsed.data;
  const normed = rows.map(normalizarLinha);
  const totalItens = normed.length;
  const valorTotal =
    Math.round(normed.reduce((s, r) => s + (r.valorTotal ?? 0), 0) * 100) / 100;

  const db = getDb();

  try {
    // 1) Upsert da unidade (por código) e recupera o id.
    const [u] = await db
      .insert(unidades)
      .values({
        codigo,
        municipio,
        nomeArquivo: nomeArquivo ?? null,
        totalItens,
        valorTotal,
        atualizadoEm: sql`(CURRENT_TIMESTAMP)`,
      })
      .onConflictDoUpdate({
        target: unidades.codigo,
        set: {
          municipio,
          nomeArquivo: nomeArquivo ?? null,
          totalItens,
          valorTotal,
          atualizadoEm: sql`(CURRENT_TIMESTAMP)`,
        },
      })
      .returning({ id: unidades.id });

    const unidadeId = u.id;

    // 2) Substitui os itens da unidade: delete + inserts em UM batch (atômico).
    const inserts = [];
    for (let i = 0; i < normed.length; i += CHUNK) {
      const slice = normed
        .slice(i, i + CHUNK)
        .map((r) => ({ unidadeId, ...r }));
      inserts.push(db.insert(itens).values(slice));
    }
    const statements = [
      db.delete(itens).where(eq(itens.unidadeId, unidadeId)),
      ...inserts,
    ] as [(typeof inserts)[number], ...(typeof inserts)[number][]];

    await db.batch(statements);

    return NextResponse.json({
      ok: true,
      unidadeId,
      codigo,
      municipio,
      totalItens,
      valorTotal,
    });
  } catch (err) {
    console.error("Falha ao importar PCA:", err);
    return bad(
      "Erro ao gravar no banco. Tente novamente. (Detalhe no log do servidor.)",
      500,
    );
  }
}
