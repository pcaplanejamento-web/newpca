"use client";

import { useRouter } from "next/navigation";
import { memo, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { baixarComprovanteTermo, partesDoTermo } from "@/lib/comprovante-termo";
import { FRASE_ACEITE, rotuloVersaoTermo } from "@/lib/termo-uso-core";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { ErroAuth } from "./CartaoAuth";
import { CampoCodigo } from "./CodigoEmail";
import { Checkbox, PasswordField, TextField } from "./Field";
import { IconArrowDown, IconArrowRight, IconCheck, IconDownload, IconMailCheck, IconTermo } from "./icons";
import { Modal } from "./Modal";
import { BotaoSairAcesso } from "./NomearAparelho";
import { Progress } from "./Progress";
import { DocumentoFormatado } from "./TextoFormatado";

/** O texto do termo (formatado), em partes — o leitor lê até 20 mil caracteres por vez. */
export const TextoTermo = memo(function TextoTermo({ texto, className = "" }: { texto: string; className?: string }) {
  // Como DOCUMENTO: as mesmas classes e tags do editor — o termo lido fica idêntico ao que o ADM editou.
  const partes = useMemo(() => partesDoTermo(texto), [texto]);
  return <DocumentoFormatado partes={partes} className={className} />;
});

/** A caixa ROLÁVEL do termo: avisa quando a pessoa chegou ao fim (o aceite só destrava depois de ler tudo). */
export function LeituraTermo({ texto, onFim, altura = "max-h-[46vh]" }: { texto: string; onFim: () => void; altura?: string }) {
  const ref = useRef<HTMLElement>(null);
  const avisou = useRef(false);
  const fim = useRef(onFim);
  fim.current = onFim;
  const [noFim, setNoFim] = useState(false);
  const noFimRef = useRef(false);
  const animando = useRef<number | null>(null);
  const conferir = () => {
    const el = ref.current;
    if (!el) return;
    const chegou = el.scrollTop + el.clientHeight >= el.scrollHeight - 24;
    if (chegou !== noFimRef.current) {
      noFimRef.current = chegou;
      setNoFim(chegou);
    }
    // Durante a rolagem automática, o aviso de fim espera o último quadro (o banner re-renderiza parado).
    if (chegou && !avisou.current && animando.current === null) {
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
  const parar = () => {
    if (animando.current !== null) cancelAnimationFrame(animando.current);
    animando.current = null;
  };
  useEffect(() => parar, []);
  const irAoFim = () => {
    const el = ref.current;
    if (!el) return;
    parar();
    const inicio = el.scrollTop;
    const destino = el.scrollHeight - el.clientHeight;
    const reduzir = window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "reduce";
    if (reduzir || destino <= inicio) {
      el.scrollTop = destino;
      conferir();
      return;
    }
    const dur = Math.min(1100, Math.max(450, (destino - inicio) * 0.35));
    const t0 = performance.now();
    const passo = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      const e = p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
      el.scrollTop = inicio + (destino - inicio) * e;
      if (p < 1) animando.current = requestAnimationFrame(passo);
      else {
        animando.current = null;
        conferir();
      }
    };
    animando.current = requestAnimationFrame(passo);
  };
  return (
    <div className="relative">
      <section
        ref={ref}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a caixa rola pelo teclado (setas) — o leitor precisa chegar ao fim do termo
        tabIndex={0}
        onScroll={conferir}
        onWheel={parar}
        onPointerDown={parar}
        onKeyDown={parar}
        aria-label="Texto do Termo de Uso"
        className={`${altura} overflow-y-auto rounded-card border border-border bg-surface-2 p-[var(--pad-card)] focus-visible:shadow-ring focus-visible:outline-none`}
      >
        <TextoTermo texto={texto} />
      </section>
      {
        <button
          type="button"
          onClick={irAoFim}
          tabIndex={noFim ? -1 : 0}
          aria-hidden={noFim}
          aria-label="Ir ao fim do termo"
          title="Ir ao fim do termo"
          className={`absolute right-3 bottom-3 inline-flex size-11 items-center justify-center rounded-full bg-text text-bg shadow-flutuante transition-[opacity,transform] duration-200 motion-reduce:transition-none hover:scale-105 focus-visible:shadow-ring focus-visible:outline-none ${noFim ? "pointer-events-none scale-90 opacity-0" : "opacity-100"}`}
        >
          <IconArrowDown size={20} aria-hidden="true" />
        </button>
      }
    </div>
  );
}

export type TermoParaAceite = { id: number; versao: number; texto: string; hash: string; publicadoEm: string | null };
/** `fecharEmS` = segundos até o "Termo de Uso aceito" seguir sozinho (Configurações → Termo de uso; 0 = não fecha sozinho). */
export type DadosAceiteTermo = { termo: TermoParaAceite; metodos: { senha: boolean; codigo: boolean }; email: string; sistema?: string; fecharEmS?: number };

/**
 * O BANNER de ACEITE do Termo de Uso (flutuante): ler até o fim → "Li e concordo" → confirmar a identidade (a senha da
 * conta; sem senha, o código enviado ao e-mail; sem nenhum dos dois, a declaração digitada) → assinar → o comprovante em
 * PDF. OBRIGATÓRIO, como o nome do aparelho: sem fechar — o sistema só abre com o aceite (ou "Sair").
 */
export function BannerTermo({ dados }: { dados: DadosAceiteTermo }) {
  const router = useRouter();
  const { termo, metodos, email, sistema, fecharEmS = 0 } = dados;
  const [continuando, continuar] = useTransition();
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
      setCodigo("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível enviar o código.");
    } finally {
      setEnviando(false);
    }
  }

  async function assinar() {
    if (gravando || enviando) return;
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

  // Concluído: o painel é montado de novo, sem a pendência (uma vez só — o tempo e o botão chamam o mesmo).
  // Se o banner seguir na tela depois do refresh (a resposta ainda trouxe a pendência), recarrega a página inteira —
  // nunca fica preso com o botão sem efeito.
  const [saindo, setSaindo] = useState(false);
  const saiu = useRef(false);
  const concluir = () => {
    if (saiu.current) return;
    saiu.current = true;
    setSaindo(true);
    continuar(() => router.refresh());
  };
  useEffect(() => {
    if (!saindo || continuando) return;
    const t = window.setTimeout(() => window.location.reload(), 1500);
    return () => window.clearTimeout(t);
  }, [saindo, continuando]);
  // O FECHAMENTO AUTOMÁTICO do aceite (o tempo do ADM): um relógio por quadro (a barra anda liso) que PAUSA enquanto o
  // comprovante é gerado; clicar em "Continuar" antes encerra o relógio.
  const totalMs = fecharEmS * 1000;
  const [decorrido, setDecorrido] = useState(0);
  const pausado = baixando || saindo;
  // biome-ignore lint/correctness/useExhaustiveDependencies: o relógio só depende do aceite e da pausa
  useEffect(() => {
    if (!feito || totalMs <= 0 || pausado) return;
    let ultimo = performance.now();
    let id = 0;
    const passo = (agora: number) => {
      const dt = agora - ultimo;
      ultimo = agora;
      setDecorrido((d) => {
        const n = Math.min(totalMs, d + dt);
        if (n >= totalMs) window.setTimeout(concluir, 0);
        return n;
      });
      id = requestAnimationFrame(passo);
    };
    id = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(id);
  }, [feito, pausado, totalMs]);
  const restante = Math.max(0, Math.ceil((totalMs - decorrido) / 1000));
  const idForm = "form-termo";

  const pronto =
    leu && concordo && (metodo === "senha" ? senha.length > 0 : metodo === "codigo" ? !enviouCodigo || codigo.length === 6 : frase.trim().length > 0);
  return (
    <Modal
      open
      onClose={() => {}}
      bloqueado
      size="xl"
      titulo={feito ? "Termo de Uso aceito" : rotuloVersaoTermo(termo.versao, termo.publicadoEm)}
      rodape={
        <div className="flex flex-wrap items-center justify-between gap-2">
          {feito ? <span /> : <BotaoSairAcesso disabled={gravando || enviando} />}
          {feito ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" loading={baixando} onClick={baixar} icon={<IconDownload className="h-4 w-4" />}>
                Baixar comprovante
              </Button>
              <Button size="sm" variant="accent" loading={saindo} disabled={saindo} onClick={concluir} icon={<IconArrowRight className="h-4 w-4" />}>
                {fecharEmS > 0 && !pausado ? `Continuar (${restante})` : "Continuar"}
              </Button>
            </div>
          ) : (
            <Button
              type="submit"
              form={idForm}
              size="sm"
              variant="accent"
              loading={gravando || enviando}
              disabled={!pronto}
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
          {fecharEmS > 0 && (
            <div className="space-y-1">
              <Progress continuo value={(decorrido / totalMs) * 100} label="Tempo até continuar" />
              <p className="text-[12px] text-muted" aria-live="polite">
                {saindo ? "Abrindo o sistema…" : baixando ? "Gerando o comprovante — a contagem continua em seguida." : `O sistema abre sozinho em ${restante} segundo${restante === 1 ? "" : "s"}.`}
              </p>
            </div>
          )}
          {erro && <ErroAuth onFechar={() => setErro(null)}>{erro}</ErroAuth>}
        </div>
      ) : (
        <form
          id={idForm}
          noValidate
          className="space-y-[var(--gap-block)]"
          onSubmit={(e) => {
            e.preventDefault();
            if (pronto) assinar();
          }}
        >
          <p className="text-[13px] text-muted">
            O aceite do Termo de Uso é obrigatório para usar o sistema: leia o termo até o fim e assine.
          </p>
          <LeituraTermo texto={termo.texto} onFim={() => {
            setLeu(true);
            setConcordo(true);
          }} />
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
        </form>
      )}
    </Modal>
  );
}
