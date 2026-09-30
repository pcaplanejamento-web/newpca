"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import type { TextosAcesso } from "@/lib/acesso-core";
import type { ModoAcesso } from "@/lib/modo-acesso";
import type { UnidadeTrabalho } from "@/lib/reparticoes";
import { AuthForm } from "./AuthForm";
import type { ConfigCaptcha } from "./CodigoEmail";
import { type Identidade, MarcaSistema } from "./MarcaSistema";
import { Segmented } from "./Segmented";
import { SkeletonLinhas } from "./Skeleton";
import { VitrineAcesso } from "./VitrineAcesso";

// Os formulários de criar conta e de redefinir a senha só são baixados quando o modo é aberto.
const carregando = () => <SkeletonLinhas linhas={6} />;
const CadastroForm = dynamic(() => import("./CadastroForm").then((m) => m.CadastroForm), { loading: carregando });
const RecuperarSenhaForm = dynamic(() => import("./RecuperarSenhaForm").then((m) => m.RecuperarSenhaForm), { loading: carregando });

/**
 * A TELA ÚNICA de acesso (`/login?modo=`): ENTRAR · CRIAR CONTA · REDEFINIR A SENHA no MESMO lugar — o formulário à
 * esquerda e a VITRINE imersiva à direita (desktop). "Entrar | Criar conta" fica FIXO no alto da coluna (nunca pula
 * quando o formulário muda de altura; no "Esqueci a senha" nenhum dos dois fica marcado) e o formulário vem logo abaixo;
 * o aviso do ADM fecha a coluna, na MESMA largura. No desktop só a coluna do formulário rola (a vitrine fica parada). Trocar de modo não recarrega a página: só atualiza o endereço (voltar/compartilhar o link abre o mesmo modo).
 */
export function TelaAcesso({
  modoInicial,
  identidade,
  textos,
  turnstile,
  google,
  googleConta,
  unidades,
  semCodigo,
  erroInicial,
}: {
  modoInicial: ModoAcesso;
  identidade?: Identidade;
  /** Os textos da vitrine e o aviso (Configurações → Tela de acesso). */
  textos: TextosAcesso;
  turnstile?: ConfigCaptcha;
  google: boolean;
  googleConta: string | null;
  unidades: UnidadeTrabalho[];
  semCodigo: boolean;
  erroInicial: string | null;
}) {
  const [modo, setModo] = useState<ModoAcesso>(modoInicial);
  // A mensagem da volta (Google/erro na URL) vale só para o modo em que chegou.
  const [erroDoModo, setErroDoModo] = useState<{ modo: ModoAcesso; texto: string } | null>(erroInicial ? { modo: modoInicial, texto: erroInicial } : null);

  const irPara = useCallback((m: ModoAcesso) => {
    setModo(m);
    setErroDoModo(null);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("erro");
      url.searchParams.delete("motivo");
      if (m === "entrar") url.searchParams.delete("modo");
      else url.searchParams.set("modo", m);
      window.history.replaceState(null, "", url);
    } catch {
      /* sem histórico: só troca na tela */
    }
  }, []);
  const erro = erroDoModo?.modo === modo ? erroDoModo.texto : null;

  return (
    <main className="grid min-h-dvh bg-surface lg:h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:overflow-hidden">
      <section className="flex min-h-dvh flex-col px-5 pt-6 pb-8 sm:px-10 lg:min-h-0 lg:overflow-y-auto lg:px-14 lg:pt-0">
        {/* No desktop a marca fica na vitrine. */}
        <div className="lg:hidden">
          <MarcaSistema identidade={identidade} />
        </div>
        <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col pt-10 lg:pt-[max(3rem,14dvh)]">
          <Segmented<ModoAcesso>
            value={modo}
            onChange={irPara}
            ariaLabel="Entrar ou criar conta"
            className="w-full shrink-0 [&>button]:flex-1"
            options={[
              { value: "entrar", label: "Entrar" },
              { value: "cadastro", label: "Criar conta" },
            ]}
          />
          <div className="mt-8">
            {modo === "entrar" ? (
              <AuthForm key="entrar" onEsqueci={() => irPara("senha")} turnstile={turnstile} google={google} googleConta={googleConta} erroInicial={erro} />
            ) : modo === "cadastro" ? (
              <CadastroForm key="cadastro" onVoltar={() => irPara("entrar")} unidades={unidades} turnstile={turnstile} semCodigo={semCodigo} erroInicial={erro} />
            ) : (
              <RecuperarSenhaForm key="senha" onVoltar={() => irPara("entrar")} turnstile={turnstile} />
            )}
          </div>
          <p className="mt-auto pt-10 text-center text-[12px] leading-relaxed text-faint lg:pb-10">{textos.aviso}</p>
        </div>
      </section>
      <VitrineAcesso identidade={identidade} textos={textos} />
    </main>
  );
}
