"use client";

import { useRouter } from "next/navigation";
import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import {
  chaveTentativa,
  lerTentativa,
  podeTentarDeNovo,
  recuperavelSozinho,
  relatorioDaFalha,
  TEXTO_FALHA,
  type TipoFalha,
  textoDetalhes,
  tipoDaFalha,
} from "@/lib/erro-tela-core";
import { BotaoCopiar } from "./BotaoCopiar";
import { Button } from "./Button";
import { IconAlert, IconRefresh, IconSpinner } from "./icons";

/** A cor (token de feedback) de cada tipo: versão nova = informação; resposta cortada = atenção; os erros = perigo. */
const COR: Record<TipoFalha, string> = {
  versao: "var(--info)",
  conexao: "var(--warn)",
  servidor: "var(--danger)",
  tela: "var(--danger)",
};

/**
 * FALHA NA TELA — o cartão que substitui a tela que falhou (a fronteira de erro `error.tsx`). Diz O QUE aconteceu pelo
 * tipo (resposta cortada · versão nova · erro no servidor · erro na tela), mostra "Recarregando a tela…" enquanto o
 * sistema tenta sozinho e, parado, oferece "Tentar novamente" e "Recarregar a página" + os DETALHES TÉCNICOS
 * (recolhidos, com "Copiar detalhes"). `cheia` = ocupa a página inteira (a fronteira da raiz, fora do painel).
 * Apresentacional — o comportamento vem de `useFalhaNaTela`.
 */
export function FalhaNaTela({
  tipo,
  digest,
  detalhes,
  recuperando = false,
  onTentar,
  onRecarregar,
  cheia = false,
  inicio = false,
}: {
  tipo: TipoFalha;
  /** O código do erro do servidor (a "ref:"). */
  digest?: string;
  /** O texto dos detalhes técnicos (`textoDetalhes`); vazio = sem a seção. */
  detalhes: string;
  recuperando?: boolean;
  onTentar: () => void;
  onRecarregar: () => void;
  cheia?: boolean;
  /** Mostra "Ir para o início" (a fronteira da raiz). */
  inicio?: boolean;
}) {
  const c = COR[tipo];
  const t = TEXTO_FALHA[tipo];
  const Titulo = cheia ? "h1" : "h2";
  return (
    <div
      role="alert"
      aria-busy={recuperando || undefined}
      className={`flex items-center justify-center ${cheia ? "min-h-dvh bg-surface-2 px-[var(--pad-canvas)] py-16" : "min-h-[60vh] py-10"}`}
    >
      <div className="w-full max-w-md rounded-card bg-surface p-[var(--pad-card)] text-center shadow-ring">
        <span
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl"
          style={{ color: c, background: `color-mix(in srgb, ${c} 12%, var(--surface))` }}
        >
          {recuperando ? (
            <IconSpinner className="h-6 w-6" />
          ) : tipo === "versao" ? (
            <IconRefresh className="h-6 w-6" />
          ) : (
            <IconAlert className="h-6 w-6" />
          )}
        </span>
        <Titulo className="mt-4 text-base font-bold text-text">{recuperando ? "Recarregando a tela…" : t.titulo}</Titulo>
        <p className="mt-2 text-sm text-muted">
          {recuperando ? "A tela falhou ao carregar; o sistema está tentando de novo automaticamente." : t.explicacao}
        </p>
        {digest && !recuperando && <p className="mt-1 font-mono text-xs text-faint">ref: {digest}</p>}
        {!recuperando && (
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <Button onClick={onTentar} icon={<IconRefresh className="h-4 w-4" />}>
              Tentar novamente
            </Button>
            <Button variant="secondary" onClick={onRecarregar}>
              Recarregar a página
            </Button>
            {inicio && (
              <Button variant="ghost" href="/">
                Ir para o início
              </Button>
            )}
          </div>
        )}
        {!recuperando && detalhes && (
          <details className="group mt-4 text-left">
            <summary className="flex min-h-11 cursor-pointer select-none items-center justify-center text-xs font-semibold text-muted hover:text-text lg:min-h-8">
              Detalhes técnicos
            </summary>
            <pre className="mt-2 whitespace-pre-wrap break-words rounded-control bg-surface-2 p-3 font-mono text-[11.5px] leading-relaxed text-text-2">
              {detalhes}
            </pre>
            <div className="mt-2 flex justify-end">
              <BotaoCopiar texto={detalhes} rotulo="Copiar detalhes" titulo="Copiar os detalhes técnicos" />
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

/** Reserva da trava quando o `sessionStorage` não está disponível (aba anônima, armazenamento bloqueado) — vale até a
 * página recarregar. */
const naMemoria = new Map<string, number>();

/** A última tentativa automática nesta tela e se ela sobrevive a um recarregamento (`sessionStorage`). */
function lerUltima(chave: string): { ultima: number | null; persistente: boolean } {
  const mem = naMemoria.get(chave) ?? null;
  try {
    const sal = lerTentativa(sessionStorage.getItem(chave));
    return { ultima: sal == null ? mem : Math.max(sal, mem ?? sal), persistente: true };
  } catch {
    return { ultima: mem, persistente: false };
  }
}

/** Grava a tentativa (memória + `sessionStorage`); `true` = sobrevive a um recarregamento. */
function gravarUltima(chave: string, agora: number): boolean {
  naMemoria.set(chave, agora);
  try {
    sessionStorage.setItem(chave, String(agora));
    return true;
  } catch {
    return false;
  }
}

/**
 * O COMPORTAMENTO da fronteira de erro: classifica a falha, INFORMA o servidor (`POST /api/erros` → Logs do Worker,
 * sem esperar) e, quando dá, RECUPERA SOZINHO uma vez por tela a cada minuto — a versão nova recarrega a página (só com o
 * `sessionStorage`, que impede o laço); a resposta cortada e o erro do servidor pedem a tela de novo (`router.refresh()` +
 * `reset()`). A 2ª falha seguida mostra o cartão com os botões. Devolve as props do `FalhaNaTela`.
 */
export function useFalhaNaTela(error: Error & { digest?: string }, reset: () => void) {
  const router = useRouter();
  const tipo = tipoDaFalha(error);
  const [recuperando, setRecuperando] = useState(false);
  const [detalhes, setDetalhes] = useState("");
  const tratado = useRef<unknown>(null);

  const tentar = useCallback(() => {
    setRecuperando(true);
    startTransition(() => {
      router.refresh();
      reset();
    });
  }, [router, reset]);

  useEffect(() => {
    // Um erro, um tratamento (o modo estrito do desenvolvimento roda o efeito duas vezes).
    if (tratado.current === error) return;
    tratado.current = error;
    const caminho = `${window.location.pathname}${window.location.search}`;
    const chave = chaveTentativa(caminho);
    const agora = Date.now();
    const { ultima } = lerUltima(chave);
    const pode = podeTentarDeNovo(ultima, agora);
    const relatorio = relatorioDaFalha(error, { caminho, automatica: !pode, instante: new Date(agora).toISOString() });
    setDetalhes(textoDetalhes(relatorio));
    // Informa (best-effort: sem sessão = 401, sem rede = nada — a tela segue igual).
    fetch("/api/erros", {
      method: "POST",
      keepalive: true,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(relatorio),
    }).catch(() => {});
    if (!recuperavelSozinho(relatorio.tipo) || !pode) return;
    if (relatorio.tipo === "versao") {
      // Recarregar perde a memória: sem o `sessionStorage` a trava não sobreviveria — não arrisca o laço.
      if (gravarUltima(chave, agora)) {
        setRecuperando(true);
        window.location.reload();
      }
      return;
    }
    gravarUltima(chave, agora);
    tentar();
  }, [error, tentar]);

  return {
    tipo,
    digest: error.digest,
    detalhes,
    recuperando,
    onTentar: tentar,
    onRecarregar: () => window.location.reload(),
  };
}
