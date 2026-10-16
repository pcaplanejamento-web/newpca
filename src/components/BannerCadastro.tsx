"use client";

import { type ReactNode, useState } from "react";
import { Button } from "./Button";
import { LinhaCampo, useCadeados } from "./CampoCadeado";
import { cellCls } from "./formStyles";
import { IconSave } from "./icons";
import { Modal } from "./Modal";
import { SecaoBanner, ValorCampo } from "./SecaoBanner";
import { Selecao } from "./Selecao";

/** Um campo do cadastro: texto (com filtro opcional) ou escolha entre opções. */
export type CampoCadastro = {
  chave: string;
  label: string;
  span?: boolean;
  mono?: boolean;
  placeholder?: string;
  max?: number;
  obrigatorio?: boolean;
  inputMode?: "numeric" | "text";
  /** Limpa o que se digita (ex.: só dígitos). */
  filtro?: (v: string) => string;
  /** Escolha (o `<select>` destravado); o valor só-leitura mostra o rótulo da opção. */
  opcoes?: { valor: string; rotulo: string }[];
  /** A explicação abaixo do campo. */
  dica?: string;
};

/**
 * O BANNER DE UM CADASTRO (órgão, unidade) no padrão do banner do usuário: os dados por CADEADO (no cadastro NOVO, já
 * abertos), "Salvar alterações" com SÓ o que mudou (fechar com alteração pede confirmação) e as demais seções e ações de
 * quem usa (`children`, `rodapeEsquerda`).
 */
export function BannerCadastro({
  aberto,
  novo,
  titulo,
  cabecalho,
  campos,
  inicial,
  ocupado,
  rodapeEsquerda,
  onSalvar,
  onFechar,
  confirmarDescarte,
  children,
}: {
  aberto: boolean;
  novo: boolean;
  titulo: string;
  cabecalho?: ReactNode;
  campos: CampoCadastro[];
  inicial: Record<string, string>;
  ocupado: boolean;
  rodapeEsquerda?: ReactNode;
  /** Grava (`patch` = só o que mudou; no novo, todos). Devolve se deu certo. */
  onSalvar: (patch: Record<string, string>) => Promise<boolean>;
  onFechar: () => void;
  confirmarDescarte: () => Promise<boolean>;
  children?: ReactNode;
}) {
  const chave = JSON.stringify(inicial) + (novo ? ":novo" : "");
  const [r, setR] = useState(inicial);
  const [chaveR, setChaveR] = useState(chave);
  const { abertos, alternar, setAbertos } = useCadeados<string>();
  if (chave !== chaveR) {
    setChaveR(chave);
    setR(inicial);
    setAbertos(new Set());
  }
  const patch: Record<string, string> = {};
  for (const c of campos) if (novo || (r[c.chave] ?? "").trim() !== (inicial[c.chave] ?? "").trim()) patch[c.chave] = (r[c.chave] ?? "").trim();
  const mudou = campos.some((c) => (r[c.chave] ?? "").trim() !== (inicial[c.chave] ?? "").trim());
  const sujo = !novo && mudou;
  const faltando = campos.find((c) => c.obrigatorio && !(r[c.chave] ?? "").trim());

  async function fechar() {
    if (ocupado) return;
    if (mudou && !(await confirmarDescarte())) return;
    setR(inicial);
    setAbertos(new Set());
    onFechar();
  }

  async function salvar() {
    if (await onSalvar(patch)) setAbertos(new Set());
  }

  return (
    <Modal
      open={aberto}
      onClose={() => void fechar()}
      bloqueado={ocupado}
      size="xl"
      titulo={titulo}
      cabecalho={cabecalho}
      rodape={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          {rodapeEsquerda ?? <span />}
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={ocupado} onClick={() => void fechar()}>
              Fechar
            </Button>
            <Button
              size="sm"
              loading={ocupado}
              disabled={(!novo && !sujo) || !!faltando}
              title={faltando ? `Informe: ${faltando.label}` : undefined}
              icon={<IconSave className="h-4 w-4" />}
              onClick={() => void salvar()}
            >
              {novo ? "Cadastrar" : "Salvar alterações"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-[var(--gap-block)]">
        <SecaoBanner titulo="Dados" acao={novo ? undefined : <span className="text-[12px] text-muted">Toque no cadeado para editar</span>}>
          <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
            {campos.map((c) => {
              const aberto = novo || abertos.has(c.chave);
              const v = r[c.chave] ?? "";
              const set = (x: string) => setR((o) => ({ ...o, [c.chave]: c.filtro ? c.filtro(x) : x }));
              return (
                <LinhaCampo key={c.chave} label={c.label} span={c.span} editavel={!novo} aberto={abertos.has(c.chave)} bloqueado={false} onLock={() => alternar(c.chave)}>
                  {aberto ? (
                    c.opcoes ? (
                      <Selecao className={cellCls} value={v} onChange={(e) => set(e.target.value)} aria-label={c.label} disabled={ocupado}>
                        {c.opcoes.map((o) => (
                          <option key={o.valor} value={o.valor}>
                            {o.rotulo}
                          </option>
                        ))}
                      </Selecao>
                    ) : (
                      <input
                        className={`${cellCls} ${c.mono ? "font-mono" : ""}`}
                        value={v}
                        onChange={(e) => set(e.target.value)}
                        maxLength={c.max}
                        placeholder={c.placeholder}
                        inputMode={c.inputMode}
                        aria-label={c.label}
                        disabled={ocupado}
                      />
                    )
                  ) : (
                    <ValorCampo>
                      <span className={c.mono ? "font-mono" : ""}>{(c.opcoes ? c.opcoes.find((o) => o.valor === v)?.rotulo : v) || "—"}</span>
                    </ValorCampo>
                  )}
                  {c.dica && aberto && <p className="mt-1 text-[12px] text-muted">{c.dica}</p>}
                </LinhaCampo>
              );
            })}
          </div>
        </SecaoBanner>
        {children}
      </div>
    </Modal>
  );
}
