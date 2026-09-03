import { NextResponse } from "next/server";
import { getItens } from "@/lib/queries";

export const dynamic = "force-dynamic";

function intParam(v: string | null): number | undefined {
  if (!v) return undefined;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;

  const sortRaw = sp.get("sort");
  const dirRaw = sp.get("dir");

  try {
    const result = await getItens({
      unidadeId: intParam(sp.get("unidade")),
      q: sp.get("q") ?? undefined,
      classificacao: sp.get("classificacao") ?? undefined,
      ano: intParam(sp.get("ano")),
      page: intParam(sp.get("page")),
      pageSize: intParam(sp.get("pageSize")),
      sort:
        sortRaw === "nome" || sortRaw === "seq" || sortRaw === "quantidade"
          ? sortRaw
          : "valor",
      dir: dirRaw === "asc" ? "asc" : "desc",
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("Falha ao consultar itens:", err);
    return NextResponse.json(
      { rows: [], total: 0, page: 1, pageSize: 25, pages: 1, error: "Erro ao consultar itens." },
      { status: 500 },
    );
  }
}
