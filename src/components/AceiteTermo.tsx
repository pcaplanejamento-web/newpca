"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { baixarComprovanteTermo, partesDoTermo } from "@/lib/comprovante-termo";
import { dataBR, FRASE_ACEITE } from "@/lib/termo-uso-core";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { CampoCodigo } from "./CodigoEmail";
import { CartaoAuth, ErroAuth } from "./CartaoAuth";
import { Checkbox, PasswordField, TextField } from "./Field";
import { IconArrowRight, IconCheck, IconDownload, IconLogout, IconMailCheck, IconTermo } from "./icons";
import { type Identidade, MarcaLink } from "./MarcaSistema";
import { TextoFormatado } from "./TextoFormatado";

/** O texto do termo (formatado), em partes — o leitor lê até 20 mil caracteres por vez. */
export function TextoTermo({ texto, className = "" }: { texto: string; className?: string }) {
  return (
    <div className={`space-y-3 text-[14px] leading-relaxed ${className}`}>
      {partesDoTermo(texto).map((p, i) => (
        <TextoFormatado key={i} texto={p} />
      ))}
    </div>
  );
}

/** A caixa ROLÁVEL do termo: avisa quando a pessoa chegou ao fim (o aceite só destrava depois de ler tudo). */
export function LeituraTermo({ texto, onFim, altura = "max-h-[52vh]" }: { texto: string; onFim: () => void; altura?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const avisou = useRef(false);
  const conferir = () => {
    const el = ref.current;
    if (!el || avisou.current) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) {
      avisou.current = true;
      onFim();
    }
  };
  // O texto curto que cabe inteiro já conta como lido.
  // biome-ignore lint/correctness/useExhaustiveDependencies: conferir só ao montar e ao trocar o texto
  useEffect(() => {
    avisou.current = false;
    conferir();
  }, [texto]);
  return (
    // biome-ignore lint/a11y/noNoninteractiveTabindex: a caixa rola pelo teclado (setas) — o leitor precisa chegar ao fim
    <div ref={ref} tabIndex={0} onScroll={conferir} className={`${altura} overflow-y-auto rounded-card border border-border bg-surface p-[var(--pad-card)] focus-visible:shadow-ring`}>
      <TextoTermo texto={texto} />
    </div>
  );
}

/** O aviso no painel durante a CARÊNCIA: há uma versão nova do termo para aceitar. */
export function AvisoTermoPendente() {
  return (
    <div className="mb-[var(--gap-block)]">
      <Callout kind="warn" icon={<IconTermo className="h-4 w-4" />}>
        Há uma versão nova do <strong>Termo de Uso</strong> para você ler e aceitar.{" "}
        <Link href="/acesso/termo" className="font-semibold underline underline-offset-2">
          Ler e aceitar agora
        </Link>
        .
      </Callout>
    </div>
  );
}

export type TermoParaAceite = { id: number; versao: number; titulo: string; texto: string; hash: string; publicadoEm: string | null };

/**
 * O ACEITE do Termo de Uso (fora do painel — `/acesso/termo`): ler até o fim → marcar "Li e concordo" → confirmar a
 * identidade (a senha da conta; sem senha, o código enviado ao e-mail; sem nenhum dos dois, a declaração digitada) →
 * assinar. Depois, o comprovante em PDF.
 */
export function AceiteTermo({
  termo,
  prazo,
  metodos,
  email,
  identidade,
  sistema,
  bloqueado,
}: {
  termo: TermoParaAceite;
  prazo: string;
  metodos: { senha: boolean; codigo: boolean };
  email: string;
  identidade?: Identidade;
  sistema?: string;
  bloqueado: boolean;
}) {
  const router = useRouter();
  const metodo: "senha" | "codigo" | "sessao" = metodos.senha ? "senha" : metodos.codigo ? "codigo" : "sessao";
  const [leu, setLeu] = useState(false);
  const [concordo, setConcordo] = useState(false);
  const [senha, setSenha] = useState("");
  const [codigo, setCodigo] = useState("");
  const [frase, setFrase] = useState("");
  const [enviouCodigo, setEnviouCodigo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<{ aceiteId: number; codigo: string } | null>(null);
  const [baixando, setBaixando] = useState(false);

  async function pedirCodigo() {
    setEnviando(true);
    setErro(null);
    try {
      const r = await fetch("/api/acesso/termo/codigo", { method: "POST" });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Não foi possível enviar o código.");
      setEnviouCodigo(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível enviar o código.");
    } finally {
      setEnviando(false);
    }
  }

  async function assinar(e: FormEvent) {
    e.preventDefault();
    if (!leu) return setErro("Leia o termo até o fim.");
    if (!concordo) return setErro("Marque “Li e concordo” para assinar.");
    if (metodo === "codigo" && !enviouCodigo) return pedirCodigo();
    setGravando(true);
    setErro(null);
    try {
      const r = await fetch("/api/acesso/termo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ termoId: termo.id, hash: termo.hash, metodo, senha: metodo === "senha" ? senha : undefined, codigo: metodo === "codigo" ? codigo : undefined, frase: metodo === "sessao" ? frase : undefined }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; aceiteId?: number; codigo?: string };
      if (!r.ok || !j.ok || !j.aceiteId || !j.codigo) throw new Error(j.error ?? "Não foi possível assinar o termo.");
      setFeito({ aceiteId: j.aceiteId, codigo: j.codigo });
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível assinar o termo.");
    } finally {
      setGravando(false);
    }
  }

  async function baixar() {
    if (!feito) return;
    setBaixando(true);
    try {
      await baixarComprovanteTermo(feito.aceiteId, sistema);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível gerar o comprovante.");
    } finally {
      setBaixando(false);
    }
  }

  async function sair() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.replace("/login");
    router.refresh();
  }

  const continuar = () => {
    router.replace("/painel");
    router.refresh();
  };

  const pronto = leu && concordo && (metodo === "senha" ? senha.length > 0 : metodo === "codigo" ? !enviouCodigo || codigo.length === 6 : frase.trim().length > 0);

  return (
    <main className="flex min-h-dvh items-start justify-center bg-bg px-[var(--pad-canvas)] py-8">
      <div className="w-full max-w-[760px] space-y-6">
        <div className="flex">
          <MarcaLink href="/" dica="Abrir a página pública" identidade={identidade} tamanho="lg" />
        </div>
        {feito ? (
          <CartaoAuth titulo="Termo de Uso aceito" subtitulo={`Versão ${termo.versao}. Guarde o comprovante: ele traz o registro da sua assinatura eletrônica.`}>
            <div className="space-y-4">
              <Callout kind="ok" icon={<IconCheck className="h-4 w-4" />}>
                Assinatura registrada. Código de verificação: <strong className="font-mono">{feito.codigo}</strong>
              </Callout>
              {erro && <ErroAuth onFechar={() => setErro(null)}>{erro}</ErroAuth>}
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" loading={baixando} onClick={baixar} icon={<IconDownload className="h-4 w-4" />}>
                  Baixar comprovante (PDF)
                </Button>
                <Button variant="accent" onClick={continuar} icon={<IconArrowRight className="h-4 w-4" />}>
                  Continuar
                </Button>
              </div>
            </div>
          </CartaoAuth>
        ) : (
          <CartaoAuth
            titulo={termo.titulo}
            etapa={`Versão ${termo.versao}`}
            subtitulo={
              bloqueado
                ? "Para continuar usando o sistema, leia o termo até o fim e assine."
                : `Leia e aceite até ${dataBR(prazo)} — depois dessa data o sistema só abre com o aceite.`
            }
            onSubmit={assinar}
          >
            <div className="space-y-4">
              <LeituraTermo texto={termo.texto} onFim={() => setLeu(true)} />
              {!leu && <p className="text-[13px] text-muted">Role o texto até o fim para liberar a assinatura.</p>}
              <Checkbox
                label="Li e concordo com todas as condições deste Termo de Uso."
                checked={concordo}
                disabled={!leu}
                onChange={(e) => setConcordo(e.target.checked)}
              />
              {metodo === "senha" && (
                <PasswordField label="Confirme com a sua senha" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" disabled={!concordo} />
              )}
              {metodo === "codigo" &&
                (enviouCodigo ? (
                  <div className="space-y-2">
                    <CampoCodigo value={codigo} onChange={setCodigo} autoFocus />
                    <p className="text-[13px] text-muted">
                      Enviado para <strong className="font-semibold text-text-2">{email}</strong>.{" "}
                      <button type="button" className="font-semibold text-accent underline-offset-2 hover:underline" onClick={pedirCodigo} disabled={enviando}>
                        Enviar outro
                      </button>
                    </p>
                  </div>
                ) : (
                  <p className="text-[13px] text-muted">Vamos enviar um código de 6 dígitos para {email} para confirmar a sua assinatura.</p>
                ))}
              {metodo === "sessao" && (
                <TextField label={`Digite “${FRASE_ACEITE}” para confirmar`} value={frase} onChange={(e) => setFrase(e.target.value)} disabled={!concordo} autoComplete="off" />
              )}
              <p className="text-[12px] text-faint">
                Assinatura eletrônica simples (Lei nº 14.063/2020, art. 4º, I): registramos o seu nome, matrícula, cargo e unidade, a data e a hora, o endereço IP, o navegador, o aparelho e o resumo criptográfico do texto aceito.
              </p>
            </div>
            {erro && <ErroAuth onFechar={() => setErro(null)}>{erro}</ErroAuth>}
            <Button
              type="submit"
              variant="accent"
              loading={gravando || enviando}
              disabled={!pronto}
              icon={metodo === "codigo" && !enviouCodigo ? <IconMailCheck className="h-4 w-4" /> : <IconTermo className="h-4 w-4" />}
              className="mt-6 h-[52px] w-full text-[15px]"
            >
              {metodo === "codigo" && !enviouCodigo ? "Enviar código e assinar" : "Assinar o Termo de Uso"}
            </Button>
          </CartaoAuth>
        )}
        <div className="flex justify-center gap-2">
          {!bloqueado && !feito && (
            <Button variant="ghost" size="sm" onClick={continuar}>
              Ler depois
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={sair} icon={<IconLogout className="h-4 w-4" />}>
            Sair
          </Button>
        </div>
      </div>
    </main>
  );
}
