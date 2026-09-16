"use client";

import { useState } from "react";
import { Button } from "./Button";
import { Checkbox } from "./Field";
import { IconAlert, IconCheck, IconClipboard } from "./icons";
import { Modal } from "./Modal";

/**
 * Banner (Modal) com TODOS os erros de um documento listados para **copiar** —
 * reutilizado pelo DFD e pelo Protocolo. Recebe as linhas já montadas (puras, de
 * `linhasRelatorioDfd`/`linhasRelatorioProtocolo`) e oferece "Copiar tudo"
 * (`navigator.clipboard`, com fallback de seleção). Um `toggle` opcional (Checkbox)
 * permite ao usuário **incluir/excluir** um grupo de pendências (ex.: DFD-R em
 * atenção) e recompor as linhas ao vivo. Só componentes do DS.
 */
export function RelatorioErros({
  open,
  onClose,
  titulo,
  linhas,
  toggle,
}: {
  open: boolean;
  onClose: () => void;
  titulo: string;
  linhas: string[];
  toggle?: { label: string; checked: boolean; onChange: (v: boolean) => void };
}) {
  const [copiado, setCopiado] = useState(false);
  const texto = linhas.join("\n");

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sem permissão de clipboard: seleciona o texto para o usuário copiar manualmente.
      const el = document.getElementById("relatorio-erros-texto");
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        setCopiado(false);
        onClose();
      }}
      titulo={titulo}
      size="lg"
      rodape={
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
          <Button
            onClick={copiar}
            icon={copiado ? <IconCheck className="h-4 w-4" /> : <IconClipboard className="h-4 w-4" />}
          >
            {copiado ? "Copiado!" : "Copiar tudo"}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[13px] text-muted">
          <IconAlert className="h-4 w-4" style={{ color: "var(--danger)" }} />
          <span>Copie e encaminhe para quem for corrigir o documento.</span>
        </div>
        {toggle && (
          <div className="rounded-card border border-border bg-surface-2 p-3">
            <Checkbox label={toggle.label} checked={toggle.checked} onChange={(e) => toggle.onChange(e.target.checked)} />
          </div>
        )}
        <pre
          id="relatorio-erros-texto"
          className="max-h-[55vh] overflow-auto whitespace-pre-wrap break-words rounded-card border border-border bg-surface-2 p-4 font-mono text-[12.5px] leading-relaxed text-text-2"
        >
          {texto}
        </pre>
      </div>
    </Modal>
  );
}
