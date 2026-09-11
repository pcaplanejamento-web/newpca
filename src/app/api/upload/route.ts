import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { exigirEditor } from "@/lib/api-auth";
import { getDb } from "@/lib/db";
import { itens, unidades } from "@/db/schema";
import { normalizarLinha, type LinhaCrua } from "@/lib/normalize";
import { uploadSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

// 7 linhas x 14 colunas = 98 parâmetros (< limite de 100 do D1 por statement).
// O cliente envia a planilha em lotes (ex.: 200 linhas/requisição), então cada
// requisição faz ~29 statements num único db.batch() — bem dentro dos limites
// de sub-requisições e CPU do Worker. Assim planilhas grandes sobem inteiras.
const ROWS_PER_STMT = 7;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
// biome-ignore lint/suspicious/noExplicitAny: tipos encadeados do query-builder do Drizzle para db.batch() são inviáveis de anotar aqui.
function inserts(db: ReturnType<typeof getDb>, unidadeId: number, rows: LinhaCrua[]): any[] {
  const normed = rows.map(normalizarLinha);
  const stmts = [];
  for (let i = 0; i < normed.length; i += ROWS_PER_STMT) {
    stmts.push(
      db.insert(itens).values(
        normed.slice(i, i + ROWS_PER_STMT).map((r) => ({ unidadeId, ...r })),
      ),
    );
  }
  return stmts;
}

export async function POST(req: Request) {
  const auth = await exigirEditor();
  if ("erro" in auth) return auth.erro;

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

  const db = getDb();

  try {
    if (parsed.data.mode === "start") {
      const { codigo, municipio, nomeArquivo, totalItens, valorTotal, rows } =
        parsed.data;

      // Cria/atualiza a unidade (por código) e recupera o id.
      const [u] = await db
        .insert(unidades)
        .values({
          codigo,
          municipio,
          nomeArquivo: nomeArquivo ?? null,
          totalItens: totalItens ?? rows.length,
          valorTotal: valorTotal ?? 0,
          atualizadoEm: sql`(CURRENT_TIMESTAMP)`,
        })
        .onConflictDoUpdate({
          target: unidades.codigo,
          set: {
            municipio,
            nomeArquivo: nomeArquivo ?? null,
            totalItens: totalItens ?? rows.length,
            valorTotal: valorTotal ?? 0,
            atualizadoEm: sql`(CURRENT_TIMESTAMP)`,
          },
        })
        .returning({ id: unidades.id });

      const unidadeId = u.id;

      // Substitui os itens: apaga os antigos e insere o 1º lote — tudo num
      // único batch atômico.
      const stmts = inserts(db, unidadeId, rows);
      await db.batch([
        db.delete(itens).where(eq(itens.unidadeId, unidadeId)),
        ...stmts,
      ] as [(typeof stmts)[number], ...(typeof stmts)[number][]]);

      return NextResponse.json({
        ok: true,
        unidadeId,
        codigo,
        municipio,
        inserted: rows.length,
      });
    }

    // mode === "append": acrescenta um lote à unidade já criada.
    const { unidadeId, rows } = parsed.data;
    const [existe] = await db
      .select({ id: unidades.id })
      .from(unidades)
      .where(eq(unidades.id, unidadeId))
      .limit(1);
    if (!existe) return bad("Unidade não encontrada para acrescentar itens.", 404);

    const stmts = inserts(db, unidadeId, rows);
    await db.batch(stmts as [(typeof stmts)[number], ...(typeof stmts)[number][]]);

    return NextResponse.json({ ok: true, unidadeId, inserted: rows.length });
  } catch (err) {
    console.error("Falha ao importar PCA:", err);
    return bad(
      "Erro ao gravar no banco. Tente novamente. (Detalhe no log do servidor.)",
      500,
    );
  }
}
