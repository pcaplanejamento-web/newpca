"use client";

import { useState } from "react";
import { dataHoraBR } from "@/lib/format";
import { redimensionarImagem } from "@/lib/imagem-cliente";
import type { AnexoTarefa } from "@/lib/tarefas";
import { ANEXO_MAX_BYTES } from "@/lib/tarefas-validation";
import { Button } from "./Button";
import { Dropzone } from "./Dropzone";
import { IconAnexo, IconFile, IconLink, IconPlus, IconTrash } from "./icons";
import { LinkExterno } from "./LinkExterno";
import { toast } from "./Toast";

const TIPOS = "image/png,image/jpeg,image/webp,application/pdf";
const bytesDoDataUrl = (d: string) => Math.floor(((d.length - d.indexOf(",") - 1) * 3) / 4);
const tamanho = (b: number | null) => (b == null ? "" : b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

function lerComoDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("Falha ao ler o arquivo."));
    r.onload = () => resolve(r.result as string);
    r.readAsDataURL(file);
  });
}

/** O arquivo pronto para anexar (data-URL ≤ 1 MB): imagem grande é REDUZIDA no navegador; PDF acima do limite é recusado. */
async function prepararArquivo(file: File): Promise<string> {
  if (!TIPOS.split(",").includes(file.type)) throw new Error("Anexe uma imagem (PNG, JPEG, WEBP) ou um PDF.");
  const d = await lerComoDataUrl(file);
  if (bytesDoDataUrl(d) <= ANEXO_MAX_BYTES) return d;
  if (file.type === "application/pdf") throw new Error("PDF com mais de 1 MB — anexe o link do documento.");
  for (const [max, q] of [
    [2000, 0.85],
    [1600, 0.8],
    [1200, 0.75],
  ] as const) {
    const menor = await redimensionarImagem(file, max, q);
    if (bytesDoDataUrl(menor) <= ANEXO_MAX_BYTES) return menor;
  }
  throw new Error("Imagem grande demais mesmo reduzida.");
}

/**
 * ANEXOS de uma tarefa: LINKS (http/s) e ARQUIVOS pequenos — imagem ou PDF até 1 MB (a imagem maior é reduzida no
 * navegador; o PDF maior pede o link). Lista com o tipo, o tamanho e quem/quando; abrir em nova aba (`LinkExterno`);
 * excluir o próprio (ou, editor, qualquer um). Só apresenta — quem usa grava.
 */
export function AnexosTarefa({
  anexos,
  usuarioId,
  podeModerar,
  onArquivo,
  onLink,
  onExcluir,
  disabled = false,
}: {
  anexos: AnexoTarefa[];
  usuarioId: number;
  podeModerar: boolean;
  onArquivo: (a: { nome: string; conteudo: string }) => Promise<boolean>;
  onLink: (a: { url: string; nome: string }) => Promise<boolean>;
  onExcluir: (a: AnexoTarefa) => void;
  disabled?: boolean;
}) {
  const [link, setLink] = useState<{ url: string; nome: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const urlValida = !!link && /^https?:\/\/\S+$/i.test(link.url.trim());

  const arquivo = async (file: File) => {
    setEnviando(true);
    try {
      await onArquivo({ nome: file.name.slice(0, 120), conteudo: await prepararArquivo(file) });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEnviando(false);
    }
  };
  const salvarLink = async () => {
    if (!link || !urlValida) return;
    setEnviando(true);
    if (await onLink({ url: link.url.trim(), nome: link.nome.trim() })) setLink(null);
    setEnviando(false);
  };

  return (
    <div className="space-y-2">
      {anexos.length > 0 && (
        <ul className="divide-y divide-border rounded-card border border-border">
          {anexos.map((a) => (
            <li key={a.id} className="flex min-h-11 items-center gap-2 px-3 py-1.5">
              {a.tipo === "link" ? <IconLink className="h-4 w-4 shrink-0 text-muted" /> : <IconFile className="h-4 w-4 shrink-0 text-muted" />}
              <div className="min-w-0 flex-1">
                <LinkExterno href={a.tipo === "link" ? (a.url ?? "#") : `/api/tarefas/anexos/${a.id}`} variante="texto" className="block truncate text-[13px] font-medium">
                  {a.nome}
                </LinkExterno>
                <p className="truncate text-[11px] text-faint">
                  {a.tipo === "arquivo" ? `${tamanho(a.tamanho)} · ` : ""}
                  {dataHoraBR(a.criadoEm)}
                </p>
              </div>
              {!disabled && (a.criadoPor === usuarioId || podeModerar) && (
                <Button variant="ghost" size="xs" aria-label={`Excluir anexo ${a.nome}`} style={{ color: "var(--danger)" }} icon={<IconTrash className="h-4 w-4" />} onClick={() => onExcluir(a)} />
              )}
            </li>
          ))}
        </ul>
      )}
      {!disabled &&
        (link ? (
          <div className="space-y-2 rounded-card border border-border p-2">
            <input
              // biome-ignore lint/a11y/noAutofocus: o campo abre pelo "Adicionar link".
              autoFocus
              value={link.url}
              inputMode="url"
              aria-label="Endereço do link"
              placeholder="https://…"
              onChange={(e) => setLink({ ...link, url: e.target.value })}
              className="h-11 w-full rounded-control border border-border-2 bg-surface-2 px-3 text-[13px] text-text outline-none focus:border-accent focus:bg-surface focus:ring-4 focus:ring-accent/20 lg:h-9"
            />
            <input
              value={link.nome}
              maxLength={120}
              aria-label="Nome do link (opcional)"
              placeholder="Nome (opcional)"
              onChange={(e) => setLink({ ...link, nome: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && salvarLink()}
              className="h-11 w-full rounded-control border border-border-2 bg-surface-2 px-3 text-[13px] text-text outline-none focus:border-accent focus:bg-surface focus:ring-4 focus:ring-accent/20 lg:h-9"
            />
            <div className="flex gap-2">
              <Button size="sm" loading={enviando} disabled={!urlValida} onClick={salvarLink}>
                Anexar link
              </Button>
              <Button size="sm" variant="ghost" disabled={enviando} onClick={() => setLink(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <Dropzone
              accept={TIPOS}
              onFile={arquivo}
              icon={<IconAnexo className="h-5 w-5" />}
              titulo={enviando ? "Enviando…" : "Soltar ou escolher arquivo"}
              dica="Imagem ou PDF até 1 MB"
            />
            <Button variant="secondary" size="sm" className="sm:self-center" icon={<IconPlus className="h-4 w-4" />} onClick={() => setLink({ url: "", nome: "" })}>
              Adicionar link
            </Button>
          </div>
        ))}
      {disabled && !anexos.length && <p className="text-[12.5px] text-muted">Sem anexos.</p>}
    </div>
  );
}
