"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LIMITES_ACESSO, MAX_DESTAQUES_ACESSO, TEXTOS_ACESSO_PADRAO, type TextosAcesso, textosAcesso } from "@/lib/acesso-core";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { TextArea, TextField } from "./Field";
import { IconRefresh, IconSave } from "./icons";
import type { Identidade } from "./MarcaSistema";
import { toast } from "./Toast";
import { VitrineAcesso } from "./VitrineAcesso";

/**
 * Configurações → TELA DE ACESSO: os textos da vitrine (rótulo, manchete, descrição, até 3 destaques, rodapé) e o aviso
 * abaixo do formulário — com a PRÉVIA ao vivo (a própria `VitrineAcesso`). Grava no blob da aparência (`acesso`); campo
 * vazio volta ao texto padrão; destaque sem título não aparece.
 */
export function TextosAcessoAdmin({ gravado, identidade }: { gravado?: Partial<TextosAcesso>; identidade?: Identidade }) {
  const router = useRouter();
  const [t, setT] = useState<TextosAcesso>(() => {
    const efetivo = textosAcesso(gravado);
    // Sempre as 3 vagas de destaque no formulário (as vazias ficam em branco).
    const destaques = Array.from({ length: MAX_DESTAQUES_ACESSO }, (_, i) => efetivo.destaques[i] ?? { titulo: "", texto: "" });
    return { ...efetivo, destaques };
  });
  const [salvando, setSalvando] = useState(false);
  const L = LIMITES_ACESSO;
  const campo = (k: "rotulo" | "titulo" | "descricao" | "rodape" | "aviso") => (e: { target: { value: string } }) => setT((x) => ({ ...x, [k]: e.target.value }));
  const destaque = (i: number, k: "titulo" | "texto", v: string) =>
    setT((x) => ({ ...x, destaques: x.destaques.map((d, j) => (j === i ? { ...d, [k]: v } : d)) }));

  async function salvar() {
    setSalvando(true);
    try {
      const res = await fetch("/api/admin/aparencia", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acesso: { ...t, destaques: t.destaques.map((d) => ({ titulo: d.titulo.trim(), texto: d.texto.trim() })) } }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "Erro ao salvar.");
      toast.success("Textos da tela de acesso salvos — já valem para todos.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="grid items-start gap-[var(--gap-block)] xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-[var(--gap-block)]">
        <Callout kind="info">
          Os textos do painel ao lado do login (no computador) e o aviso abaixo do formulário (em todas as telas). Campo vazio
          volta ao texto padrão; um destaque sem título não aparece.
        </Callout>
        <TextField label="Rótulo" value={t.rotulo} onChange={campo("rotulo")} maxLength={L.rotulo} placeholder={TEXTOS_ACESSO_PADRAO.rotulo} />
        <TextArea label="Manchete" rows={2} value={t.titulo} onChange={campo("titulo")} maxLength={L.titulo} hint="Enter quebra a linha." />
        <TextArea label="Descrição" rows={3} value={t.descricao} onChange={campo("descricao")} maxLength={L.descricao} />
        {t.destaques.map((d, i) => (
          <fieldset key={`d${i + 1}`} className="grid grid-cols-1 gap-3 rounded-card border border-border p-[var(--pad-card)] sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <legend className="px-1 text-[12px] font-semibold text-muted">Destaque {i + 1}</legend>
            <TextField label="Título" value={d.titulo} onChange={(e) => destaque(i, "titulo", e.target.value)} maxLength={L.destaqueTitulo} />
            <TextField label="Texto" value={d.texto} onChange={(e) => destaque(i, "texto", e.target.value)} maxLength={L.destaqueTexto} />
          </fieldset>
        ))}
        <TextField
          label="Rodapé do painel"
          value={t.rodape}
          onChange={campo("rodape")}
          maxLength={L.rodape}
          hint={`Aparece depois de “© ${new Date().getFullYear()}”.`}
        />
        <TextArea label="Aviso abaixo do formulário" rows={2} value={t.aviso} onChange={campo("aviso")} maxLength={L.aviso} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={<IconRefresh className="h-4 w-4" />}
            onClick={() => setT({ ...TEXTOS_ACESSO_PADRAO, destaques: TEXTOS_ACESSO_PADRAO.destaques.map((d) => ({ ...d })) })}
          >
            Textos padrão
          </Button>
          <Button size="sm" loading={salvando} onClick={salvar} icon={<IconSave className="h-4 w-4" />}>
            Salvar textos
          </Button>
        </div>
      </div>
      <div>
        <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-faint">Prévia</p>
        <VitrineAcesso previa identidade={identidade} textos={textosAcesso(t)} />
      </div>
    </div>
  );
}
