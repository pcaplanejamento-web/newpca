"use client";

import { useCallback, useEffect, useState } from "react";
import { type ConfigEscopo, MODULOS_ESCOPO, type ModoCatalogo, ROTULO_MODULO_ESCOPO } from "@/lib/escopo-cabecalho-core";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import { Ajuda, TopicoAjuda } from "./Ajuda";
import { Button } from "./Button";
import { ErroCarga } from "./ErroCarga";
import { IconSave } from "./icons";
import { Segmented } from "./Segmented";
import { SkeletonLinhas } from "./Skeleton";
import { Switch } from "./Switch";
import { toast } from "./Toast";

/** Os CAMPOS do filtro da unidade do cabeçalho (controlados) — a tela do ADM e o catálogo. */
export function CamposEscopo({ valor, onChange }: { valor: ConfigEscopo; onChange: (v: ConfigEscopo) => void }) {
  return (
    <div className="space-y-[var(--gap-block)]">
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Switch checked disabled onChange={() => {}} label="Mesa" dica="A Mesa sempre obedece à unidade do cabeçalho" />
        {MODULOS_ESCOPO.map((m) => (
          <Switch
            key={m}
            checked={valor.modulos[m]}
            onChange={(v) => onChange({ ...valor, modulos: { ...valor.modulos, [m]: v } })}
            label={ROTULO_MODULO_ESCOPO[m]}
            dica={`${ROTULO_MODULO_ESCOPO[m]} mostra só os dados da unidade escolhida no cabeçalho`}
          />
        ))}
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-text">Catálogo com uma unidade escolhida</p>
        <Segmented<ModoCatalogo>
          ariaLabel="Catálogo com uma unidade escolhida"
          value={valor.catalogo}
          disabled={!valor.modulos.catalogo}
          onChange={(catalogo) => onChange({ ...valor, catalogo })}
          options={[
            { value: "usados", label: "Só os itens usados", dica: "Só os itens e históricos cujo código aparece nos DFDs da unidade" },
            { value: "todos", label: "Catálogo inteiro", dica: "O catálogo é de referência: mostra tudo" },
          ]}
        />
      </div>
      <Switch checked={valor.orcamentoSemVinculo} disabled={!valor.modulos.orcamento && !valor.modulos.pca} onChange={(orcamentoSemVinculo) => onChange({ ...valor, orcamentoSemVinculo })} label="Orçamento: mostrar também os lançamentos sem vínculo" dica="Os lançamentos que nenhum vínculo leva a uma unidade" />
      <Switch checked={valor.tarefasSemVinculo} disabled={!valor.modulos.tarefas && !valor.modulos.calendario} onChange={(tarefasSemVinculo) => onChange({ ...valor, tarefasSemVinculo })} label="Tarefas e Calendário: mostrar também as tarefas sem vínculo" dica="As tarefas sem protocolo, DFD ou item vinculado" />
    </div>
  );
}

/** Configurações → FILTRO DA UNIDADE (ADM): quais telas obedecem à unidade escolhida no cabeçalho. */
export function EscopoCabecalhoAdmin() {
  const [c, setC] = useState<ConfigEscopo | null>(null);
  const [salvo, setSalvo] = useState<ConfigEscopo | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const carregar = useCallback(() => {
    chamar<{ escopo: ConfigEscopo }>("/api/admin/escopo-cabecalho")
      .then((j) => {
        setC(j.escopo);
        setSalvo(j.escopo);
        setErro(null);
      })
      .catch((e) => setErro((e as Error).message));
  }, []);
  useEffect(carregar, [carregar]);
  if (erro && !c) return <ErroCarga msg={erro} onTentar={carregar} />;
  if (!c) return <SkeletonLinhas linhas={4} />;
  const salvar = async () => {
    setSalvando(true);
    try {
      const j = await chamar<{ escopo: ConfigEscopo }>("/api/admin/escopo-cabecalho", "PATCH", c);
      setC(j.escopo);
      setSalvo(j.escopo);
      toast.success("Filtro da unidade salvo — vale em até 1 minuto.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };
  return (
    <div className="space-y-[var(--gap-block)] rounded-card border border-border bg-surface p-[var(--pad-card)] shadow-ring">
      <div className="flex items-center gap-2">
        <p className="flex-1 text-[15px] font-semibold text-text">Filtro da unidade do cabeçalho</p>
        <Ajuda titulo="Filtro da unidade">
          <TopicoAjuda titulo="Como funciona">
            Escolhida uma unidade no cabeçalho, as telas ligadas aqui mostram só os dados dela — o filtro é feito no servidor.
            "Geral" mostra tudo, como sempre. A Mesa sempre obedece.
          </TopicoAjuda>
          <TopicoAjuda titulo="Por módulo">
            PCA: itens e planilhas da unidade. Orçamento: os lançamentos que os vínculos levam à unidade. Catálogo: os itens
            usados nos DFDs da unidade (ou tudo). Tarefas e Calendário: as tarefas vinculadas a protocolo, DFD ou item da
            unidade. Automação: os protocolos da unidade.
          </TopicoAjuda>
        </Ajuda>
      </div>
      <CamposEscopo valor={c} onChange={setC} />
      <div className="flex justify-end">
        <Button size="sm" icon={<IconSave className="h-4 w-4" />} loading={salvando} disabled={salvando || JSON.stringify(c) === JSON.stringify(salvo)} onClick={salvar} title="Salvar o filtro da unidade">
          Salvar
        </Button>
      </div>
    </div>
  );
}
