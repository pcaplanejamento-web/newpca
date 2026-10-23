"use client";

import { useState } from "react";
import { Callout } from "./Callout";
import { Button } from "./Button";
import { Dropzone } from "./Dropzone";
import { TextField } from "./Field";

type Resultado = "original" | "alterado" | "registro-alterado" | "nao-encontrado";

const TEXTO: Record<Resultado, { kind: "ok" | "danger"; texto: string }> = {
  original: { kind: "ok", texto: "Arquivo ORIGINAL: o PDF é idêntico, byte a byte, ao comprovante gerado pelo sistema." },
  alterado: { kind: "danger", texto: "Arquivo ALTERADO: este PDF não é o comprovante original — algo foi modificado (texto, número, imagem ou metadado)." },
  "registro-alterado": { kind: "danger", texto: "O registro deste código foi alterado depois da assinatura — o comprovante não é válido." },
  "nao-encontrado": { kind: "danger", texto: "Código não encontrado." },
};

/**
 * Confere o ARQUIVO do comprovante: calcula o SHA-256 do PDF no próprio aparelho (o arquivo não é enviado) e o servidor
 * compara com o do comprovante original refeito a partir do registro.
 */
export function VerificarArquivoTermo({ codigo, url = "/api/termo/verificar" }: { codigo: string; /** A rota que confere (a pública tem limite por IP; a do ADM, não). */ url?: string }) {
  const [estado, setEstado] = useState<{ nome: string; resultado?: Resultado; erro?: string; conferindo?: boolean } | null>(null);
  const conferir = async (f: File) => {
    setEstado({ nome: f.name, conferindo: true });
    try {
      const d = await crypto.subtle.digest("SHA-256", await f.arrayBuffer());
      const hash = [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codigo, hash }) });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; resultado?: Resultado; error?: string };
      if (!r.ok || !j.ok || !j.resultado) setEstado({ nome: f.name, erro: j.error ?? "Não foi possível conferir agora." });
      else setEstado({ nome: f.name, resultado: j.resultado });
    } catch {
      setEstado({ nome: f.name, erro: "Não foi possível ler o arquivo." });
    }
  };
  return (
    <div className="space-y-3">
      <Dropzone accept=".pdf,application/pdf" onFile={conferir} titulo="Conferir o arquivo do comprovante" dica="Solte ou escolha o PDF — ele não sai do seu aparelho." />
      {estado?.conferindo && <Callout kind="info">Conferindo {estado.nome}…</Callout>}
      {estado?.erro && <Callout kind="warn">{estado.erro}</Callout>}
      {estado?.resultado && <Callout kind={TEXTO[estado.resultado].kind}>{TEXTO[estado.resultado].texto}</Callout>}
    </div>
  );
}

/** O campo do CÓDIGO da verificação pública (vai a /termo/verificar/<código>). */
export function FormCodigoTermo({ inicial = "" }: { inicial?: string }) {
  const [codigo, setCodigo] = useState(inicial);
  const c = codigo.trim();
  return (
    <form action={c ? `/termo/verificar/${encodeURIComponent(c)}` : undefined} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="min-w-0 flex-1">
        <TextField label="Código de verificação" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Como está no comprovante" autoComplete="off" />
      </div>
      <Button type="submit" variant="primary" disabled={!c}>
        Verificar
      </Button>
    </form>
  );
}
