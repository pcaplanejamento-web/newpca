"use client";

import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { baixarNoNavegador, comoBlob } from "@/lib/arquivo-navegador";
import { brl, dataHoraBR, num } from "@/lib/format";
import { itensDoTexto } from "@/lib/itens-dash-texto";
import { rgbDaPaleta } from "@/lib/documento-pdf-gerar";
import {
  AUTOMATICOS,
  type Automatico,
  type Autoridade,
  camposComExemplo,
  COLUNAS_ITEM_DOC,
  type ConfigDocumentoPca,
  type ColunaItemDoc,
  LIMITES_DOC,
  lerConfigDocumento,
  marcadoresDesconhecidos,
  nomeArquivoDocumento,
  ORDEM_COLUNAS,
  type SecaoDocumento,
  textoConfig,
} from "@/lib/pca-documento-core";
import { type PacoteDocumento, PALETA_DOCUMENTO_PCA, paginasDocumentoPca } from "@/lib/pca-documento-pdf";
import { AcoesCadastro } from "./AcoesCadastro";
import { Ajuda } from "./Ajuda";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { CampoLinhaComDados } from "./CampoLinhaComDados";
import { type Column, DataTable } from "./DataTable";
import { EditorRico } from "./EditorRico";
import { Checkbox, TextField } from "./Field";
import { IconArrowDown, IconArrowUp, IconDownload, IconPlus, IconRefresh } from "./icons";
import { PreviaPaginas } from "./PreviaPaginas";
import { Progress } from "./Progress";
import { SecaoBanner } from "./SecaoBanner";
import { Switch } from "./Switch";
import { toast } from "./Toast";

export type EmissaoResumo = { codigo: string; emitidoEm: string; itens: number; valor: number; dfds: number; ipHash: string | null };

const COLS_EMISSOES: Column<EmissaoResumo>[] = [
  { key: "em", header: "Emitido em", nowrap: true, value: (e) => e.emitidoEm, render: (e) => dataHoraBR(e.emitidoEm) },
  { key: "codigo", header: "Código", nowrap: true, value: (e) => e.codigo, render: (e) => <span className="font-mono text-[12px]">{e.codigo}</span> },
  { key: "itens", header: "Itens", nowrap: true, filter: "range", numero: (e) => e.itens, render: (e) => num(e.itens) },
  { key: "dfds", header: "DFDs", nowrap: true, filter: "range", numero: (e) => e.dfds, render: (e) => num(e.dfds) },
  { key: "valor", header: "Valor", align: "right", nowrap: true, filter: "range", numero: (e) => e.valor, render: (e) => <span className="tabular-nums">{brl(e.valor)}</span> },
  { key: "origem", header: "Origem", nowrap: true, value: (e) => e.ipHash ?? "—", render: (e) => <span className="font-mono text-[12px] text-muted">{e.ipHash ?? "—"}</span>, total: false },
];

/** Quantas linhas das listas longas (itens, DFDs) a prévia na tela desenha — os NÚMEROS são do PCA inteiro. */
const LINHAS_NA_PREVIA = 40;

/** O rascunho não salvo fica na ABA (sair da tela — outra aba do PCA, o menu — e voltar não perde nada). */
const chaveRascunho = (pcaId: number) => `documento-pca:rascunho:${pcaId}`;
function lerRascunho(pcaId: number): ConfigDocumentoPca | null {
  try {
    const t = sessionStorage.getItem(chaveRascunho(pcaId));
    return t ? lerConfigDocumento(JSON.parse(t)) : null;
  } catch {
    return null;
  }
}
function gravarRascunho(pcaId: number, cfg: ConfigDocumentoPca | null) {
  try {
    if (cfg) sessionStorage.setItem(chaveRascunho(pcaId), textoConfig(cfg));
    else sessionStorage.removeItem(chaveRascunho(pcaId));
  } catch {
    /* sem armazenamento: vale só o aviso ao fechar a página */
  }
}

/** Uma lista de pessoas (cargo + nome) — o expediente e as assinaturas. */
function ListaAutoridades({ lista, onMudar, rotulo }: { lista: Autoridade[]; onMudar: (l: Autoridade[]) => void; rotulo: string }) {
  const mudar = (i: number, p: Partial<Autoridade>) => onMudar(lista.map((a, k) => (k === i ? { ...a, ...p } : a)));
  return (
    <div className="space-y-2">
      {lista.length === 0 && <p className="text-[13px] text-muted">Nenhuma pessoa.</p>}
      {lista.map((a, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <TextField label={`Cargo ${i + 1}`} value={a.cargo} maxLength={LIMITES_DOC.campo} onChange={(e) => mudar(i, { cargo: e.target.value })} compacto />
          <TextField label={`Nome ${i + 1}`} value={a.nome} maxLength={LIMITES_DOC.campo} onChange={(e) => mudar(i, { nome: e.target.value })} compacto />
          <AcoesCadastro
            nome={a.nome || a.cargo || rotulo}
            primeira={i === 0}
            ultima={i === lista.length - 1}
            onMover={(d) => {
              const l = [...lista];
              [l[i], l[i + d]] = [l[i + d], l[i]];
              onMudar(l);
            }}
            onExcluir={() => onMudar(lista.filter((_, k) => k !== i))}
          />
        </div>
      ))}
      {lista.length < LIMITES_DOC.autoridades && (
        <Button variant="secondary" size="sm" icon={<IconPlus className="h-4 w-4" />} onClick={() => onMudar([...lista, { cargo: "", nome: "" }])}>
          Acrescentar {rotulo}
        </Button>
      )}
    </div>
  );
}

/**
 * As COLUNAS da relação dos itens: quais saem (a caixa), em que ORDEM (↑/↓) e com que TÍTULO. As que saem vêm primeiro, na
 * ordem do documento; as demais embaixo. Só o sequencial é obrigatório (identifica o item no PCA).
 */
function ColunasDosItens({ cfg, muda }: { cfg: ConfigDocumentoPca; muda: (p: Partial<ConfigDocumentoPca>) => void }) {
  const ocultas = ORDEM_COLUNAS.filter((c) => !cfg.colunas.includes(c));
  const mover = (i: number, d: -1 | 1) => {
    const l = [...cfg.colunas];
    [l[i], l[i + d]] = [l[i + d], l[i]];
    muda({ colunas: l });
  };
  const titulo = (c: ColunaItemDoc, v: string) => muda({ titulosColunas: { ...cfg.titulosColunas, [c]: v } });
  const linha = (c: ColunaItemDoc, i: number | null) => {
    const def = COLUNAS_ITEM_DOC[c];
    const visivel = i != null;
    return (
      <li key={c} className={`grid items-center gap-2 py-2 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_auto] ${visivel ? "" : "opacity-70"}`}>
        <Checkbox
          label={
            <span className="min-w-0">
              <span className="block text-[13px] font-medium text-text">
                {def.titulo}
                {def.fixa ? " (sempre)" : ""}
              </span>
              <span className="block text-[11.5px] text-muted">{def.descricao}</span>
            </span>
          }
          checked={visivel}
          disabled={def.fixa}
          onChange={() => muda({ colunas: visivel ? cfg.colunas.filter((x) => x !== c) : [...cfg.colunas, c] })}
        />
        <TextField
          aria-label={`Título da coluna ${def.titulo}`}
          value={cfg.titulosColunas[c] ?? ""}
          placeholder={def.titulo}
          maxLength={LIMITES_DOC.tituloColuna}
          disabled={!visivel}
          onChange={(e) => titulo(c, e.target.value)}
          compacto
        />
        <span className="flex justify-end gap-1">
          {visivel ? (
            <>
              <Button variant="ghost" size="xs" disabled={i === 0} onClick={() => mover(i, -1)} aria-label={`Mover ${def.titulo} para a esquerda`} icon={<IconArrowUp className="h-4 w-4" />} />
              <Button variant="ghost" size="xs" disabled={i === cfg.colunas.length - 1} onClick={() => mover(i, 1)} aria-label={`Mover ${def.titulo} para a direita`} icon={<IconArrowDown className="h-4 w-4" />} />
            </>
          ) : (
            <span className="w-[4.5rem]" aria-hidden="true" />
          )}
        </span>
      </li>
    );
  };
  return (
    <div>
      <p className="text-[12px] font-semibold uppercase tracking-wide text-faint">No documento ({cfg.colunas.length}) — da esquerda para a direita</p>
      <ul className="divide-y divide-border">{cfg.colunas.map((c, i) => linha(c, i))}</ul>
      {ocultas.length > 0 && (
        <>
          <p className="mt-3 text-[12px] font-semibold uppercase tracking-wide text-faint">Fora do documento ({ocultas.length})</p>
          <ul className="divide-y divide-border">{ocultas.map((c) => linha(c, null))}</ul>
        </>
      )}
    </div>
  );
}

/** A cor (CSS ou papel da paleta) na prévia — a mesma do arquivo. */
const corDaPrevia = (css: string) => {
  const [r, g, b] = rgbDaPaleta(css, PALETA_DOCUMENTO_PCA);
  return `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;
};

/**
 * DOCUMENTO OFICIAL DO PCA — a tela de controle do ADM (aba "Documento" do espaço do PCA; cada PCA tem o seu): ligar ou
 * desligar a emissão pública (o botão some da tela inicial), a capa e o timbre, o expediente, as SEÇÕES de texto (com
 * marcadores), os DADOS AUTOMÁTICOS, as colunas dos itens, as notas, as assinaturas, a PRÉVIA ao vivo (e a completa em PDF)
 * e as emissões registradas.
 */
export function DocumentoPcaAdmin({
  pca,
  inicial,
  emissoes,
  totalEmissoes,
}: {
  pca: { id: number; nome: string; ano: number | null; publicado: boolean };
  inicial: ConfigDocumentoPca;
  emissoes: EmissaoResumo[];
  totalEmissoes: number;
}) {
  const router = useRouter();
  const [cfg, setCfg] = useState(inicial);
  const [gravado, setGravado] = useState(() => textoConfig(inicial));
  const [salvando, setSalvando] = useState(false);
  const sujo = textoConfig(cfg) !== gravado;
  const [dados, setDados] = useState<PacoteDocumento["dados"] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [gerando, setGerando] = useState<{ pct: number; texto: string } | null>(null);
  const abortar = useRef<AbortController | null>(null);
  const muda = (p: Partial<ConfigDocumentoPca>) => setCfg((c) => ({ ...c, ...p }));

  // O rascunho guardado na aba volta ao abrir a tela (uma vez, depois do desenho — sem diferença de hidratação).
  const inicialRef = useRef(inicial);
  useEffect(() => {
    const r = lerRascunho(pca.id);
    if (r && textoConfig(r) !== textoConfig(inicialRef.current)) {
      setCfg(r);
      toast.info("Alterações ainda não salvas foram restauradas.");
    } else gravarRascunho(pca.id, null);
  }, [pca.id]);
  useEffect(() => {
    gravarRascunho(pca.id, sujo ? cfg : null);
  }, [pca.id, cfg, sujo]);
  useEffect(() => {
    if (!sujo) return;
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [sujo]);
  useEffect(() => () => abortar.current?.abort(), []);

  const salvar = async () => {
    setSalvando(true);
    const enviado = textoConfig(cfg);
    try {
      const res = await fetch(`/api/pca/${pca.id}/documento/config`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: enviado });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; config?: ConfigDocumentoPca };
      if (!res.ok || !j.ok || !j.config) throw new Error(j.error ?? "Não foi possível salvar.");
      const c = lerConfigDocumento(j.config);
      // O que foi digitado DURANTE a gravação fica (e segue como alteração não salva).
      setCfg((atual) => (textoConfig(atual) === enviado ? c : atual));
      setGravado(textoConfig(c));
      toast.success("Configuração do documento salva.");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  const carregarDados = async (): Promise<PacoteDocumento["dados"] | null> => {
    setCarregando(true);
    try {
      const res = await fetch(`/api/pca/${pca.id}/documento/config?dados=1`, { cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; dados?: PacoteDocumento["dados"] };
      if (!res.ok || !j.ok || !j.dados) throw new Error(j.error ?? "Não foi possível carregar os dados do PCA.");
      setDados(j.dados);
      return j.dados;
    } catch (e) {
      toast.error((e as Error).message);
      return null;
    } finally {
      setCarregando(false);
    }
  };

  const itens = useMemo(() => (dados ? itensDoTexto(dados.itensTexto) : null), [dados]);
  const pcaDoc = useMemo(() => ({ id: pca.id, nome: pca.nome, ano: pca.ano }), [pca.id, pca.nome, pca.ano]);
  const dadosDoc = useMemo(() => (dados && itens ? { pca: pcaDoc, itens, dfds: dados.dfds, unidades: dados.unidades } : null), [dados, itens, pcaDoc]);
  // Os CAMPOS DE DADOS dos textos (o seletor "Dado"), com o valor de agora quando os dados já vieram.
  const campos = useMemo(() => camposComExemplo(dadosDoc, cfg, new Date().toISOString()), [dadosDoc, cfg]);
  // A PRÉVIA na tela = as PÁGINAS do arquivo (os mesmos blocos, medidas, timbre, carimbo, quebras e orientação), com os
  // NÚMEROS do PCA inteiro; só as listas longas mostram as primeiras linhas (o PDF completo traz todas). Calculada sobre o
  // valor ADIADO — digitar não espera a prévia; a resposta de uma configuração antiga é descartada.
  const cfgPrevia = useDeferredValue(cfg);
  const [previa, setPrevia] = useState<Awaited<ReturnType<typeof paginasDocumentoPca>> | null>(null);
  const [erroPrevia, setErroPrevia] = useState<string | null>(null);
  useEffect(() => {
    if (!dados || !dadosDoc) return;
    let vivo = true;
    const t = setTimeout(() => {
      paginasDocumentoPca({ config: cfgPrevia, pca: pcaDoc, dados, emissao: null }, new Date().toISOString(), {
        dados: dadosDoc,
        previa: { itens: LINHAS_NA_PREVIA, dfds: LINHAS_NA_PREVIA },
      })
        .then((r) => {
          if (!vivo) return;
          setPrevia(r);
          setErroPrevia(null);
        })
        .catch((e: Error) => {
          if (vivo) setErroPrevia(e.message || "Não foi possível montar a prévia.");
        });
    }, 120);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [dados, dadosDoc, cfgPrevia, pcaDoc]);

  const baixarPrevia = async () => {
    const d = dados ?? (await carregarDados());
    if (!d) return;
    const ctl = new AbortController();
    abortar.current = ctl;
    setGerando({ pct: 2, texto: "Montando as páginas…" });
    try {
      const { gerarPdfDocumentoPca } = await import("@/lib/pca-documento-pdf");
      const bytes = await gerarPdfDocumentoPca(
        { config: cfg, pca: pcaDoc, dados: d, emissao: null },
        {
          sinal: ctl.signal,
          onProgresso: (p) =>
            setGerando(
              p.etapa === "desenhando"
                ? { pct: 40 + (p.total ? (p.feito / p.total) * 55 : 0), texto: `Desenhando a página ${num(p.feito)} de ${num(p.total)}…` }
                : p.etapa === "montando"
                  ? { pct: 5 + (p.total ? Math.min(1, p.feito / p.total) * 35 : 0), texto: "Montando as páginas…" }
                  : { pct: 97, texto: "Salvando o arquivo…" },
            ),
        },
      );
      ctl.signal.throwIfAborted();
      baixarNoNavegador(`PRÉVIA - ${nomeArquivoDocumento({ pca: pcaDoc })}`, comoBlob(bytes));
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast.error((e as Error).message || "Não foi possível gerar a prévia.");
    } finally {
      abortar.current = null;
      setGerando(null);
    }
  };

  // O ente e o local não levam a si mesmos (o valor seria o próprio texto).
  const camposSemEnte = useMemo(() => campos.filter((c) => c.chave !== "ente"), [campos]);
  const camposSemLocal = useMemo(() => campos.filter((c) => c.chave !== "local"), [campos]);
  const mudarSecao = (i: number, p: Partial<SecaoDocumento>) => muda({ secoes: cfg.secoes.map((s, k) => (k === i ? { ...s, ...p } : s)) });
  const desconhecidos = useMemo(() => marcadoresDesconhecidos([cfg.titulo, cfg.subtitulo, cfg.ente, cfg.local, cfg.notas, ...cfg.secoes.flatMap((s) => [s.titulo, s.texto])].join("\n")), [cfg]);
  const ajudaMarcadores = (
    <Ajuda titulo="Dados nos textos">
      <p>
        Os textos podem levar DADOS do PCA (ano, valor total, número de itens, data da emissão…): toque em <strong>Dado</strong> no campo (ou digite
        “{"{{"}”) e escolha na lista. O dado aparece como um selo e, na emissão, vira o valor do momento.
      </p>
      <ul className="mt-2 space-y-1">
        {campos.map((c) => (
          <li key={c.chave}>
            <span className="campo-dado">{c.rotulo}</span> {c.descricao}
          </li>
        ))}
      </ul>
    </Ajuda>
  );

  return (
    <div className="grid gap-[var(--gap-block)] lg:grid-cols-[minmax(0,1fr)_minmax(320px,440px)]">
      <div className="min-w-0 space-y-[var(--gap-block)]">
        <SecaoBanner titulo="Emissão pública">
          <Switch
            checked={cfg.ativo}
            onChange={(v) => muda({ ativo: v })}
            label="Qualquer pessoa pode emitir o documento na tela inicial"
            dica="Desligado, o item “Emitir o PCA” some do menu da tela inicial e a emissão é recusada."
          />
          {cfg.ativo && !pca.publicado && <Callout kind="warn">O PCA está em Preview: o item só aparece na tela inicial depois de publicado.</Callout>}
        </SecaoBanner>

        <SecaoBanner titulo="Identificação e capa" acao={ajudaMarcadores}>
          <div className="grid gap-3 sm:grid-cols-2">
            <CampoLinhaComDados label="Título" valor={cfg.titulo} campos={campos} maxLength={LIMITES_DOC.titulo} onChange={(v) => muda({ titulo: v })} />
            <CampoLinhaComDados label="Subtítulo" valor={cfg.subtitulo} campos={campos} maxLength={LIMITES_DOC.titulo} onChange={(v) => muda({ subtitulo: v })} />
            <CampoLinhaComDados label="Ente (1ª linha da capa)" valor={cfg.ente} campos={camposSemEnte} maxLength={LIMITES_DOC.campo} onChange={(v) => muda({ ente: v })} />
            <CampoLinhaComDados label="Local (fecho)" valor={cfg.local} campos={camposSemLocal} maxLength={LIMITES_DOC.campo} onChange={(v) => muda({ local: v })} />
          </div>
          <div className="flex flex-col gap-2">
            <Switch checked={cfg.capa} onChange={(v) => muda({ capa: v })} label="Capa (página inicial com o título)" />
            <Switch checked={cfg.timbre} onChange={(v) => muda({ timbre: v })} label="Papel timbrado da Prefeitura em todas as páginas" />
            <Switch checked={cfg.itensPaisagem} onChange={(v) => muda({ itensPaisagem: v })} label="Tabela dos itens em página deitada (mais colunas)" />
          </div>
        </SecaoBanner>

        <SecaoBanner titulo="Expediente (autoridades)">
          <ListaAutoridades lista={cfg.expediente} onMudar={(l) => muda({ expediente: l })} rotulo="pessoa" />
        </SecaoBanner>

        <SecaoBanner
          titulo={`Seções de texto (${cfg.secoes.length})`}
          acao={
            cfg.secoes.length < LIMITES_DOC.secoes && (
              <Button
                variant="secondary"
                size="sm"
                icon={<IconPlus className="h-4 w-4" />}
                onClick={() => {
                  const usados = new Set(cfg.secoes.map((s) => s.id));
                  let n = cfg.secoes.length + 1;
                  while (usados.has(`s${n}`)) n++;
                  muda({ secoes: [...cfg.secoes, { id: `s${n}`, titulo: "Nova seção", texto: "", ativa: true }] });
                }}
              >
                Acrescentar seção
              </Button>
            )
          }
        >
          {desconhecidos.length > 0 && <Callout kind="warn">Marcadores desconhecidos (ficam como estão): {desconhecidos.map((d) => `{{${d}}}`).join(", ")}.</Callout>}
          <div className="space-y-3">
            {cfg.secoes.map((s, i) => (
              <div key={s.id} className={`space-y-2 rounded-card border border-border p-3 ${s.ativa ? "" : "opacity-60"}`}>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[12rem] flex-1">
                    <TextField label={`Seção ${i + 1}`} value={s.titulo} maxLength={LIMITES_DOC.titulo} onChange={(e) => mudarSecao(i, { titulo: e.target.value })} compacto />
                  </div>
                  <Switch checked={s.ativa} onChange={(v) => mudarSecao(i, { ativa: v })} label={`Seção ${i + 1} no documento`} />
                  <AcoesCadastro
                    nome={s.titulo || `seção ${i + 1}`}
                    primeira={i === 0}
                    ultima={i === cfg.secoes.length - 1}
                    onMover={(d) => {
                      const l = [...cfg.secoes];
                      [l[i], l[i + d]] = [l[i + d], l[i]];
                      muda({ secoes: l });
                    }}
                            onExcluir={() => muda({ secoes: cfg.secoes.filter((_, k) => k !== i) })}
                  />
                </div>
                <EditorRico compacto campos={campos} valor={s.texto} onChange={(v) => mudarSecao(i, { texto: v })} maxLength={LIMITES_DOC.texto} rotulo={`Texto da seção ${i + 1}`} />
              </div>
            ))}
          </div>
        </SecaoBanner>

        <SecaoBanner titulo="Dados automáticos">
          <p className="text-[13px] text-muted">Calculados na emissão com os dados publicados. A relação dos itens é sempre impressa — todos, pelo sequencial.</p>
          <div className="flex flex-col gap-2">
            {(Object.keys(AUTOMATICOS) as Automatico[]).map((k) => (
              <Switch
                key={k}
                checked={cfg.automaticos[k]}
                disabled={k === "justificativas" && !cfg.automaticos.dfds}
                onChange={(v) => muda({ automaticos: { ...cfg.automaticos, [k]: v } })}
                label={AUTOMATICOS[k]}
              />
            ))}
          </div>
        </SecaoBanner>

        <SecaoBanner titulo="Colunas da relação dos itens">
          <ColunasDosItens cfg={cfg} muda={muda} />
        </SecaoBanner>

        <SecaoBanner titulo="Notas explicativas">
          <EditorRico compacto campos={campos} valor={cfg.notas} onChange={(v) => muda({ notas: v })} maxLength={LIMITES_DOC.notas} rotulo="Notas explicativas (opcional)" />
        </SecaoBanner>

        <SecaoBanner titulo="Assinaturas (fecho)">
          <ListaAutoridades lista={cfg.assinaturas} onMudar={(l) => muda({ assinaturas: l })} rotulo="assinatura" />
        </SecaoBanner>
      </div>

      <div className="min-w-0 space-y-[var(--gap-block)] lg:sticky lg:top-[calc(var(--h-header)+var(--pad-canvas-y))] lg:self-start">
        <SecaoBanner titulo="Salvar e conferir">
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="sm" onClick={salvar} loading={salvando} disabled={!sujo}>
              Salvar
            </Button>
            <Button variant="secondary" size="sm" disabled={!sujo || salvando} onClick={() => setCfg(lerConfigDocumento(JSON.parse(gravado)))}>
              Descartar
            </Button>
            <Button variant="secondary" size="sm" icon={<IconRefresh className="h-4 w-4" />} loading={carregando} onClick={carregarDados}>
              {dados ? "Atualizar prévia" : "Ver prévia"}
            </Button>
            {gerando ? (
              <Button variant="secondary" size="sm" onClick={() => abortar.current?.abort()}>
                Cancelar
              </Button>
            ) : (
              <Button variant="secondary" size="sm" icon={<IconDownload className="h-4 w-4" />} disabled={carregando} onClick={baixarPrevia}>
                PDF completo
              </Button>
            )}
          </div>
          {sujo && <p className="text-[12px] text-[var(--warn)]">Há alterações não salvas — a emissão pública usa a configuração salva.</p>}
          {gerando && <Progress value={gerando.pct} label={gerando.texto} />}
          {itens && (
            <p className="text-[12px] text-muted">
              {num(itens.length)} itens · {num(dados?.dfds.length ?? 0)} DFDs · {brl(itens.reduce((s, i) => s + Number(i.valorTotal ?? 0), 0))} — os números da prévia são do PCA inteiro; as listas mostram as {LINHAS_NA_PREVIA} primeiras linhas.
            </p>
          )}
        </SecaoBanner>
        {erroPrevia && <Callout kind="danger">{erroPrevia}</Callout>}
        {previa && (
          <section aria-label="Prévia do documento" className="max-h-[75dvh] overflow-y-auto overscroll-contain rounded-card bg-surface-2 p-3">
            <PreviaPaginas paginas={previa.paginas} tamanhos={previa.tamanhos} cor={corDaPrevia} timbre={previa.timbre} />
          </section>
        )}
        <SecaoBanner titulo={`Emissões (${num(totalEmissoes)})`}>
          <DataTable
            columns={COLS_EMISSOES}
            rows={emissoes}
            getKey={(e) => e.codigo}
            density="compact"
            pageSize={10}
            exportar={{ nome: `Emissões do documento - ${pca.nome}` }}
            vazio="Nenhuma emissão registrada."
          />
          {totalEmissoes > emissoes.length && <p className="text-[12px] text-muted">Mostrando as {num(emissoes.length)} mais recentes.</p>}
        </SecaoBanner>
      </div>
    </div>
  );
}
