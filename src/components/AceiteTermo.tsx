"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { baixarComprovanteTermo, partesDoTermo } from "@/lib/comprovante-termo";
import { dataBR, FRASE_ACEITE } from "@/lib/termo-uso-core";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { ErroAuth } from "./CartaoAuth";
import { CampoCodigo } from "./CodigoEmail";
import { Checkbox, PasswordField, TextField } from "./Field";
import { IconArrowRight, IconCheck, IconDownload, IconLogout, IconMailCheck, IconTermo } from "./icons";
import { Modal } from "./Modal";
import { TextoFormatado } from "./TextoFormatado";

/** O texto do termo (formatado), em partes — o leitor lê até 20 mil caracteres por vez. */
export function TextoTermo({ texto, className = "" }: { texto: string; className?: string }) {
  return (
    <div className={`space-y-3 text-[14px] leading-relaxed text-text-2 ${className}`}>
      {partesDoTermo(texto).map((p, i) => (
        <TextoFormatado key={i} texto={p} />
      ))}
    </div>
  );
}

/** A caixa ROLÁVEL do termo: avisa quando a pessoa chegou ao fim (o aceite só destrava depois de ler tudo). */
export function LeituraTermo({ texto, onFim, altura = "max-h-[46vh]" }: { texto: string; onFim: () => void; altura?: string }) {
  const ref = useRef<HTMLElement>(null);
  const avisou = useRef(false);
  const fim = useRef(onFim);
  fim.current = onFim;
  const conferir = () => {
    const el = ref.current;
    if (!el || avisou.current) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) {
      avisou.current = true;
      fim.current();
    }
  };
  // O texto curto que cabe inteiro já conta como lido (confere depois da 1ª pintura).
  // biome-ignore lint/correctness/useExhaustiveDependencies: conferir ao montar e ao trocar o texto
  useEffect(() => {
    avisou.current = false;
    const t = window.setTimeout(conferir, 50);
    return () => window.clearTimeout(t);
  }, [texto]);
  return (
    <section
      ref={ref}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a caixa rola pelo teclado (setas) — o leitor precisa chegar ao fim do termo
      tabIndex={0}
      onScroll={conferir}
      aria-label="Texto do Termo de Uso"
      className={`${altura} overflow-y-auto rounded-card border border-border bg-surface-2 p-[var(--pad-card)] focus-visible:shadow-ring focus-visible:outline-none`}
    >
      <TextoTermo texto={texto} />
    </section>
  );
}

/** O aviso no painel durante a CARÊNCIA: há uma versão nova do termo para aceitar (o botão abre o banner do aceite). */
export function AvisoTermoPendente({ prazo, onAbrir }: { prazo?: string; onAbrir: () => void }) {
  return (
    <div className="mb-[var(--gap-block)]">
      <Callout kind="warn" icon={<IconTermo className="h-4 w-4" />}>
        <span className="flex flex-wrap items-center justify-between gap-2">
          <span>
            Há uma versão nova do <strong>Termo de Uso</strong> para você ler e aceitar{prazo ? ` até ${dataBR(prazo)}` : ""}.
          </span>
          <Button size="sm" variant="secondary" onClick={onAbrir} icon={<IconTermo className="h-4 w-4" />}>
            Ler e aceitar
          </Button>
        </span>
      </Callout>
    </div>
  );
}

export type TermoParaAceite = { id: number; versao: number; titulo: string; texto: string; hash: string; publicadoEm: string | null };
export type DadosAceiteTermo = { termo: TermoParaAceite; prazo: string; metodos: { senha: boolean; codigo: boolean }; email: string; sistema?: string };

/**
 * O BANNER de ACEITE do Termo de Uso (flutuante): ler até o fim → "Li e concordo" → confirmar a identidade (a senha da
 * conta; sem senha, o código enviado ao e-mail; sem nenhum dos dois, a declaração digitada) → assinar → o comprovante em
 * PDF. `bloqueado` = o prazo venceu: sem fechar (só "Sair"); senão, "Ler depois" fecha.
 */
export function BannerTermo({ dados, bloqueado, aberto, onFechar }: { dados: DadosAceiteTermo; bloqueado: boolean; aberto: boolean; onFechar: () => void }) {
  const router = useRouter();
  const { termo, prazo, metodos, email, sistema } = dados;
  const metodo: "senha" | "codigo" | "sessao" = metodos.senha ? "senha" : metodos.codigo ? "codigo" : "sessao";
  const [leu, setLeu] = useState(false);
  const [concordo, setConcordo] = useState(false);
  const [senha, setSenha] = useState("");
  const [codigo, setCodigo] = useState("");
  const [frase, setFrase] = useState("");
  const [enviouCodigo, setEnviouCodigo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [saindo, setSaindo] = useState(false);
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

  async function assinar() {
    if (!leu) return setErro("Leia o termo até o fim.");
    if (!concordo) return setErro("Marque “Li e concordo” para assinar.");
    if (metodo === "codigo" && !enviouCodigo) return pedirCodigo();
    setGravando(true);
    setErro(null);
    try {
      const r = await fetch("/api/acesso/termo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          termoId: termo.id,
          hash: termo.hash,
          metodo,
          senha: metodo === "senha" ? senha : undefined,
          codigo: metodo === "codigo" ? codigo : undefined,
          frase: metodo === "sessao" ? frase : undefined,
        }),
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

  // Concluído: o painel é montado de novo, sem a pendência.
  const concluir = () => {
    onFechar();
    router.refresh();
  };

  const pronto =
    leu && concordo && (metodo === "senha" ? senha.length > 0 : metodo === "codigo" ? !enviouCodigo || codigo.length === 6 : frase.trim().length > 0);
  const fechavel = !bloqueado && !feito && !gravando;

  return (
    <Modal
      open={aberto}
      onClose={fechavel ? onFechar : () => {}}
      bloqueado={!fechavel}
      size="xl"
      titulo={feito ? "Termo de Uso aceito" : `${termo.titulo} — versão ${termo.versao}`}
      rodape={
        <div className="flex flex-wrap items-center justify-between gap-2">
          {feito ? (
            <span />
          ) : bloqueado ? (
            <Button
              variant="ghost"
              size="sm"
              loading={saindo}
              icon={<IconLogout className="h-4 w-4" />}
              onClick={async () => {
                setSaindo(true);
                await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
                router.replace("/login");
                router.refresh();
              }}
            >
              Sair
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={onFechar}>
              Ler depois
            </Button>
          )}
          {feito ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" loading={baixando} onClick={baixar} icon={<IconDownload className="h-4 w-4" />}>
                Baixar comprovante
              </Button>
              <Button size="sm" variant="accent" onClick={concluir} icon={<IconArrowRight className="h-4 w-4" />}>
                Continuar
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="accent"
              loading={gravando || enviando}
              disabled={!pronto}
              onClick={assinar}
              icon={metodo === "codigo" && !enviouCodigo ? <IconMailCheck className="h-4 w-4" /> : <IconTermo className="h-4 w-4" />}
            >
              {metodo === "codigo" && !enviouCodigo ? "Enviar código" : "Assinar"}
            </Button>
          )}
        </div>
      }
    >
      {feito ? (
        <div className="space-y-[var(--gap-block)]">
          <Callout kind="ok" icon={<IconCheck className="h-4 w-4" />}>
            Assinatura registrada (versão {termo.versao}). Código de verificação: <strong className="font-mono">{feito.codigo}</strong>
          </Callout>
          <p className="text-[13px] text-muted">O comprovante traz o termo integral e o registro da sua assinatura eletrônica. Ele fica também no seu Perfil → Segurança.</p>
          {erro && <ErroAuth onFechar={() => setErro(null)}>{erro}</ErroAuth>}
        </div>
      ) : (
        <div className="space-y-[var(--gap-block)]">
          <p className="text-[13px] text-muted">
            {bloqueado ? "Para continuar usando o sistema, leia o termo até o fim e assine." : `Leia e aceite até ${dataBR(prazo)} — depois dessa data o sistema só abre com o aceite.`}
          </p>
          <LeituraTermo texto={termo.texto} onFim={() => setLeu(true)} />
          {!leu && <p className="text-[12px] text-muted">Role o texto até o fim para liberar a assinatura.</p>}
          <Checkbox label="Li e concordo com todas as condições deste Termo de Uso." checked={concordo} disabled={!leu} onChange={(e) => setConcordo(e.target.checked)} />
          {metodo === "senha" && (
            <PasswordField label="Confirme com a sua senha" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" disabled={!concordo} />
          )}
          {metodo === "codigo" &&
            (enviouCodigo ? (
              <div className="space-y-1.5">
                <CampoCodigo value={codigo} onChange={setCodigo} autoFocus />
                <p className="text-[12px] text-muted">
                  Enviado para <strong className="font-semibold text-text-2">{email}</strong>.{" "}
                  <button type="button" className="font-semibold text-accent underline-offset-2 hover:underline" onClick={pedirCodigo} disabled={enviando}>
                    Enviar outro
                  </button>
                </p>
              </div>
            ) : (
              <p className="text-[12px] text-muted">Vamos enviar um código de 6 dígitos para {email} para confirmar a assinatura.</p>
            ))}
          {metodo === "sessao" && (
            <TextField label={`Digite “${FRASE_ACEITE}” para confirmar`} value={frase} onChange={(e) => setFrase(e.target.value)} disabled={!concordo} autoComplete="off" />
          )}
          <p className="text-[11.5px] text-faint">
            Assinatura eletrônica simples (Lei nº 14.063/2020, art. 4º, I): ficam registrados o seu nome, matrícula, cargo e unidade, a data e a hora, o endereço IP, o
            navegador, o aparelho e o resumo criptográfico do texto aceito.
          </p>
          {erro && <ErroAuth onFechar={() => setErro(null)}>{erro}</ErroAuth>}
        </div>
      )}
    </Modal>
  );
}
