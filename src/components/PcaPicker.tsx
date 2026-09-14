"use client";

import { Callout } from "./Callout";
import { inputCls, labelCls } from "./formStyles";
import { IconAlert, IconCheck } from "./icons";

/** PCA disponível para escolha (registrado em Configurações). */
export type PcaOpcao = { id: number; nome: string; ano: number | null };

/**
 * Seletor do **PCA do processo** (ano). O sistema ADIVINHA o ano pela descrição
 * (`detectado`); o usuário confirma/escolhe entre os PCAs **cadastrados em
 * Configurações**. Guarda o **ano** (integer) — a fonte é a lista de PCAs. É
 * obrigatório: sem PCA definido, não se protocola / importa (regra do produto).
 * Componente controlado, só com peças do design-system.
 */
export function PcaPicker({
  pcas,
  value,
  detectado = null,
  disabled = false,
  onChange,
}: {
  pcas: PcaOpcao[];
  value: number | null;
  detectado?: number | null;
  disabled?: boolean;
  onChange: (ano: number | null) => void;
}) {
  // Só PCAs com ano são selecionáveis (o ano é o que se grava).
  const opcoes = pcas.filter((p) => p.ano != null);
  const detectadoCadastrado = detectado != null && opcoes.some((p) => p.ano === detectado);

  return (
    <div>
      <label className={labelCls} htmlFor="pca-picker">
        PCA do processo (ano) <span style={{ color: "var(--danger)" }}>*</span>
      </label>
      <select
        id="pca-picker"
        className={inputCls}
        value={value ?? ""}
        disabled={disabled || opcoes.length === 0}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      >
        <option value="">— Selecione o PCA —</option>
        {opcoes.map((p) => (
          <option key={p.id} value={p.ano ?? ""}>
            {p.nome}
            {p.ano != null ? ` · ${p.ano}` : ""}
          </option>
        ))}
      </select>

      {opcoes.length === 0 ? (
        <Callout kind="warn" icon={<IconAlert className="h-4 w-4" />} className="mt-2">
          Nenhum PCA cadastrado. Cadastre um PCA em <span className="font-semibold">Configurações</span> para poder
          definir o PCA do processo.
        </Callout>
      ) : value == null && detectado != null && !detectadoCadastrado ? (
        <Callout kind="warn" icon={<IconAlert className="h-4 w-4" />} className="mt-2">
          Detectei menção ao <span className="font-semibold">PCA {detectado}</span> na descrição, mas ele não está
          cadastrado. Selecione um PCA cadastrado (ou cadastre-o em Configurações).
        </Callout>
      ) : value != null && detectado === value ? (
        <Callout kind="ok" icon={<IconCheck className="h-4 w-4" />} className="mt-2">
          PCA <span className="font-semibold">{value}</span> reconhecido automaticamente pela descrição. Confirme ou
          ajuste.
        </Callout>
      ) : value == null ? (
        <p className="mt-1.5 text-xs text-muted">Defina o PCA para poder prosseguir.</p>
      ) : null}
    </div>
  );
}
