import { IconTermo } from "@/components/icons";
import { MarcaLink } from "@/components/MarcaSistema";
import { FormCodigoTermo } from "@/components/VerificarArquivoTermo";
import { getAparencia } from "@/lib/aparencia";

export const dynamic = "force-dynamic";

/** A entrada da VERIFICAÇÃO PÚBLICA de uma declaração do PCA: digitar o código (o endereço sem código dava 404). */
export default async function VerificarDeclaracaoInicioPage() {
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
            Verificação de declaração do PCA
          </h1>
          <p className="text-[14px] text-muted">Digite o código de verificação impresso na declaração para conferir se ela é válida.</p>
          <FormCodigoTermo base="/declaracao/verificar" dica="Como está na declaração" />
        </section>
      </div>
    </main>
  );
}
