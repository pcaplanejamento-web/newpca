import { NextResponse } from "next/server";
import { exigirEditor } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { adicionarOpcao, opcaoProtocoloSchema, removerOpcao } from "@/lib/protocolos";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const parsed = opcaoProtocoloSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 422 },
    );
  const valor = await adicionarOpcao(parsed.data.campo, parsed.data.valor);
  await registrarAuditoria({ usuario: a.u, acao: "criar", entidade: "protocolo_legado", resumo: `Opção de "${parsed.data.campo}" adicionada: ${valor}` });
  return NextResponse.json({ ok: true, valor });
}

export async function DELETE(req: Request) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const parsed = opcaoProtocoloSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 422 },
    );
  await removerOpcao(parsed.data.campo, parsed.data.valor);
  await registrarAuditoria({ usuario: a.u, acao: "excluir", entidade: "protocolo_legado", resumo: `Opção de "${parsed.data.campo}" removida: ${parsed.data.valor}` });
  return NextResponse.json({ ok: true });
}
