"use client";

import { useCallback, useEffect, useState } from "react";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import { ABAS_PUBLICAS, type ConfigPublico, ROTULO_ABA_PUBLICA } from "@/lib/publico-core";
import { Ajuda, TopicoAjuda } from "./Ajuda";
import { Button } from "./Button";
import { ErroCarga } from "./ErroCarga";
import { IconSave } from "./icons";
import { SkeletonLinhas } from "./Skeleton";
import { Switch } from "./Switch";
import { toast } from "./Toast";

const DICA: Record<(typeof ABAS_PUBLICAS)[number], string> = {
  dashboard: "Sempre pública: os números, gráficos e a consulta do PCA publicado",
  orcamento: "O PCA × Orçamento por unidade (sem o Comparativo do CUBO, vínculos e visões)",
  documentos: "Os documentos vinculados ao PCA — só para ver, sem baixar e sem quem enviou",
};

/** Os CAMPOS da tela pública (controlados) — a tela do ADM e o catálogo. O Dashboard fica sempre ligado. */
export function CamposPublico({ valor, onChange }: { valor: ConfigPublico; onChange: (v: ConfigPublico) => void }) {
  return (
    <div className="grid gap-x-4 sm:grid-cols-2">
      <Switch
        checked={valor.menu === "recolhido"}
        onChange={(v) => onChange({ ...valor, menu: v ? "recolhido" : "aberto" })}
        label="Menu lateral começa recolhido"
        dica="No computador, a tela pública abre com o menu no trilho de ícones; o visitante expande quando quiser"
      />
      <Switch
        checked={valor.cartoesSoImagem}
        onChange={(v) => onChange({ ...valor, cartoesSoImagem: v })}
        label="Cartões dos PCAs só com a imagem"
        dica="No seletor de PCA da tela pública, os cartões mostram só a capa — sem status, fonte e números"
      />
      {ABAS_PUBLICAS.map((a) => (
        <Switch
          key={a}
          checked={valor.abas.includes(a)}
          disabled={a === "dashboard"}
          onChange={(v) => onChange({ ...valor, abas: ABAS_PUBLICAS.filter((x) => (x === a ? v : valor.abas.includes(x))) })}
          label={ROTULO_ABA_PUBLICA[a]}
          dica={DICA[a]}
        />
      ))}
    </div>
  );
}

/** Configurações → TELA PÚBLICA (ADM): quais abas do PCA aparecem no menu da consulta sem login. */
export function PublicoAdmin() {
  const [c, setC] = useState<ConfigPublico | null>(null);
  const [salvo, setSalvo] = useState<ConfigPublico | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const carregar = useCallback(() => {
    chamar<{ publico: ConfigPublico }>("/api/admin/publico")
      .then((j) => {
        setC(j.publico);
        setSalvo(j.publico);
        setErro(null);
      })
      .catch((e) => setErro((e as Error).message));
  }, []);
  useEffect(carregar, [carregar]);
  if (erro && !c) return <ErroCarga msg={erro} onTentar={carregar} />;
  if (!c) return <SkeletonLinhas linhas={3} />;
  const salvar = async () => {
    setSalvando(true);
    try {
      const j = await chamar<{ publico: ConfigPublico }>("/api/admin/publico", "PATCH", c);
      setC(j.publico);
      setSalvo(j.publico);
      toast.success("Tela pública salva — vale em até 1 minuto.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };
  return (
    <div className="space-y-[var(--gap-block)] rounded-card border border-border bg-surface p-[var(--pad-card)] shadow-ring">
      <div className="flex items-center gap-2">
        <p className="flex-1 text-[15px] font-semibold text-text">Tela pública</p>
        <Ajuda titulo="Tela pública">
          <TopicoAjuda titulo="Como funciona">
            A tela inicial (sem login) mostra o PCA PUBLICADO com um menu lateral. As abas ligadas aqui aparecem no menu; as
            demais não são enviadas pelo servidor — nem digitando o endereço.
          </TopicoAjuda>
          <TopicoAjuda titulo="O que nunca é público">Mesa, Importação e Configuração do PCA, e qualquer PCA em Preview.</TopicoAjuda>
        </Ajuda>
      </div>
      <CamposPublico valor={c} onChange={setC} />
      <div className="flex justify-end">
        <Button size="sm" icon={<IconSave className="h-4 w-4" />} loading={salvando} disabled={salvando || JSON.stringify(c) === JSON.stringify(salvo)} onClick={salvar} title="Salvar a tela pública">
          Salvar
        </Button>
      </div>
    </div>
  );
}
