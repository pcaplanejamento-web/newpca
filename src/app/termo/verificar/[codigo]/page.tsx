import { headers } from "next/headers";
import { Callout } from "@/components/Callout";
import { IconTermo } from "@/components/icons";
import { MarcaLink } from "@/components/MarcaSistema";
import { FormCodigoTermo, VerificarArquivoTermo } from "@/components/VerificarArquivoTermo";
import { iniciais } from "@/lib/acesso-conta-core";
import { getAparencia } from "@/lib/aparencia";
import { contarTentativa } from "@/lib/seguranca-acesso";
import { codigoNormal, dataHoraBR } from "@/lib/termo-uso-core";
import { aceitePorCodigo, seloConfere } from "@/lib/termo-uso";

export const dynamic = "force-dynamic";

/**
 * VERIFICAÇÃO PÚBLICA do comprovante do Termo de Uso pelo código: válido ou não, a versão, a data e só as INICIAIS de quem
 * assinou (nada de e-mail ou matrícula). Limite de consultas por IP.
 */
export default async function VerificarTermoPage({ params }: { params: Promise<{ codigo: string }> }) {
  const h = await headers();
  const ip = h.get("cf-connecting-ip") ?? h.get("x-real-ip") ?? "local";
  const espera = await contarTentativa("verificarTermoIp", ip);
  const codigo = codigoNormal(decodeURIComponent((await params).codigo));
  const [aparencia, a] = await Promise.all([getAparencia(), !espera && codigo ? aceitePorCodigo(codigo) : null]);
  const integro = a ? await seloConfere(a) : false;
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
          {espera ? (
            <Callout kind="warn">Muitas consultas seguidas. Tente de novo em alguns minutos.</Callout>
          ) : a && integro ? (
            <>
              <Callout kind={a.teste ? "warn" : "ok"}>{a.teste ? "Comprovante de TESTE — sem valor como aceite oficial." : "Comprovante válido: o registro da assinatura confere."}</Callout>
              <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-[14px] sm:grid-cols-[auto_1fr]">
                <dt className="text-muted">Código</dt>
                <dd className="min-w-0 break-all font-mono text-text">{a.codigo}</dd>
                <dt className="text-muted">Termo</dt>
                <dd className="text-text">Versão {a.versao}</dd>
                <dt className="text-muted">Assinado em</dt>
                <dd className="text-text">{dataHoraBR(a.em)} (Brasília)</dd>
                <dt className="text-muted">Signatário</dt>
                <dd className="text-text">{iniciais(a.nome)}</dd>
                <dt className="text-muted">Resumo do texto</dt>
                <dd className="break-all font-mono text-[12px] text-text-2">{a.hash}</dd>
              </dl>
              <VerificarArquivoTermo codigo={a.codigo} />
            </>
          ) : a ? (
            <Callout kind="danger">O registro deste código foi ALTERADO depois da assinatura — o comprovante não é válido.</Callout>
          ) : (
            <>
              <Callout kind="danger">Código não encontrado. Confira se foi digitado exatamente como está no comprovante.</Callout>
              <FormCodigoTermo inicial={codigo ?? ""} />
            </>
          )}
        </section>
      </div>
    </main>
  );
}
