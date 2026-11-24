"use client";

import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { baixarNoNavegador, comoBlob } from "@/lib/arquivo-navegador";
import { brl, dataHoraBR, num } from "@/lib/format";
import { itensDoTexto } from "@/lib/itens-dash-texto";
import {
  AUTOMATICOS,
  type Automatico,
  type Autoridade,
  blocosDocumentoPca,
  COLUNAS_ITEM_DOC,
  type ConfigDocumentoPca,
  type ColunaItemDoc,
  LIMITES_DOC,
  lerConfigDocumento,
  MARCADORES,
  marcadoresDesconhecidos,
  nomeArquivoDocumento,
  ORDEM_COLUNAS,
  type SecaoDocumento,
  textoConfig,
} from "@/lib/pca-documento-core";
import type { PacoteDocumento } from "@/lib/pca-documento-pdf";
import { AcoesCadastro } from "./AcoesCadastro";
import { Ajuda } from "./Ajuda";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { type Column, DataTable } from "./DataTable";
import { EditorRico } from "./EditorRico";
import { Checkbox, TextField } from "./Field";
import { IconDownload, IconPlus, IconRefresh } from "./icons";
import { PreviaDocumento } from "./PreviaDocumento";
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
      const res = await fetch(`/api/admin/pcas/${pca.id}/documento`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: enviado });
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
      const res = await fetch(`/api/admin/pcas/${pca.id}/documento?dados=1`, { cache: "no-store" });
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
  // A PRÉVIA na tela: os blocos de verdade com os NÚMEROS do PCA inteiro; só as listas longas mostram as primeiras linhas
  // (o PDF completo traz todas). Calculada sobre o valor ADIADO — digitar não espera a prévia.
  const cfgPrevia = useDeferredValue(cfg);
  const previa = useMemo(() => {
    if (!dados || !itens) return null;
    return blocosDocumentoPca({ pca: pcaDoc, itens, dfds: dados.dfds, unidades: dados.unidades }, cfgPrevia, null, new Date().toISOString(), {
      itens: LINHAS_NA_PREVIA,
      dfds: LINHAS_NA_PREVIA,
    }).filter((b) => b.tipo !== "pagina");
  }, [dados, itens, cfgPrevia, pcaDoc]);

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

  const mudarSecao = (i: number, p: Partial<SecaoDocumento>) => muda({ secoes: cfg.secoes.map((s, k) => (k === i ? { ...s, ...p } : s)) });
  const desconhecidos = useMemo(() => marcadoresDesconhecidos([cfg.titulo, cfg.subtitulo, cfg.ente, cfg.local, cfg.notas, ...cfg.secoes.flatMap((s) => [s.titulo, s.texto])].join("\n")), [cfg]);
  const ajudaMarcadores = (
    <Ajuda titulo="Marcadores dos textos">
      <p>Escreva o marcador e ele é trocado pelo dado do PCA na emissão:</p>
      <ul className="mt-2 space-y-1">
        {Object.entries(MARCADORES).map(([k, v]) => (
          <li key={k}>
            <code className="font-mono text-[12px]">{`{{${k}}}`}</code> — {v}
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
            <TextField label="Título" value={cfg.titulo} maxLength={LIMITES_DOC.titulo} onChange={(e) => muda({ titulo: e.target.value })} compacto />
            <TextField label="Subtítulo" value={cfg.subtitulo} maxLength={LIMITES_DOC.titulo} onChange={(e) => muda({ subtitulo: e.target.value })} compacto />
            <TextField label="Ente (1ª linha da capa)" value={cfg.ente} maxLength={LIMITES_DOC.campo} onChange={(e) => muda({ ente: e.target.value })} compacto />
            <TextField label="Local (fecho)" value={cfg.local} maxLength={LIMITES_DOC.campo} onChange={(e) => muda({ local: e.target.value })} compacto />
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
                <EditorRico compacto valor={s.texto} onChange={(v) => mudarSecao(i, { texto: v })} maxLength={LIMITES_DOC.texto} rotulo={`Texto da seção ${i + 1}`} />
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
          <div className="grid gap-1 sm:grid-cols-2">
            {ORDEM_COLUNAS.map((c: ColunaItemDoc) => {
              const fixa = COLUNAS_ITEM_DOC[c].fixa;
              const marcada = cfg.colunas.includes(c);
              return (
                <Checkbox
                  key={c}
                  label={`${COLUNAS_ITEM_DOC[c].titulo}${fixa ? " (sempre)" : ""}`}
                  checked={marcada}
                  disabled={fixa}
                  onChange={() => muda({ colunas: marcada ? cfg.colunas.filter((x) => x !== c) : ORDEM_COLUNAS.filter((x) => x === c || cfg.colunas.includes(x)) })}
                />
              );
            })}
          </div>
        </SecaoBanner>

        <SecaoBanner titulo="Notas explicativas">
          <EditorRico compacto valor={cfg.notas} onChange={(v) => muda({ notas: v })} maxLength={LIMITES_DOC.notas} rotulo="Notas explicativas (opcional)" />
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
        {previa && (
          <div className="max-h-[70dvh] overflow-y-auto overscroll-contain">
            <PreviaDocumento blocos={previa} />
          </div>
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
