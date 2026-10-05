import { Novidades } from "@/components/Novidades";

export const dynamic = "force-dynamic";

/** NOVIDADES — o histórico de versões (o layout do painel já exige a sessão). `?versao=` destaca a do aviso do sino. */
export default async function NovidadesPage({ searchParams }: { searchParams: Promise<{ versao?: string }> }) {
  const { versao } = await searchParams;
  return <Novidades versao={typeof versao === "string" ? versao : null} />;
}
