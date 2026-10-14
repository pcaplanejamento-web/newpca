"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { brl, num } from "@/lib/format";
import type { AlvosVinculo, VinculoOrcamento } from "@/lib/orcamento-vinculo";
import { aplicarVisao, atributosVisao, contarAusentes, resumoVisao, type VisaoOrcamento, valoresAusentes } from "@/lib/orcamento-visao";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { EditorVisaoOrcamento, type LinhaVisaoOrcamento } from "./EditorVisaoOrcamento";
import { SelectField } from "./Field";
import { IconEye,
  IconPencil, IconPlus } from "./icons";
import { Modal } from "./Modal";
import { toast } from "./Toast";

/**
 * A gravação da VISÃO do PCA (fonte única do modal da engrenagem e do `SeletorVisaoPca` da barra): `PATCH /api/pca/[id]`
 * `{orcamentoVisaoId}` → aviso + `router.refresh` (KPIs, tabela e relatório recalculam). Falhou → volta ao gravado.
 */
export function useVisaoDoPca(pcaId: number, visaoId: number | null) {
  const router = useRouter();
  const [escolha, setEscolha] = useState<number | null>(visaoId);
  const [salvando, setSalvando] = useState(false);
  // O recálculo da tela (router.refresh) também conta: o aviso "carregando" só sai quando os números novos chegaram.
  const [recarregando, iniciar] = useTransition();
  const aviso = useRef<string | null>(null);
  const gravando = salvando || recarregando;
  useEffect(() => {
    if (!recarregando && aviso.current) {
      toast.success(aviso.current);
      aviso.current = null;
    }
  }, [recarregando]);
  // A tela recarregou com outra visão gravada (aqui ou pela engrenagem) — ela vale.
  useEffect(() => setEscolha(visaoId), [visaoId]);

  async function gravar(id: number | null, msg = "Visão do orçamento do PCA salva.") {
    if (gravando) return;
    setSalvando(true);
    setEscolha(id);
    toast.progresso("Aplicando a visão do orçamento", 0, 3, "Enviando ao servidor…");
    try {
      const r = await fetch(`/api/pca/${pcaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orcamentoVisaoId: id }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Não foi possível salvar a visão do PCA.");
      toast.progresso("Aplicando a visão do orçamento", 2, 3, "Visão salva — recalculando os valores…");
      aviso.current = msg;
      iniciar(() => router.refresh());
    } catch (e) {
      setEscolha(visaoId);
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a visão do PCA.");
    } finally {
      setSalvando(false);
    }
  }
  return { escolha, setEscolha, gravando, gravar };
}

/**
 * A VISÃO do orçamento do PCA NA BARRA do PCA × Orçamento (à vista, sem abrir a engrenagem): `SelectField compacto` com o
 * orçamento inteiro e as visões salvas (o resumo de cada uma na dica); escolher grava na hora no PCA (`useVisaoDoPca`). Sem
 * `podeEscolher`, mostra a visão em uso travada. Editar/criar visões segue pela engrenagem.
 */
export function SeletorVisaoPca({
  pcaId,
  visaoId,
  visoes,
  podeEscolher,
  itens,
  onEditar,
  onVer,
}: {
  pcaId: number;
  visaoId: number | null;
  visoes: VisaoOrcamento[];
  /** Pode trocar a visão do PCA (quem visualiza o PCA — escolher como ver não é configurar). */
  podeEscolher: boolean;
  /** Os lançamentos do orçamento do ano — o ponto âmbar na visão com valores que ele não traz. */
  itens?: LinhaVisaoOrcamento[] | null;
  /** Editar a visão escolhida / criar uma nova (no editor da engrenagem) — as ações no rodapé da lista. */
  onEditar?: (alvo: VisaoOrcamento | "nova") => void;
  /** Ver as configurações da visão em uso (filtros e vínculos), só leitura — o olho ao lado; ausente = sem o olho. */
  onVer?: (v: VisaoOrcamento) => void;
}) {
  const { escolha, gravando, gravar } = useVisaoDoPca(pcaId, visaoId);
  const atual = visoes.find((v) => v.id === escolha) ?? null;
  const dica = atual ? `${atual.nome} — ${resumoVisao(atual.filtros)}` : "Orçamento inteiro (sem visão)";
  const ausentes = useMemo(() => new Map(visoes.map((v) => [v.id, itens ? contarAusentes(valoresAusentes(itens, v.filtros)) : 0])), [visoes, itens]);
  const acoes = onEditar
    ? [
        ...(atual ? [{ rotulo: "Editar esta visão", icone: <IconPencil className="h-4 w-4" />, onClick: () => onEditar(atual) }] : []),
        { rotulo: "Nova visão", icone: <IconPlus className="h-4 w-4" />, onClick: () => onEditar("nova") },
      ]
    : undefined;
  return (
    <div className="flex min-w-0 items-center gap-1.5" title={podeEscolher ? dica : `${dica} — sem acesso ao PCA para trocar a visão`}>
      <div className="min-w-0 flex-1">
      <SelectField
        compacto
        label="Visão"
        value={escolha ?? ""}
        disabled={!podeEscolher || gravando}
        aria-busy={gravando || undefined}
        acoes={acoes}
        onChange={(e) => void gravar(e.target.value ? Number(e.target.value) : null)}
      >
        <option value="" data-detalhe="Todos os lançamentos do orçamento do ano">
          Orçamento inteiro
        </option>
        {visoes.length > 0 && (
          <optgroup label="Visões salvas">
            {visoes.map((v) => (
              <option key={v.id} value={v.id} {...atributosVisao(v, ausentes.get(v.id) ?? 0)}>
                {v.nome}
              </option>
            ))}
          </optgroup>
        )}
      </SelectField>
      </div>
      {onVer && (
        <Button
          size="sm"
          variant="icon"
          icon={<IconEye className="h-4 w-4" />}
          disabled={!atual || gravando}
          aria-label={atual ? `Ver as configurações da visão ${atual.nome}` : "Ver as configurações da visão"}
          title={atual ? `Ver as configurações da visão "${atual.nome}" (só consulta)` : "Orçamento inteiro — sem filtros nem vínculos próprios"}
          onClick={() => atual && onVer(atual)}
        />
      )}
    </div>
  );
}

/**
 * A VISÃO DO ORÇAMENTO do PCA pela ENGRENAGEM da aba Orçamento (contêiner): escolher a visão (grava na hora no PCA —
 * `PATCH /api/pca/[id]`, o mesmo da Configuração) e, para quem configura o Orçamento, EDITAR a visão escolhida ou criar
 * uma NOVA (que já vira a do PCA) no MESMO editor da tela do orçamento (`EditorVisaoOrcamento`). Mostra o Σ que cada
 * escolha pega do orçamento do ano, os outros PCAs que usam a visão e os valores que o orçamento atual não traz.
 */
export function VisaoOrcamentoPca({
  pcaId,
  aberto,
  onFechar,
  visaoId,
  visoes,
  itens,
  podeEditarVisao,
  vinculos,
  alvos,
  editorPedido,
}: {
  pcaId: number;
  aberto: boolean;
  onFechar: () => void;
  /** A visão gravada no PCA (`null` = orçamento inteiro). */
  visaoId: number | null;
  visoes: VisaoOrcamento[];
  /** Os lançamentos do orçamento do ano (`null` = nenhum importado — escolher vale, editar não). */
  itens: LinhaVisaoOrcamento[] | null;
  /** Configura o ORÇAMENTO (as visões são de lá e globais). */
  podeEditarVisao: boolean;
  /** TODOS os vínculos + os alvos — a aba Vínculos do banner da visão. */
  vinculos?: VinculoOrcamento[];
  alvos?: AlvosVinculo;
  /** Abrir o editor DIRETO (as ações da lista da Visão na barra) — cada pedido novo (`n`) abre. */
  editorPedido?: { alvo: VisaoOrcamento | "nova"; n: number } | null;
}) {
  const router = useRouter();
  const { escolha, setEscolha, gravando, gravar } = useVisaoDoPca(pcaId, visaoId);
  const [editor, setEditor] = useState<VisaoOrcamento | "nova" | null>(null);

  useEffect(() => {
    if (editorPedido) setEditor(editorPedido.alvo);
  }, [editorPedido]);

  // Abriu — parte do que está gravado no PCA.
  useEffect(() => {
    if (aberto) setEscolha(visaoId);
  }, [aberto, visaoId, setEscolha]);

  const visao = visoes.find((v) => v.id === escolha) ?? null;
  const total = useMemo(() => (itens ?? []).reduce((s, i) => s + i.valorInicial, 0), [itens]);
  const naVisao = useMemo(() => (itens && visao ? aplicarVisao(itens, visao.filtros) : (itens ?? [])), [itens, visao]);
  const soma = naVisao.reduce((s, i) => s + i.valorInicial, 0);
  const ausentes = useMemo(() => (itens && visao ? contarAusentes(valoresAusentes(itens, visao.filtros)) : 0), [itens, visao]);
  const outros = (visao?.pcas ?? []).length - (visaoId != null && visaoId === visao?.id ? 1 : 0);

  return (
    <>
      <Modal open={aberto && editor == null} onClose={onFechar} bloqueado={gravando} size="md" titulo="Visão do orçamento do PCA">
        <div className="space-y-[var(--gap-block)]">
          <p className="text-sm text-muted">Os lançamentos do orçamento do ano que contam para este PCA (KPIs, PCA × Orçamento, Comparativo e relatório).</p>
          <SelectField
            label="Visão"
            value={escolha ?? ""}
            disabled={gravando}
            onChange={(e) => void gravar(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Orçamento inteiro (sem visão)</option>
            {visoes.length > 0 && (
              <optgroup label="Visões salvas">
                {visoes.map((v) => (
                  <option key={v.id} value={v.id} {...atributosVisao(v, itens ? contarAusentes(valoresAusentes(itens, v.filtros)) : 0)}>
                    {v.nome}
                  </option>
                ))}
              </optgroup>
            )}
          </SelectField>
          {itens ? (
            <p className="text-sm text-text-2">
              Considera <b className="tabular-nums">{brl(soma)}</b> de <span className="tabular-nums">{brl(total)}</span> ·{" "}
              {num(naVisao.length)} {naVisao.length === 1 ? "lançamento" : "lançamentos"}
            </p>
          ) : (
            <Callout kind="warn">Nenhum orçamento do ano importado — a visão vale quando ele chegar.</Callout>
          )}
          {outros > 0 && (
            <Callout kind="info">
              Também usada por {num(outros)} outro(s) PCA(s) — editar a visão muda o orçamento deles junto.
            </Callout>
          )}
          {ausentes > 0 && (
            <Callout kind="warn">
              {num(ausentes)} valor(es) da visão não existem no orçamento atual e não contam nada — edite a visão e use “Remover
              ausentes”.
            </Callout>
          )}
          {!podeEditarVisao && itens && visao && (
            <Button size="sm" variant="secondary" icon={<IconEye className="h-4 w-4" />} onClick={() => setEditor(visao)}>
              Ver o que esta visão define
            </Button>
          )}
          {podeEditarVisao && itens && (
            <div className="flex flex-wrap gap-2">
              {visao && (
                <Button size="sm" variant="secondary" icon={<IconPencil className="h-4 w-4" />} disabled={gravando} onClick={() => setEditor(visao)}>
                  Editar esta visão
                </Button>
              )}
              <Button size="sm" variant="secondary" icon={<IconPlus className="h-4 w-4" />} disabled={gravando} onClick={() => setEditor("nova")}>
                Nova visão
              </Button>
            </div>
          )}
        </div>
      </Modal>
      {itens && (
        <EditorVisaoOrcamento
          aberta={editor}
          itens={itens}
          podeEditar={podeEditarVisao}
          vinculos={vinculos}
          alvos={alvos}
          visoes={visoes}
          onFechar={() => setEditor(null)}
          onSalva={(r) => {
            setEditor(null);
            if (r.nova) void gravar(r.id, `Visão "${r.nome}" criada e usada neste PCA.`);
            else {
              toast.success("Visão atualizada.");
              router.refresh();
            }
          }}
        />
      )}
    </>
  );
}
