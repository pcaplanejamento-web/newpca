"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
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
 * esquerda (a marca do ADM no topo, "Entrar | Criar conta" e o modo com a transição padrão) e a VITRINE imersiva à direita
 * (desktop). Trocar de modo não recarrega a página: só atualiza o endereço (voltar/compartilhar o link abre o mesmo modo).
 */
export function TelaAcesso({
  modoInicial,
  identidade,
  turnstile,
  google,
  googleConta,
  unidades,
  semCodigo,
  erroInicial,
}: {
  modoInicial: ModoAcesso;
  identidade?: Identidade;
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
    <main className="grid min-h-dvh bg-surface lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <section className="flex min-h-dvh flex-col px-5 py-6 sm:px-10 lg:px-14 lg:py-10">
        {/* No desktop a marca fica na vitrine. */}
        <div className="lg:hidden">
          <MarcaSistema identidade={identidade} />
        </div>
        <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center py-10">
          {modo === "senha" ? null : (
            <Segmented<ModoAcesso>
              value={modo}
              onChange={irPara}
              ariaLabel="Entrar ou criar conta"
              className="mb-8 w-full [&>button]:flex-1"
              options={[
                { value: "entrar", label: "Entrar" },
                { value: "cadastro", label: "Criar conta" },
              ]}
            />
          )}
          {modo === "entrar" ? (
            <AuthForm key="entrar" onEsqueci={() => irPara("senha")} turnstile={turnstile} google={google} googleConta={googleConta} erroInicial={erro} />
          ) : modo === "cadastro" ? (
            <CadastroForm key="cadastro" onVoltar={() => irPara("entrar")} unidades={unidades} turnstile={turnstile} semCodigo={semCodigo} erroInicial={erro} />
          ) : (
            <RecuperarSenhaForm key="senha" onVoltar={() => irPara("entrar")} turnstile={turnstile} />
          )}
        </div>
        <p className="text-center text-[12px] text-faint lg:text-left">
          Acesso restrito aos servidores da Prefeitura de Rio Verde. Todo cadastro passa pela aprovação do administrador.
        </p>
      </section>
      <VitrineAcesso identidade={identidade} />
    </main>
  );
}
