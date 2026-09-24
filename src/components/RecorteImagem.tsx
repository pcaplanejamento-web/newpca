"use client";

import { useEffect, useRef, useState } from "react";
import {
  arrastar,
  CAPA_ALTURA,
  CAPA_LARGURA,
  normalizarRecorte,
  RECORTE_INICIAL,
  type Recorte,
  retanguloOrigem,
  ZOOM_MAX,
} from "@/lib/recorte-imagem";
import { Button } from "./Button";
import { IconImage } from "./icons";
import { Modal } from "./Modal";

/** Teto do arquivo de ORIGEM (a saída é sempre ≤ ~300 KB). */
const MAX_ORIGEM = 15 * 1024 * 1024;

/** Desenha o recorte no canvas final (800×1000) e devolve a data-URL WebP (fallback JPEG). */
function exportar(img: HTMLImageElement, r: Recorte): string {
  const c = document.createElement("canvas");
  c.width = CAPA_LARGURA;
  c.height = CAPA_ALTURA;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível neste navegador.");
  const { sx, sy, sw, sh } = retanguloOrigem(img.naturalWidth, img.naturalHeight, r);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, CAPA_LARGURA, CAPA_ALTURA);
  // WebP primeiro; o navegador sem WebP devolve PNG — cai no JPEG. Sempre abaixo do teto do servidor (`capaSchema`).
  for (const [tipo, q] of [
    ["image/webp", 0.82],
    ["image/webp", 0.7],
    ["image/webp", 0.55],
    ["image/jpeg", 0.75],
    ["image/jpeg", 0.6],
    ["image/jpeg", 0.45],
  ] as const) {
    const url = c.toDataURL(tipo, q);
    if (url.startsWith(`data:${tipo}`) && url.length < 700_000) return url;
  }
  throw new Error("Não foi possível reduzir a imagem — tente outra.");
}

/**
 * RECORTE da capa do PCA em 4:5 — lógica própria (sem dependência): ZOOM pelo controle deslizante
 * (ou roda do mouse) e ARRASTO pelo ponteiro/toque; a moldura mostra EXATAMENTE o que vira a capa.
 * Exporta WebP 800×1000 (data-URL) para `onConfirmar`.
 */
export function RecorteImagem({
  arquivo,
  onCancelar,
  onConfirmar,
  salvando = false,
}: {
  arquivo: File | null;
  onCancelar: () => void;
  onConfirmar: (dataUrl: string) => void;
  salvando?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [r, setR] = useState<Recorte>(RECORTE_INICIAL);
  // Callback-ref: a moldura monta com o modal (portal) — o efeito abaixo reage quando ela EXISTE.
  const [moldura, setMoldura] = useState<HTMLDivElement | null>(null);
  const toque = useRef<{ x: number; y: number } | null>(null);
  // Largura REAL da moldura (muda com a animação do modal, a rotação do celular e o redimensionamento).
  const [largura, setLargura] = useState(0);

  useEffect(() => {
    setR(RECORTE_INICIAL);
    setImg(null);
    setUrl(null);
    setErro(null);
    if (!arquivo) return;
    if (!/^image\/(png|jpe?g|webp|gif|avif)$/i.test(arquivo.type)) {
      setErro("Escolha uma imagem (PNG, JPG, WebP).");
      return;
    }
    if (arquivo.size > MAX_ORIGEM) {
      setErro("Imagem grande demais (máx. 15 MB).");
      return;
    }
    const u = URL.createObjectURL(arquivo);
    setUrl(u);
    const im = new Image();
    im.onload = () => setImg(im);
    im.onerror = () => setErro("Não foi possível abrir a imagem.");
    im.src = u;
    return () => URL.revokeObjectURL(u);
  }, [arquivo]);

  // Mede e acompanha a largura da moldura; a roda do mouse dá zoom
  // SEM rolar a página (listener nativo não-passivo — o `onWheel` do React é passivo).
  useEffect(() => {
    const el = moldura;
    if (!el) return;
    const ro = new ResizeObserver(() => setLargura(el.clientWidth));
    ro.observe(el);
    setLargura(el.clientWidth);
    const roda = (e: WheelEvent) => {
      e.preventDefault();
      setR((cur) => normalizarRecorte({ ...cur, zoom: cur.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08) }));
    };
    el.addEventListener("wheel", roda, { passive: false });
    return () => {
      ro.disconnect();
      el.removeEventListener("wheel", roda);
    };
  }, [moldura]);

  // Posição da imagem na moldura (CSS) a partir do mesmo retângulo de origem do export.
  const estilo = (() => {
    if (!img || largura <= 0) return undefined;
    const { sx, sy, sw } = retanguloOrigem(img.naturalWidth, img.naturalHeight, r);
    const escala = largura / sw; // px da tela por px da imagem
    return {
      width: img.naturalWidth * escala,
      height: img.naturalHeight * escala,
      transform: `translate(${-sx * escala}px, ${-sy * escala}px)`,
    };
  })();

  const mover = (dx: number, dy: number) => {
    if (!img || largura <= 0) return;
    setR((cur) => arrastar(cur, dx, dy, largura, img.naturalWidth, img.naturalHeight));
  };

  return (
    <Modal
      open={!!arquivo}
      onClose={onCancelar}
      titulo="Recortar capa do card (4:5)"
      size="md"
      bloqueado={salvando}
      rodape={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancelar} disabled={salvando}>
            Cancelar
          </Button>
          <Button
            loading={salvando}
            disabled={!img}
            onClick={() => {
              if (!img) return;
              try {
                onConfirmar(exportar(img, r));
              } catch (e) {
                setErro(e instanceof Error ? e.message : "Falha ao gerar a capa.");
              }
            }}
          >
            Usar esta capa
          </Button>
        </div>
      }
    >
      <div className="space-y-[var(--gap-block)]">
        {erro ? (
          <p className="rounded-control bg-surface-2 p-4 text-sm" style={{ color: "var(--danger)" }}>
            {erro}
          </p>
        ) : (
          <>
            <div
              ref={setMoldura}
              className="relative mx-auto aspect-[4/5] w-full max-w-[320px] cursor-grab touch-none select-none overflow-hidden rounded-card bg-surface-2 shadow-ring active:cursor-grabbing"
              onPointerDown={(e) => {
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                toque.current = { x: e.clientX, y: e.clientY };
              }}
              onPointerMove={(e) => {
                if (!toque.current) return;
                mover(e.clientX - toque.current.x, e.clientY - toque.current.y);
                toque.current = { x: e.clientX, y: e.clientY };
              }}
              onPointerUp={() => {
                toque.current = null;
              }}
              onPointerCancel={() => {
                toque.current = null;
              }}
            >
              {img && url && estilo ? (
                // biome-ignore lint/performance/noImgElement: prévia local (object URL) do recorte; next/image não se aplica.
                <img src={url} alt="" draggable={false} className="absolute left-0 top-0 max-w-none" style={estilo} />
              ) : (
                <div className="grid h-full place-items-center text-faint">
                  <IconImage className="h-8 w-8" />
                </div>
              )}
              <span aria-hidden className="pointer-events-none absolute inset-0 rounded-card ring-2 ring-inset ring-white/60" />
            </div>
            <label className="mx-auto flex max-w-[320px] items-center gap-3 text-xs text-muted">
              Zoom
              <input
                type="range"
                min={1}
                max={ZOOM_MAX}
                step={0.01}
                value={r.zoom}
                onChange={(e) => setR((cur) => normalizarRecorte({ ...cur, zoom: Number(e.target.value) }))}
                className="h-11 flex-1 accent-[var(--accent)]"
                aria-label="Zoom da imagem"
              />
            </label>
            <p className="text-center text-xs text-faint">Arraste para posicionar · a capa é salva em WebP 800×1000</p>
          </>
        )}
      </div>
    </Modal>
  );
}
