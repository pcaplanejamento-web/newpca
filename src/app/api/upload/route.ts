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
// Nº de statements por db.batch() — mantém cada batch pequeno para planilhas
// grandes (2000+ linhas) não estourarem os limites de tamanho do D1.
const BATCH_STMTS = 20;

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

    // 2) Substitui os itens da unidade: apaga os antigos e insere em vários
    //    lotes menores (cada batch com poucos statements). Isso mantém cada
    //    escrita dentro dos limites do D1 e escala para planilhas grandes.
    await db.delete(itens).where(eq(itens.unidadeId, unidadeId));

    const rows = normed.map((r) => ({ unidadeId, ...r }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let pending: any[] = [];
    const flush = async () => {
      if (pending.length === 0) return;
      await db.batch(pending as [(typeof pending)[number], ...(typeof pending)[number][]]);
      pending = [];
    };
    for (let i = 0; i < rows.length; i += CHUNK) {
      pending.push(db.insert(itens).values(rows.slice(i, i + CHUNK)));
      if (pending.length >= BATCH_STMTS) await flush();
    }
    await flush();

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
