import { IconTermo } from "@/components/icons";
import { MarcaLink } from "@/components/MarcaSistema";
import { FormCodigoTermo } from "@/components/VerificarArquivoTermo";
import { getAparencia } from "@/lib/aparencia";

export const dynamic = "force-dynamic";

/** A entrada da VERIFICAÇÃO PÚBLICA: digitar o código do comprovante do Termo de Uso. */
export default async function VerificarTermoInicioPage() {
  const aparencia = await getAparencia();
  return (
    <main className="flex min-h-dvh items-start justify-center bg-bg px-[var(--pad-canvas)] py-10 sm:items-center">
      <div className="w-full max-w-[520px] space-y-6">
        <div className="flex">
          <MarcaLink href="/" dica="Abrir a página pública" identidade={aparencia.identidade} tamanho="lg" />
        </div>
        <section className="space-y-4 rounded-card bg-surface p-[var(--pad-card)] shadow-ring">
          <h1 className="flex items-center gap-2 text-[18px] font-semibold text-text">
            <IconTermo className="h-5 w-5 text-accent" />
            Verificação do Termo de Uso
          </h1>
          <p className="text-[14px] text-muted">Digite o código de verificação impresso no comprovante para conferir se ele é válido.</p>
          <FormCodigoTermo />
        </section>
      </div>
    </main>
  );
}
