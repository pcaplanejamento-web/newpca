"use client";

import { useEffect, useRef, useState } from "react";
import {
  AJUSTE_FUNDO_PADRAO,
  type AjusteFundo,
  ALTURA_MIN_FUNDO,
  arrastarFundo,
  avaliarImagemFundo,
  corpoFundo,
  cssGradiente,
  estiloFundo,
  fundoDoQuadro,
  type Gradiente,
  lerGradiente,
  fundoUrlValida,
  LARGURA_MIN_FUNDO,
  lerAjusteFundo,
  ZOOM_FUNDO_MAX,
} from "@/lib/imagem-fundo-core";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { TextField } from "./Field";
import { IconImage, IconMove, IconTrash, IconZoom } from "./icons";
import { SeletorFundo } from "./SeletorFundo";
import { toast } from "./Toast";

/** A imagem carregou? (`null` = ainda carregando; sem link = `false`). A moldura do quadro só a mostra depois. */
export function useImagemCarrega(url: string | null): boolean | null {
  const [ok, setOk] = useState<boolean | null>(url ? null : false);
  useEffect(() => {
    if (!url) return setOk(false);
    setOk(null);
    let vivo = true;
    const img = new Image();
    img.onload = () => vivo && setOk(true);
    img.onerror = () => vivo && setOk(false);
    img.referrerPolicy = "no-referrer";
    img.src = url;
    return () => {
      vivo = false;
    };
  }, [url]);
  return ok;
}

/** O tamanho NATURAL da imagem (px) — `null` enquanto carrega ou se falhar. */
function useTamanhoImagem(url: string | null): { w: number; h: number } | null {
  const [t, setT] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    setT(null);
    if (!url) return;
    let vivo = true;
    const img = new Image();
    img.onload = () => vivo && setT({ w: img.naturalWidth, h: img.naturalHeight });
    img.referrerPolicy = "no-referrer";
    img.src = url;
    return () => {
      vivo = false;
    };
  }, [url]);
  return t;
}

/**
 * FUNDO do quadro (Configuração; editores): o `SeletorFundo` (fotos com pesquisa, DEGRADÊS em círculos — predefinidos ou
 * próprio — e "Sem fundo" = o padrão do sistema) ou o LINK de uma imagem/pin do Pinterest — o servidor tira a imagem da
 * página. Nada é enviado nem guardado além do link: a imagem
 * fica no site de origem (economiza armazenamento). O ENQUADRAMENTO: arrastar a prévia (16:9 — a proporção ideal) escolhe
 * o que fica à vista e o controle dá ZOOM; "Salvar enquadramento" grava (`fundoAjuste`). Avisa a proporção fora do ideal
 * e a resolução baixa (`avaliarImagemFundo`), e quando o site não deixa a imagem aparecer.
 */
export function FundoQuadro({
  quadroId,
  fundoUrl,
  fundoAjuste = null,
  fundoGradiente = null,
  podeEditar,
  onMudou,
}: {
  quadroId: number;
  fundoUrl: string | null;
  /** O degradê gravado (JSON — `lerGradiente`). */
  fundoGradiente?: string | null;
  /** O enquadramento gravado (JSON — `lerAjusteFundo`). */
  fundoAjuste?: string | null;
  podeEditar: boolean;
  onMudou: () => void;
}) {
  const [link, setLink] = useState("");
  const [gravando, setGravando] = useState<string | null>(null);
  const carrega = useImagemCarrega(fundoUrl);
  const tamanho = useTamanhoImagem(fundoUrl);
  const valido = !!fundoUrlValida(link);
  const gravado = lerAjusteFundo(fundoAjuste);
  const [ajuste, setAjuste] = useState<AjusteFundo>(gravado);
  // biome-ignore lint/correctness/useExhaustiveDependencies: volta ao gravado quando o SERVIDOR muda (outra imagem/salvo).
  useEffect(() => setAjuste(lerAjusteFundo(fundoAjuste)), [fundoAjuste, fundoUrl]);
  const mudou = ajuste.x !== gravado.x || ajuste.y !== gravado.y || ajuste.zoom !== gravado.zoom;
  const caixa = useRef<HTMLDivElement>(null);
  const toque = useRef<{ x: number; y: number } | null>(null);

  const patch = async (chave: string, corpo: Record<string, unknown>, sucesso: string) => {
    if (gravando) return;
    setGravando(chave);
    try {
      await chamar(`/api/tarefas/quadros/${quadroId}`, "PATCH", corpo);
      toast.success(sucesso);
      if ("fundoUrl" in corpo && chave === "link") setLink("");
      onMudou();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setGravando(null);
    }
  };

  const arrastar = (dx: number, dy: number) => {
    const el = caixa.current;
    if (!el || !tamanho) return;
    setAjuste((a) => arrastarFundo(a, dx, dy, { w: el.clientWidth, h: el.clientHeight }, tamanho));
  };
  const avisos = tamanho ? avaliarImagemFundo(tamanho.w, tamanho.h) : [];
  const editar = podeEditar && !!fundoUrl && carrega === true;

  return (
    <div className="space-y-3">
      {fundoUrl ? (
        <div
          ref={caixa}
          role="application"
          aria-label={editar ? "Enquadrar a imagem: arraste para escolher o que fica à vista (setas também)" : "Prévia da imagem de fundo"}
          tabIndex={editar ? 0 : undefined}
          onPointerDown={(e) => {
            if (!editar) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            toque.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerMove={(e) => {
            if (!toque.current) return;
            arrastar(e.clientX - toque.current.x, e.clientY - toque.current.y);
            toque.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerUp={() => (toque.current = null)}
          onPointerCancel={() => (toque.current = null)}
          onKeyDown={(e) => {
            const d = ({ ArrowLeft: [10, 0], ArrowRight: [-10, 0], ArrowUp: [0, 10], ArrowDown: [0, -10] } as Record<string, [number, number]>)[e.key];
            if (!d || !editar) return;
            e.preventDefault();
            arrastar(d[0], d[1]);
          }}
          className={`relative aspect-video w-full max-w-xl overflow-hidden rounded-card border border-border bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
            editar ? "cursor-grab touch-none active:cursor-grabbing" : ""
          }`}
        >
          {carrega && (
            // biome-ignore lint/performance/noImgElement: imagem externa por link (não passa pelo otimizador).
            <img alt="" src={fundoUrl} referrerPolicy="no-referrer" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover" style={estiloFundo(ajuste)} />
          )}
          {carrega === null && <div className="absolute inset-0 grid place-items-center text-[12.5px] text-muted">Carregando a imagem…</div>}
          {editar && (
            <span className="pointer-events-none absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-[var(--scrim)] px-2 py-1 text-[11.5px] font-medium text-white">
              <IconMove className="h-3.5 w-3.5" /> Arraste para enquadrar
            </span>
          )}
        </div>
      ) : (
        <div
          aria-hidden
          className="aspect-video w-full max-w-xl rounded-card border border-border bg-surface-2"
          style={lerGradiente(fundoGradiente) ? { background: cssGradiente(lerGradiente(fundoGradiente) as Gradiente) } : undefined}
        />
      )}
      {editar && (
        <div className="flex max-w-xl flex-wrap items-center gap-2">
          <label className="flex min-w-[12rem] flex-1 items-center gap-2 text-[12.5px] text-muted">
            <IconZoom className="h-4 w-4 shrink-0" />
            <span className="sr-only">Zoom</span>
            <input
              type="range"
              min={1}
              max={ZOOM_FUNDO_MAX}
              step={0.05}
              value={ajuste.zoom}
              onChange={(e) => setAjuste((a) => ({ ...a, zoom: Number(e.target.value) }))}
              className="h-11 w-full accent-[var(--accent)]"
              aria-label="Zoom da imagem"
            />
            <span className="w-10 text-right tabular-nums">{Math.round(ajuste.zoom * 100)}%</span>
          </label>
          <Button size="sm" variant="ghost" disabled={gravando != null} onClick={() => setAjuste(AJUSTE_FUNDO_PADRAO)}>
            Centralizar
          </Button>
          <Button size="sm" variant="accent" loading={gravando === "ajuste"} disabled={!mudou || gravando != null} onClick={() => patch("ajuste", { fundoAjuste: ajuste }, "Enquadramento salvo.")}>
            Salvar enquadramento
          </Button>
        </div>
      )}
      {fundoUrl && carrega === false && <Callout kind="warn">A imagem não carregou — o site de origem pode bloquear o uso em outros sites. Escolha outra.</Callout>}
      {tamanho && (
        <p className="text-[12px] text-muted">
          Esta imagem: {tamanho.w}×{tamanho.h} px (proporção {(tamanho.w / tamanho.h).toFixed(2).replace(".", ",")}:1). Ideal: paisagem 16:9, com pelo menos {LARGURA_MIN_FUNDO}×{ALTURA_MIN_FUNDO} px.
        </p>
      )}
      {avisos.length > 0 && (
        <Callout kind="warn">
          <ul className="list-disc space-y-0.5 pl-4">
            {avisos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </Callout>
      )}
      {podeEditar && (
        <SeletorFundo
          previa={false}
          disabled={gravando != null}
          valor={fundoDoQuadro({ fundoUrl, fundoGradiente })}
          onChange={(f) => patch("seletor", corpoFundo(f), f.tipo === "nenhum" ? "Fundo removido — o quadro usa o padrão do sistema." : "Fundo aplicado.")}
        />
      )}
      {podeEditar && (
        <form
          className="flex max-w-xl flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (valido) patch("link", { fundoUrl: link.trim() }, "Imagem de fundo aplicada.");
          }}
        >
          <div className="min-w-0 flex-1">
            <TextField
              label={fundoUrl ? "Trocar pelo link" : "Link da imagem ou do pin"}
              placeholder="https://br.pinterest.com/pin/… ou https://i.pinimg.com/…jpg"
              value={link}
              disabled={gravando != null}
              maxLength={1000}
              inputMode="url"
              onChange={(e) => setLink(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" loading={gravando === "link"} disabled={!valido || gravando != null} icon={<IconImage className="h-4 w-4" />}>
              Aplicar
            </Button>
            {fundoUrl && (
              <Button variant="ghost" disabled={gravando != null} icon={<IconTrash className="h-4 w-4" />} onClick={() => patch("remover", { fundoUrl: null }, "Imagem de fundo removida.")}>
                Remover
              </Button>
            )}
          </div>
        </form>
      )}
      <p className="text-[12px] text-muted">A imagem fica no site de origem — nada é enviado ao servidor, só o link e o enquadramento são guardados.</p>
    </div>
  );
}
