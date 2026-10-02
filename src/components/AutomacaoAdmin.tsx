"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type AlvoCenti,
  type ArquivoSaida,
  alvoDoArquivo,
  analisarRespostaCenti,
  CONFIG_CENTI_PADRAO,
  type ConfigCenti,
  candidatosEntidade,
  conferirConteudoDfd,
  type DestinoSaida,
  descricaoDoArquivo,
  type FormatoSaida,
  lerAlvoCenti,
  lerConfigCenti,
  lerIdsCenti,
  lerOpcoesSaida,
  MAX_IDS_CENTI,
  maiorVersao,
  nomeSeguro,
  OPCOES_SAIDA_PADRAO,
  type OpcoesSaida,
  type ProtocoloAutomacao,
  paraBase64,
  pedidoEmitirDfd,
  ajusteDaOperacao,
  operacaoRecusada,
  planoDosIds,
  planoDosProtocolos,
  type TarefaCenti,
  VERSAO_EXTENSAO_CENTI,
  versaoAtende,
} from "@/lib/automacao-centi-core";
import { baixarNoNavegador, baixarPelaExtensao, comoBlob, deBase64, novaUniao, pdfDoAchado } from "@/lib/arquivo-navegador";
import { brl, dataHoraBR, numeroSemAno } from "@/lib/format";
import { type Pessoa, rotuloOpcaoPessoa } from "@/lib/pessoa";
import {
  autorizarEscrita,
  cancelarExecucao,
  concluirPasso,
  concluirPassos,
  iniciarExecucao,
  iniciarExecucaoLeitura,
  jaAnexados,
  type PassoAnexo,
  registrarAnexo,
} from "@/lib/automacao-cliente";
import { descricaoCanonica } from "@/lib/automacao-core";
import { ZipArmazenar } from "@/lib/zip-armazenar";
import { Ajuda } from "./Ajuda";
import { useAlturaTela } from "./AlturaCheia";
import { Badge } from "./Badge";
import { type AberturaMesa, BannersMesa } from "./BannersMesa";
import { CelulaCopiavel } from "./BotaoCopiar";
import { Button } from "./Button";
import { useConfirmacao } from "./Confirmacao";
import { type Column, DataTable } from "./DataTable";
import { Dropdown } from "./Dropdown";
import { EstadoPonto } from "./EstadoCelula";
import { SelectField, TextField } from "./Field";
import { cellCls } from "./formStyles";
import { IconDownload, IconKey, IconPasta, IconPastaAberta, IconRefresh, IconRobo, IconSettings, IconUserX } from "./icons";
import { Progress } from "./Progress";
import { type OpcaoCelula, SeletorCelula } from "./SeletorCelula";
import { type ExtraPessoa, SeletorPessoa } from "./SeletorPessoa";
import { Segmented } from "./Segmented";
import { Switch } from "./Switch";
import { toast } from "./Toast";
import { GravadorReceitas, type PassoGravado } from "./GravadorReceitas";
import { HistoricoExecucoes } from "./HistoricoExecucoes";
import { TarefaTelaProtocolo } from "./TarefaTelaProtocolo";

// Tela AUTOMAÇÃO (só ADM): baixa DFDs da Centi ("Emitir DFD" do CM002 Planejamento) por PROTOCOLO do sistema (uma pasta
// por protocolo, dentro da pasta "PCA <ano>") ou por Id. Quem fala com a Centi é a EXTENSÃO do Chrome (extensao-centi/),
// usando a sessão da Centi já aberta — nenhuma senha fica no sistema. Destino: uma PASTA (Downloads ou a escolhida) ou
// ANEXAR os PDFs a um PROTOCOLO da Centi informado pelo ADM (Id + nº): a única gravação na Centi, montada e travada na
// extensão (abre o protocolo, confere Id + nº, acrescenta UM documento, não repete a mesma descrição).
// Cada DFD é emitido na ENTIDADE da Centi do órgão dele e CONFERIDO (é um PDF, traz o planejamento e o DFD pedidos, a
// gravação bateu o tamanho) antes de contar como salvo.

const CHAVE_CONFIG = "automacao:centi";
const CHAVE_SAIDA = "automacao:centi-saida";
const CHAVE_ENTIDADES = "automacao:centi-entidades";
const CHAVE_ALVO = "automacao:centi-protocolo";

/** O resumo do protocolo da Centi (o "Conferir"). */
type ProtocoloCenti = { id: string; numero: string; ano: string; assunto: string; interessado: string; descricao: string; documentos: number };
type Resposta = {
  ok: boolean;
  erro?: string;
  logado?: boolean;
  entidade?: string | null;
  status?: number;
  b64?: string;
  protocolo?: ProtocoloCenti;
  jaAnexado?: boolean;
  sequencial?: string;
  /** O Id do documento gravado na Centi. */
  documento?: string;
  /** A pergunta do confirmsave da Centi: o save só segue com o "sim" do ADM. */
  confirmar?: string;
  /** A operação "Emitir DFD" que a extensão pegou da própria tela da Centi (o Processar). */
  operacao?: unknown;
  /** A aba da Centi está na TELA DE LOGIN (a sessão caiu). */
  tela?: "login";
  /** O login automático da extensão (as credenciais ficam SÓ nela — aqui só a situação). */
  login?: { credenciais: boolean; auto: boolean; pausado: boolean; motivo: string | null } | null;
  /** O lote foi INTERROMPIDO pela extensão (popup ou cartão na aba da automação). */
  interrompido?: boolean;
  /** O andamento do último lote, como a extensão o guardou (sobrevive ao F5 desta tela). */
  atividade?: { estado: string; titulo: string; passo: string; atualizado: number } | null;
  loteId?: string;
};
type TextoAlvo = { id: string; numero: string };
const lerTextoAlvo = (v: unknown): TextoAlvo => {
  const o = (v && typeof v === "object" ? v : {}) as Partial<Record<keyof TextoAlvo, unknown>>;
  return { id: typeof o.id === "string" ? o.id.slice(0, 20) : "", numero: typeof o.numero === "string" ? o.numero.slice(0, 20) : "" };
};
type Estado = "fila" | "baixando" | "ok" | "falha" | "pulado" | "repetido";
type Linha = TarefaCenti & { estado: Estado; erro?: string; amostra?: string; entidade?: string };
type Modo = "protocolo" | "ids" | "tela";
const CHAVE_TAREFA = "automacao:tarefa";
const TAREFAS: { value: Modo; label: string }[] = [
  { value: "protocolo", label: "Baixar/anexar DFDs · por protocolo" },
  { value: "ids", label: "Baixar/anexar DFDs · por Id" },
  { value: "tela", label: "Ler a Tela Protocolo" },
];
const lerTarefa = (v: unknown): Modo => (TAREFAS.some((t) => t.value === v) ? (v as Modo) : "protocolo");
type Ext = { versao: string; copias: number } | null;
/** O contexto dos BANNERS da Mesa (o protocolo aberto pela linha): o mesmo da Mesa (`contextoBanners`). */
export type ContextoBannersAutomacao = Pick<Parameters<typeof BannersMesa>[0], "pode" | "reparticoes" | "regras" | "orgaos" | "pcas">;

/** Conversa com a extensão pela ponte da página (window.postMessage). */
function useExtensaoCenti() {
  const [ext, setExt] = useState<Ext>(null);
  const versao = useRef("");
  const copias = useRef(new Map<string, string>());
  const seq = useRef(0);
  const pendentes = useRef(new Map<number, (r: Resposta) => void>());
  // O LOTE em curso (o andamento vai à extensão — selo no ícone, cartão na aba da automação e popup) e a INTERRUPÇÃO
  // pedida pela extensão: os pedidos do lote levam o id e a extensão recusa os que vêm depois de interromper.
  const lote = useRef<string | null>(null);
  const interrompido = useRef(false);
  useEffect(() => {
    const ouvir = (e: MessageEvent) => {
      if (e.source !== window || e.data?.fonte !== "pca-extensao") return;
      if (e.data.tipo === "interrompido") {
        if (lote.current && e.data.loteId === lote.current) interrompido.current = true;
        return;
      }
      if (e.data.tipo === "pronto") {
        // Vale a MAIOR versão anunciada (uma cópia antiga que ficou na aba também se anuncia).
        const v = String(e.data.versao ?? "");
        // Cada CÓPIA instalada se anuncia com o id dela (desde a 1.4.1): duas cópias = aviso (as duas ouviriam os pedidos).
        // Conta só as cópias da MESMA versão (a antiga que sobrou de uma atualização não ouve os pedidos — `v`).
        if (typeof e.data.idExtensao === "string") copias.current.set(e.data.idExtensao, v);
        if (versao.current && maiorVersao(versao.current, v) === versao.current && v !== versao.current) return;
        versao.current = maiorVersao(versao.current || "0", v);
        const atual = versao.current;
        setExt({ versao: atual, copias: [...copias.current.values()].filter((x) => x === atual).length });
        return;
      }
      // Só a resposta da ponte ATUAL (uma cópia antiga da extensão que ficou na aba também ouve).
      if (e.data.v !== versao.current) return;
      const f = pendentes.current.get(e.data.id);
      if (f) {
        pendentes.current.delete(e.data.id);
        f(e.data.resposta ?? { ok: false, erro: "Sem resposta da extensão." });
      }
    };
    window.addEventListener("message", ouvir);
    window.postMessage({ fonte: "pca-automacao", tipo: "ola" }, window.location.origin);
    return () => window.removeEventListener("message", ouvir);
  }, []);
  const pedir = useCallback((acao: string, dados: unknown, ms: number) => {
    const id = ++seq.current;
    return new Promise<Resposta>((ok) => {
      const t = window.setTimeout(() => {
        pendentes.current.delete(id);
        ok({ ok: false, erro: "A extensão não respondeu a tempo." });
      }, ms);
      pendentes.current.set(id, (r) => {
        window.clearTimeout(t);
        ok(r);
      });
      window.postMessage({ fonte: "pca-automacao", v: versao.current, id, acao, dados, lote: lote.current ?? undefined }, window.location.origin);
    });
  }, []);
  return { ext, pedir, lote, interrompido };
}

type Arquivo = { getFile: () => Promise<Blob>; createWritable: () => Promise<{ write: (d: Blob) => Promise<void>; close: () => Promise<void> }> };
type Pasta = {
  getFileHandle: (n: string, o: { create: boolean }) => Promise<Arquivo>;
  getDirectoryHandle: (n: string, o: { create: boolean }) => Promise<Pasta>;
  name: string;
};


/** Grava na pasta escolhida, criando as subpastas (PCA <ano> / protocolo) na 1ª vez, e CONFERE o tamanho gravado. */
async function gravarNaPasta(pasta: Pasta, pastas: string[], nome: string, blob: Blob) {
  let destino = pasta;
  for (const p of pastas) destino = await destino.getDirectoryHandle(p, { create: true });
  const arq = await destino.getFileHandle(nome, { create: true });
  const w = await arq.createWritable();
  await w.write(blob);
  await w.close();
  if ((await arq.getFile()).size !== blob.size) throw new Error("tamanho");
}

/** O texto das 2 primeiras páginas (pdf.js, carregado só aqui) — a conferência do conteúdo. */
async function textoDoPdf(bytes: Uint8Array): Promise<string> {
  const { abrirPdf } = await import("@/lib/parse-dfd-pdf");
  const doc = await abrirPdf(new File([bytes as Uint8Array<ArrayBuffer>], "dfd.pdf", { type: "application/pdf" }));
  try {
    const partes: string[] = [];
    for (let p = 1; p <= Math.min(2, doc.numPages); p++) partes.push((await doc.pageItems(p)).map((i) => i.str).join(" "));
    return partes.join(" ");
  } finally {
    await doc.destroy();
  }
}

/** O PDF regravado pelo pdf-lib (as mesmas páginas, a estrutura do PDF unido). */
async function regravarPdf(b: Uint8Array): Promise<Uint8Array> {
  const u = await novaUniao();
  await u.adicionar(b);
  return u.salvar();
}

function lerLocal<T>(chave: string, ler: (v: unknown) => T, padrao: T): T {
  try {
    return ler(JSON.parse(localStorage.getItem(chave) ?? "null"));
  } catch {
    return padrao;
  }
}
function gravarLocal(chave: string, v: unknown) {
  try {
    localStorage.setItem(chave, JSON.stringify(v));
  } catch {}
}
const lerMapa = (v: unknown): Record<string, string> =>
  Object.fromEntries(Object.entries(v && typeof v === "object" ? v : {}).filter(([, x]) => typeof x === "string" && /^[\w.-]{1,40}$/.test(x))) as Record<string, string>;

const URL_EXTENSAO = "/api/admin/automacao/extensao";
const baixarExtensao = () => {
  window.location.href = URL_EXTENSAO;
};

const hojeBR = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
};

const COR: Record<Estado, string> = { fila: "var(--muted)", baixando: "var(--info)", ok: "var(--ok)", falha: "var(--danger)", pulado: "var(--warn)", repetido: "var(--warn)" };
const ROTULO: Record<Estado, string> = { fila: "Na fila", baixando: "Baixando…", ok: "Salvo", falha: "Falhou", pulado: "Sem planejamento", repetido: "Não baixado" };
const DESTINOS: { value: DestinoSaida; label: string }[] = [
  { value: "pasta", label: "Pasta" },
  { value: "protocolo", label: "Protocolo indicado" },
  { value: "proprio", label: "Protocolo de cada DFD" },
];
/** A operação Emitir DFD como chave comparável ("ModuleKey|Guid|assinatura"); inválida = null. */
function chaveOp(op: unknown): string | null {
  const a = ajusteDaOperacao({ ...CONFIG_CENTI_PADRAO, moduleKey: 0, guid: "", assinaturaDfd: "" }, op);
  return a ? `${a.moduleKey}|${a.guid}|${a.assinaturaDfd ?? ""}` : null;
}
const mesmasChaves = (a: Linha[], b: Linha[]) => a.length === b.length && a.every((l, i) => l.chave === b[i].chave);
const CARTAO = "rounded-card border border-border bg-surface shadow-ring";

const semPlan = (p: ProtocoloAutomacao) => p.dfds.filter((d) => !/[1-9]/.test(d.planejamento ?? "")).length;
const texto1 = (v: string | null) => (
  <span className="line-clamp-1" title={v ?? ""}>
    {v || "—"}
  </span>
);

const COLUNAS: Column<ProtocoloAutomacao>[] = [
  {
    key: "numero",
    header: "Nº protocolo",
    nowrap: true,
    value: (p) => p.numero,
    render: (p) => (
      <CelulaCopiavel copiar={numeroSemAno(p.numero)} rotulo="nº do protocolo">
        <span className="font-semibold text-text">{p.numero}</span>
      </CelulaCopiavel>
    ),
  },
  {
    key: "id",
    header: "Id",
    nowrap: true,
    value: (p) => p.idExterno ?? "—",
    render: (p) => <CelulaCopiavel copiar={p.idExterno} rotulo="Id do protocolo">{p.idExterno ?? "—"}</CelulaCopiavel>,
  },
  { key: "data", header: "Data", nowrap: true, value: (p) => dataHoraBR(p.criadoEm), render: (p) => dataHoraBR(p.criadoEm) || "—" },
  { key: "sigla", header: "Sigla", nowrap: true, value: (p) => p.sigla ?? "—", render: (p) => p.sigla ?? "—" },
  { key: "assunto", header: "Assunto", minWidth: 180, align: "left", value: (p) => p.assunto ?? "—", render: (p) => texto1(p.assunto) },
  { key: "interessado", header: "Interessado", minWidth: 220, align: "left", value: (p) => p.interessado ?? "—", render: (p) => texto1(p.interessado) },
  { key: "pca", header: "PCA", nowrap: true, value: (p) => (p.anoPca ? String(p.anoPca) : "—"), render: (p) => (p.anoPca ? String(p.anoPca) : "—") },
  { key: "local", header: "Local", nowrap: true, value: (p) => p.pca ?? "Mesa do sistema", render: (p) => p.pca ?? "Mesa do sistema" },
  {
    key: "dfds",
    header: "DFDs",
    nowrap: true,
    filter: "range",
    numero: (p) => p.dfds.length,
    formatarFaixa: (n) => String(n),
    value: (p) => String(p.dfds.length),
    render: (p) => <span className="tabular-nums">{p.dfds.length}</span>,
  },
  {
    key: "semplan",
    header: "Sem planej.",
    nowrap: true,
    value: (p) => (semPlan(p) ? "Com DFD sem planejamento" : "Todos com planejamento"),
    render: (p) => (semPlan(p) ? <span className="font-semibold text-[var(--warn)]">{semPlan(p)}</span> : <span className="text-muted">0</span>),
  },
  {
    key: "itens",
    header: "Itens",
    nowrap: true,
    filter: "range",
    numero: (p) => p.itens,
    formatarFaixa: (n) => String(n),
    value: (p) => String(p.itens),
    render: (p) => <span className="tabular-nums">{p.itens}</span>,
  },
  {
    key: "valor",
    header: "Valor",
    nowrap: true,
    align: "right",
    filter: "range",
    numero: (p) => p.valor,
    value: (p) => brl(p.valor),
    render: (p) => <span className="tabular-nums">{brl(p.valor)}</span>,
  },
];

const FORMATOS: { value: FormatoSaida; label: string }[] = [
  { value: "separados", label: "Separados" },
  { value: "protocolo", label: "Protocolo" },
  { value: "unidade", label: "Unidade" },
  { value: "unico", label: "Único" },
];

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 border-b border-border px-1 pb-3 last:border-0 last:pb-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{titulo}</p>
      {children}
    </div>
  );
}

/**
 * O LOGIN DA CENTI GUARDADO NO SISTEMA (opcional, cifrado): a situação + remover. Guardar é só na extensão ("Guardar
 * também no sistema PCA" no login dela) — a senha nunca passa por esta tela.
 */
function LoginNoSistema({ onConfigurar }: { onConfigurar: () => void }) {
  const [s, setS] = useState<{ tem: boolean; atualizadoEm: string | null; disponivel: boolean } | null>(null);
  const [remover, setRemover] = useState<"pergunta" | "removendo" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const carregar = useCallback(async () => {
    const r = await fetch("/api/admin/automacao/credencial-centi", { cache: "no-store" }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as { ok?: boolean; tem?: boolean; atualizadoEm?: string | null; disponivel?: boolean } | null;
    setS(j?.ok ? { tem: j.tem === true, atualizadoEm: j.atualizadoEm ?? null, disponivel: j.disponivel !== false } : null);
  }, []);
  useEffect(() => {
    void carregar();
  }, [carregar]);
  async function tirar() {
    setRemover("removendo");
    const r = await fetch("/api/admin/automacao/credencial-centi", { method: "DELETE" }).catch(() => null);
    setRemover(null);
    if (!r?.ok) return setErro("Não consegui remover — tente de novo.");
    setErro(null);
    await carregar();
  }
  return (
    <Grupo titulo="Login da Centi">
      <p className="text-xs text-muted">
        {s === null
          ? "Conferindo…"
          : s.tem
            ? `Guardado no sistema (cifrado)${s.atualizadoEm ? ` em ${dataHoraBR(s.atualizadoEm)}` : ""} — volta sozinho se a extensão for reinstalada.`
            : s.disponivel
              ? "Só na extensão. Para guardar também no sistema (cifrado), marque a opção no login da extensão."
              : "O sistema está sem a chave mestra para cifrar o login — fica só na extensão."}
      </p>
      {erro && <p className="text-xs text-[var(--danger)]">{erro}</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={onConfigurar}>
          <IconKey className="h-4 w-4" /> Configurar login
        </Button>
        {s?.tem &&
          (remover === null ? (
            <Button size="sm" variant="secondary" onClick={() => setRemover("pergunta")}>
              Remover do sistema
            </Button>
          ) : (
            <Button size="sm" variant="danger" onClick={() => void tirar()} loading={remover === "removendo"}>
              Confirmar remoção
            </Button>
          ))}
      </div>
    </Grupo>
  );
}

/** Os AJUSTES (o dropdown do botão "Ajustes"): saída, emissão e entidade da Centi por órgão. */
function Ajustes({
  saida,
  onSaida,
  cfg,
  onCfg,
  orgaos,
  mapa,
  onEntidade,
  aberta,
  alvo,
  onAlvo,
  conferir,
  conferencia,
  testar,
  teste,
  gravacao,
  onGravacao,
  onHistorico,
  gravando,
  onGravador,
  onConfigurarLogin,
}: {
  /** Abre o login da extensão (o dropdown do ícone). */
  onConfigurarLogin: () => void;
  /** O gravador de receitas na aba da Centi (null = desconhecido). */
  gravando: boolean | null;
  onGravador: (acao: "iniciar" | "parar") => void;
  /** O freio de emergência da plataforma (null = não lido). */
  gravacao: boolean | null;
  onGravacao: (ativa: boolean) => void;
  onHistorico: () => void;
  saida: OpcoesSaida;
  onSaida: (p: Partial<OpcoesSaida>) => void;
  cfg: ConfigCenti;
  onCfg: (p: Partial<ConfigCenti>) => void;
  orgaos: [string, { nome: string; n: number }][];
  mapa: Record<string, string>;
  onEntidade: (orgao: string, entidade: string) => void;
  aberta: string | null;
  alvo: TextoAlvo;
  onAlvo: (p: Partial<TextoAlvo>) => void;
  conferir: () => void;
  conferencia: { carregando?: boolean; protocolo?: ProtocoloCenti; erro?: string } | null;
  /** "Testar anexo": anexa um PDF pequeno de teste ao protocolo, SEM emitir DFD (separa o salvar da emissão). */
  testar: () => void;
  teste: { carregando?: boolean; ok?: string; erro?: string } | null;
}) {
  return (
    <div className="space-y-3 p-1">
      <LoginNoSistema onConfigurar={onConfigurarLogin} />
      <Grupo titulo="Gravação na Centi">
        <Switch
          checked={gravacao !== false}
          disabled={gravacao === null}
          onChange={onGravacao}
          label={gravacao === false ? "Pausada (freio de emergência)" : "Ligada"}
        />
        <Button size="sm" variant="secondary" onClick={onHistorico}>
          Histórico das execuções
        </Button>
      </Grupo>
      <Grupo titulo="Gravador de receitas">
        <p className="text-xs text-muted">
          Grava a FORMA dos pedidos que a tela da Centi faz (sem valores) — ligue, faça a ação lá e pare para ver e copiar.
        </p>
        <Button size="sm" variant={gravando ? "danger" : "secondary"} onClick={() => onGravador(gravando ? "parar" : "iniciar")} disabled={gravando === null}>
          {gravando ? "Parar e ver a gravação" : "Gravar uma ação na Centi"}
        </Button>
      </Grupo>
      <Grupo titulo="Destino">
        <Segmented<DestinoSaida> ariaLabel="Destino dos PDFs" value={saida.destino} onChange={(v) => onSaida({ destino: v })} options={DESTINOS} className="w-full" />
        {saida.destino === "pasta" ? (
          <>
            <Switch checked={saida.pastaPca} onChange={(v) => onSaida({ pastaPca: v })} label="Pasta “PCA ano”" />
            <Switch checked={saida.escolherPasta} onChange={(v) => onSaida({ escolherPasta: v })} label="Escolher a pasta de destino" />
          </>
        ) : saida.destino === "proprio" ? (
          <>
            <p className="text-xs text-muted">
              Cada arquivo vai ao protocolo da Centi de onde vieram os DFDs (o “Id:” da capa + o nº). Só no modo Por protocolo, com
              PDFs separados ou um por protocolo.
            </p>
            <TextField
              label="Tipo do documento"
              inputMode="numeric"
              value={saida.tipoDocumento}
              onChange={(e) => onSaida({ tipoDocumento: e.target.value.replace(/\D/g, "") || saida.tipoDocumento })}
            />
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <TextField label="Id do protocolo" placeholder="2332778" inputMode="numeric" value={alvo.id} onChange={(e) => onAlvo({ id: e.target.value })} />
              <TextField label="Nº do protocolo" placeholder="156844/2026" value={alvo.numero} onChange={(e) => onAlvo({ numero: e.target.value })} />
            </div>
            <TextField
              label="Tipo do documento"
              inputMode="numeric"
              value={saida.tipoDocumento}
              onChange={(e) => onSaida({ tipoDocumento: e.target.value.replace(/\D/g, "") || saida.tipoDocumento })}
            />
            <div className="flex items-start gap-2">
              <Button size="sm" variant="secondary" onClick={conferir} loading={conferencia?.carregando}>
                Conferir na Centi
              </Button>
              {conferencia?.protocolo ? (
                <p className="min-w-0 flex-1 text-xs text-[var(--ok)]">
                  {conferencia.protocolo.numero}/{conferencia.protocolo.ano} · {conferencia.protocolo.assunto || conferencia.protocolo.descricao} ·{" "}
                  {conferencia.protocolo.documentos} documento(s)
                </p>
              ) : conferencia?.erro ? (
                <p className="min-w-0 flex-1 text-xs text-[var(--danger)]">{conferencia.erro}</p>
              ) : null}
            </div>
            <div className="flex items-start gap-2">
              <Button size="sm" variant="secondary" onClick={testar} loading={teste?.carregando}>
                Testar anexo
              </Button>
              {teste?.ok ? (
                <p className="min-w-0 flex-1 text-xs text-[var(--ok)]">{teste.ok}</p>
              ) : teste?.erro ? (
                <p className="min-w-0 flex-1 text-xs text-[var(--danger)]">{teste.erro}</p>
              ) : (
                <p className="min-w-0 flex-1 text-xs text-muted">Anexa um PDF de teste (sem emitir DFD) — exclua-o depois na Centi.</p>
              )}
            </div>
          </>
        )}
      </Grupo>
      <Grupo titulo="PDFs">
        <Segmented<FormatoSaida> ariaLabel="PDFs" value={saida.formato} onChange={(v) => onSaida({ formato: v })} options={FORMATOS} className="w-full" />
        <Switch checked={saida.ordenarPlanejamento} onChange={(v) => onSaida({ ordenarPlanejamento: v })} label="Ordenar pelo planejamento" />
        <Switch checked={saida.conferir} onChange={(v) => onSaida({ conferir: v })} label="Conferir o conteúdo de cada PDF" />
      </Grupo>
      <Grupo titulo="Emissão">
        <Switch checked={cfg.valorReferencia} onChange={(v) => onCfg({ valorReferencia: v })} label="Emitir valor de referência" />
        <Switch checked={cfg.emitirData} onChange={(v) => onCfg({ emitirData: v })} label="Emitir data" />
      </Grupo>
      <Grupo titulo="Entidade da Centi por órgão">
        <Switch checked={cfg.descobrirEntidade} onChange={(v) => onCfg({ descobrirEntidade: v })} label="Descobrir sozinho" />
        <TextField label="Entidades a tentar" placeholder={aberta ? `vazio = 0 a 28 (aberta: ${aberta})` : "02:03:04"} value={cfg.entidades} onChange={(e) => onCfg({ entidades: e.target.value })} />
        {orgaos.length > 0 && (
          <ul className="max-h-56 divide-y divide-border overflow-y-auto">
            {orgaos.map(([chave, o]) => (
              <li key={chave} className="flex items-center gap-2 py-1 text-sm">
                <span className="min-w-0 flex-1 truncate text-text" title={`${o.nome} · ${o.n} DFD(s)`}>
                  {o.nome}
                </span>
                <input
                  aria-label={`Entidade da Centi de ${o.nome}`}
                  className={`${cellCls} w-16 shrink-0 text-center`}
                  placeholder="auto"
                  defaultValue={mapa[chave] ?? ""}
                  key={mapa[chave] ?? ""}
                  onBlur={(e) => onEntidade(chave, e.target.value)}
                />
                {aberta && mapa[chave] !== aberta && (
                  <Button size="xs" variant="ghost" onClick={() => onEntidade(chave, aberta)} title="Usar a entidade aberta na Centi agora">
                    {aberta}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Grupo>
      <Grupo titulo="Avançado">
        <TextField label="Modelo de assinatura do DFD" value={cfg.assinaturaDfd} inputMode="numeric" onChange={(e) => onCfg({ assinaturaDfd: e.target.value })} />
        <TextField label="ModuleKey" value={String(cfg.moduleKey)} inputMode="numeric" onChange={(e) => onCfg({ moduleKey: Number(e.target.value) })} />
        <TextField label="Guid da operação" value={cfg.guid} onChange={(e) => onCfg({ guid: e.target.value })} />
      </Grupo>
    </div>
  );
}

/** A ANÁLISE ao lado: cada DFD do que vai ser baixado (por pasta), com o estado — antes, durante e depois. */
function Analise({ linhas, rodando, destino }: { linhas: Linha[]; rodando: boolean; destino: string | null }) {
  const rotuloOk = destino ? "Anexado" : ROTULO.ok;
  const grupos = useMemo(() => {
    const m = new Map<string, Linha[]>();
    for (const l of linhas) m.set(l.grupo, [...(m.get(l.grupo) ?? []), l]);
    return [...m.entries()];
  }, [linhas]);
  const validas = linhas.filter((l) => l.estado !== "pulado" && l.estado !== "repetido");
  const feitos = validas.filter((l) => l.estado === "ok" || l.estado === "falha").length;
  const ok = validas.filter((l) => l.estado === "ok").length;
  const falhas = validas.length - ok - validas.filter((l) => l.estado === "fila" || l.estado === "baixando").length;
  return (
    <section className={`${CARTAO} flex min-h-0 flex-col gap-2 p-[var(--pad-card)] lg:h-full max-lg:max-h-[70vh]`}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="min-w-0 truncate font-bold text-text" title={destino ?? undefined}>
          Análise{destino ? ` · ${destino}` : ""}
        </h2>
        <span className="text-sm tabular-nums text-muted">
          {validas.length} DFD(s){falhas ? ` · ${falhas} falha(s)` : ""}
        </span>
      </div>
      {(rodando || feitos > 0) && (
        <Progress value={validas.length ? (feitos / validas.length) * 100 : 0} label={`${ok} ${destino ? "anexado(s)" : "salvo(s)"} de ${validas.length}`} />
      )}
      {linhas.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">Nada escolhido.</p>
      ) : (
        <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {grupos.map(([g, ls]) => (
            <li key={g} className="space-y-1">
              {g && (
                <div className="flex items-center gap-2 text-sm">
                  <IconPasta className="h-4 w-4 shrink-0 text-muted" />
                  <span className="min-w-0 flex-1 truncate font-semibold text-text" title={g}>
                    {g}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted">
                    {ls.filter((l) => l.estado === "ok").length}/{ls.filter((l) => l.estado !== "pulado" && l.estado !== "repetido").length}
                  </span>
                </div>
              )}
              {ls.map((l) => (
                <div key={l.chave} className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm ${g ? "pl-6" : ""}`}>
                  <span className="font-medium tabular-nums text-text">{l.id ? `Planej. ${l.id}` : "—"}</span>
                  {l.dfd && <span className="tabular-nums text-muted">DFD {l.dfd}</span>}
                  {l.orgaoNome && (
                    <span className="min-w-0 max-w-40 truncate text-xs text-muted" title={l.orgaoNome}>
                      {l.orgaoNome}
                      {l.entidade ? ` · ${l.entidade}` : ""}
                    </span>
                  )}
                  <span className="ml-auto">
                    <EstadoPonto cor={COR[l.estado]} rotulo={l.estado === "ok" ? rotuloOk : ROTULO[l.estado]} />
                  </span>
                  {l.erro && <span className="w-full text-xs text-muted">{l.erro}</span>}
                  {l.amostra && <code className="w-full break-all rounded bg-surface-2 p-2 text-[12px] text-text-2">{l.amostra}</code>}
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** A gestão do protocolo na tabela (a MESMA da Mesa): as pessoas do grupo ativo (designáveis), as gravadas de fora dele
 * (só exibidas), as situações do ADM e quem está usando. */
export type GestaoAutomacao = { pessoas: Pessoa[]; outras: Pessoa[]; situacoes: OpcaoCelula[]; usuarioId: number };
type ValoresGestao = { responsavelId?: number | null; situacaoId?: number | null };
const EXTRAS_CELULA: ExtraPessoa[] = [{ valor: "", rotulo: "Sem responsável", icone: <IconUserX className="h-4 w-4" /> }];

/** As colunas Situação e Responsável da Mesa: na célula, gravam na hora (otimista; falhou, volta e avisa). */
function useColunasGestao(gestao: GestaoAutomacao): Column<ProtocoloAutomacao>[] {
  const router = useRouter();
  const [mudado, setMudado] = useState<Map<number, ValoresGestao>>(new Map());
  const [salvando, setSalvando] = useState<Set<string>>(new Set());
  // Recarregou do servidor: os valores otimistas saem (vale o gravado).
  // biome-ignore lint/correctness/useExhaustiveDependencies: zera só quando as listas do servidor mudam.
  useEffect(() => setMudado(new Map()), [gestao]);
  const dir = useMemo(() => new Map([...gestao.outras, ...gestao.pessoas].map((p) => [p.id, p])), [gestao]);
  const situacaoPorId = useMemo(() => new Map(gestao.situacoes.map((x) => [x.id, x])), [gestao]);
  const valor = (p: ProtocoloAutomacao, campo: keyof ValoresGestao) => {
    const m = mudado.get(p.id);
    return m && campo in m ? (m[campo] ?? null) : p[campo];
  };
  const pessoa = (id: number | null): Pessoa | null => (id == null ? null : (dir.get(id) ?? { id, nome: `#${id}`, apelido: null, foto: null }));

  async function alterar(p: ProtocoloAutomacao, campo: keyof ValoresGestao, v: number | null) {
    const k = `${p.id}:${campo}`;
    setSalvando((s) => new Set(s).add(k));
    setMudado((m) => new Map(m).set(p.id, { ...m.get(p.id), [campo]: v }));
    try {
      const res = await fetch(`/api/protocolo/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [campo]: v, origem: "celula" }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? `falha ao salvar (HTTP ${res.status})`);
      router.refresh();
    } catch (e) {
      setMudado((m) => {
        const n = new Map(m);
        const g = { ...n.get(p.id) };
        delete g[campo];
        n.set(p.id, g);
        return n;
      });
      toast.error(`Protocolo ${p.numero}: ${e instanceof TypeError ? "sem conexão com o servidor" : e instanceof Error ? e.message : "falha ao salvar"}.`);
    } finally {
      setSalvando((s) => {
        const n = new Set(s);
        n.delete(k);
        return n;
      });
    }
  }

  return [
    {
      key: "situacao",
      header: "Situação",
      nowrap: true,
      value: (r) => {
        const id = valor(r, "situacaoId");
        return id == null ? "Sem situação" : (situacaoPorId.get(id)?.nome ?? "Sem situação");
      },
      render: (r) => (
        <SeletorCelula
          valor={valor(r, "situacaoId")}
          opcoes={gestao.situacoes}
          onChange={gestao.situacoes.length > 0 ? (v) => alterar(r, "situacaoId", v) : undefined}
          vazio="Sem situação"
          salvando={salvando.has(`${r.id}:situacaoId`)}
          ariaLabel={`Situação do protocolo ${r.numero}`}
        />
      ),
    },
    {
      key: "responsavel",
      header: "Responsável",
      nowrap: true,
      // Filtro/ordem pelo "apelido — nome" (duas pessoas com o mesmo apelido não viram uma só opção).
      value: (r) => {
        const p = pessoa(valor(r, "responsavelId"));
        return p ? rotuloOpcaoPessoa(p) : "Sem responsável";
      },
      render: (r) => {
        const p = pessoa(valor(r, "responsavelId"));
        return (
          <SeletorPessoa
            variante="celula"
            rotulo="Responsável"
            ariaLabel={`Responsável pelo protocolo ${r.numero}`}
            pessoas={gestao.pessoas}
            usuarioId={gestao.usuarioId}
            valor={p ? String(p.id) : ""}
            atual={p}
            extras={EXTRAS_CELULA}
            salvando={salvando.has(`${r.id}:responsavelId`)}
            onChange={(v) => alterar(r, "responsavelId", v ? Number(v) : null)}
          />
        );
      },
    },
  ];
}

export function AutomacaoAdmin({
  protocolos,
  gestao,
  banners,
}: {
  protocolos: ProtocoloAutomacao[];
  gestao: GestaoAutomacao;
  banners: ContextoBannersAutomacao;
}) {
  const router = useRouter();
  const colunasGestao = useColunasGestao(gestao);
  const [naCentiCol, setNaCentiCol] = useState<Map<number, number>>(new Map());
  const colunas = useMemo<Column<ProtocoloAutomacao>[]>(
    () => [
      ...colunasGestao,
      ...COLUNAS,
      {
        key: "naCenti",
        header: "Na Centi",
        nowrap: true,
        value: (p) => (naCentiCol.get(p.id) ? `${naCentiCol.get(p.id)} anexado(s)` : "—"),
        render: (p) => {
          const n = naCentiCol.get(p.id) ?? 0;
          return n ? (
            <Badge tone="emerald" dot>
              {n} anexado(s)
            </Badge>
          ) : (
            <span className="text-faint">—</span>
          );
        },
      },
    ],
    [colunasGestao, naCentiCol],
  );
  const { ext, pedir, lote: loteRef, interrompido: interrompidoRef } = useExtensaoCenti();
  const [cfg, setCfg] = useState<ConfigCenti>(CONFIG_CENTI_PADRAO);
  const [saida, setSaida] = useState<OpcoesSaida>(OPCOES_SAIDA_PADRAO);
  const [mapa, setMapa] = useState<Record<string, string>>({});
  const mapaRef = useRef(mapa);
  const [logado, setLogado] = useState<Resposta | null>(null);
  const [modo, setModo] = useState<Modo>("protocolo");
  const [texto, setTexto] = useState("");
  const [sel, setSel] = useState<Set<string | number>>(new Set());
  const [pasta, setPasta] = useState<Pasta | null>(null);
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [rodando, setRodando] = useState(false);
  // A tarefa "Ler a Tela Protocolo" em curso (leitura ou a fila de análise).
  const [rodandoTela, setRodandoTela] = useState(false);
  const [aberto, setAberto] = useState<AberturaMesa | null>(null);
  const [podePasta, setPodePasta] = useState(false);
  const [alvoTexto, setAlvoTexto] = useState<TextoAlvo>({ id: "", numero: "" });
  const [conferencia, setConferencia] = useState<{ carregando?: boolean; protocolo?: ProtocoloCenti; erro?: string } | null>(null);
  const { confirmar, confirmacao } = useConfirmacao();
  // O anexo pela PLATAFORMA: cada escrita leva a autorização de USO ÚNICO do sistema (a extensão a consome no servidor e
  // pede a confirmação na janela dela). Como a tela da Centi: confirmsave → a pergunta da Centi vai ao ADM e só o "sim"
  // grava (com uma autorização nova). Já registrado no sistema = não grava de novo. Gravado = registro + passo feito.
  const anexarNaCenti = useCallback(
    async (execucaoId: number, passo: PassoAnexo, protocoloId: number | null, dados: Record<string, unknown>, ms: number): Promise<Resposta> => {
      const uma = async (extra: Record<string, unknown>): Promise<Resposta> => {
        const a = await autorizarEscrita(execucaoId, passo);
        if ("erro" in a) return { ok: false, erro: a.erro };
        if ("jaFeito" in a) return { ok: true, jaAnexado: true, documento: a.centiDocumento ?? undefined };
        return pedir("anexar", { ...dados, ...extra, autorizacao: { token: a.token } }, ms);
      };
      let r = await uma({});
      if (!r.ok && r.confirmar) {
        const sim = await confirmar({ titulo: "A Centi pede confirmação", texto: r.confirmar, confirmar: "Confirmar e anexar" });
        r = sim ? await uma({ aceitar: true }) : { ok: false, erro: `Não anexado — confirmação recusada: ${r.confirmar}` };
      }
      if (r.ok) {
        const nota = r.jaAnexado ? "Já estava no protocolo." : `Documento ${r.sequencial ?? "?"} do protocolo.`;
        await registrarAnexo(execucaoId, passo, r.documento ?? null, protocoloId, nota);
      } else await concluirPasso(execucaoId, passo.chave, "falhou", r.erro ?? "A Centi não gravou.");
      return r;
    },
    [pedir, confirmar],
  );
  // No desktop a tela cabe no display (sem rolar o navegador): a tabela e a análise vão até o fim e rolam por dentro.
  const corpo = useRef<HTMLDivElement>(null);
  const altura = useAlturaTela(corpo, 240);

  useEffect(() => {
    setPodePasta("showDirectoryPicker" in window);
    setCfg(lerLocal(CHAVE_CONFIG, lerConfigCenti, CONFIG_CENTI_PADRAO));
    setSaida(lerLocal(CHAVE_SAIDA, lerOpcoesSaida, OPCOES_SAIDA_PADRAO));
    setAlvoTexto(lerLocal(CHAVE_ALVO, lerTextoAlvo, { id: "", numero: "" }));
    setModo(lerLocal(CHAVE_TAREFA, lerTarefa, "protocolo"));
    const m = lerLocal(CHAVE_ENTIDADES, lerMapa, {});
    mapaRef.current = m;
    setMapa(m);
  }, []);
  // A configuração mais recente (a emissão roda em laço assíncrono e pode ser ajustada no meio dele).
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;
  const mudar = (p: Partial<ConfigCenti>) => {
    const n = lerConfigCenti({ ...cfgRef.current, ...p });
    cfgRef.current = n;
    setCfg(n);
    gravarLocal(CHAVE_CONFIG, n);
  };
  // A operação "Emitir DFD" que a extensão pegou da tela da Centi: se a Centi a mudou, o sistema acompanha sozinho.
  // A operação guardada no SERVIDOR (vale para todos os ADMs): a da tela da Centi que for diferente vai para lá.
  const opServidor = useRef<string | null>(null);
  const compartilharOperacao = (op: unknown) => {
    const k = chaveOp(op);
    if (!k || k === opServidor.current) return;
    const [moduleKey, guid, assinatura] = k.split("|");
    opServidor.current = k;
    void fetch("/api/admin/automacao/config", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ operacao: { moduleKey: Number(moduleKey), guid, assinatura } }),
    }).catch(() => {
      opServidor.current = null;
    });
  };
  const aplicarOperacao = (op: unknown, doServidor = false): boolean => {
    if (!doServidor) compartilharOperacao(op);
    const a = ajusteDaOperacao(cfgRef.current, op);
    if (!a) return false;
    mudar(a);
    if (!doServidor) toast.success(`A Centi mudou a operação Emitir DFD — o sistema já se ajustou (ModuleKey ${cfgRef.current.moduleKey}).`, 10_000);
    return true;
  };
  const aplicarRef = useRef(aplicarOperacao);
  aplicarRef.current = aplicarOperacao;
  const mudarSaida = (p: Partial<OpcoesSaida>) => {
    const n = lerOpcoesSaida({ ...saida, ...p });
    setSaida(n);
    gravarLocal(CHAVE_SAIDA, n);
    if (!n.escolherPasta) setPasta(null);
  };
  const mudarAlvo = (p: Partial<TextoAlvo>) => {
    const n = { ...alvoTexto, ...p };
    setAlvoTexto(n);
    setConferencia(null);
    gravarLocal(CHAVE_ALVO, n);
  };
  const anexando = saida.destino !== "pasta";
  const proprio = saida.destino === "proprio";
  const lidoAlvo = lerAlvoCenti(alvoTexto.id, alvoTexto.numero);
  const alvo: AlvoCenti | null = "alvo" in lidoAlvo ? lidoAlvo.alvo : null;
  const rotuloAlvo = alvo ? `Protocolo ${alvo.numero}${alvo.ano ? `/${alvo.ano}` : ""}` : null;

  // Abre o protocolo na Centi (só leitura) e confere Id + nº — antes de anexar, e no "Conferir na Centi".
  const conferirAlvo = useCallback(
    async (a: AlvoCenti | null): Promise<ProtocoloCenti | string> => {
      if (!a) return "erro" in lidoAlvo ? lidoAlvo.erro : "Informe o protocolo.";
      const r = await pedir("protocolo", a, 60_000);
      return r.ok && r.protocolo ? r.protocolo : (r.erro ?? "Não consegui abrir o protocolo na Centi.");
    },
    [pedir, lidoAlvo],
  );
  // TESTE do anexo sem emitir DFD: um PDF de 1 página feito aqui, com a descrição "TESTE …" — separa o salvar da emissão.
  const [teste, setTeste] = useState<{ carregando?: boolean; ok?: string; erro?: string } | null>(null);
  const testarAnexo = async () => {
    if (!alvo) {
      const erro = "erro" in lidoAlvo ? lidoAlvo.erro : "Informe o protocolo.";
      setTeste({ erro });
      toast.error(`Testar anexo: ${erro}`);
      return;
    }
    setTeste({ carregando: true });
    // A confirmação fecha o painel de Ajustes (o toque nela é fora dele): o andamento e o resultado vão também num aviso
    // flutuante — senão o teste corria sem nada à vista.
    toast.info("Testando o anexo na Centi…", 6000);
    try {
      const { PDFDocument, StandardFonts } = await import("pdf-lib");
      const doc = await PDFDocument.create();
      const pg = doc.addPage([595, 842]);
      pg.drawText("Teste de anexo - Plataforma PCA. Pode excluir.", { x: 60, y: 760, size: 14, font: await doc.embedFont(StandardFonts.Helvetica) });
      const bytes = await doc.save();
      const hora = new Date().toLocaleTimeString("pt-BR").replace(/:/g, "h").slice(0, 5);
      const descricao = `TESTE - pode excluir - ${hora}`;
      // A confirmação é a janela DA EXTENSÃO (mostra o protocolo e o documento) — a autorização vem do sistema.
      const passo: PassoAnexo = { chave: "teste", alvo: { ...alvo, descricao } };
      const ex = await iniciarExecucao("anexar-dfds", [passo], { teste: true, protocolo: alvo.numero, id: alvo.id });
      if ("erro" in ex) throw new Error(ex.erro);
      const r = await anexarNaCenti(ex.id, passo, null, { ...alvo, tipo: saida.tipoDocumento, descricao, arquivo: `${descricao}.pdf`, pdf: paraBase64(bytes) }, 300_000);
      const res = r.ok ? { ok: `Anexado (documento ${r.sequencial ?? "?"}). O anexo na Centi funciona.` } : { erro: r.erro ?? "A Centi não gravou." };
      setTeste(res);
      if ("ok" in res) toast.success(`Testar anexo: ${res.ok}`, 15_000);
      else toast.error(`Testar anexo: ${res.erro}`, 30_000);
    } catch (e) {
      const erro = e instanceof Error ? e.message : "Falha no teste.";
      setTeste({ erro });
      toast.error(`Testar anexo: ${erro}`, 30_000);
    }
  };
  const conferirNaCenti = async () => {
    setConferencia({ carregando: true });
    const r = await conferirAlvo(alvo);
    setConferencia(typeof r === "string" ? { erro: r } : { protocolo: r });
  };

  const definirEntidade = useCallback((orgao: string, entidade: string) => {
    const v = entidade.trim();
    const n = { ...mapaRef.current };
    if (v && /^[\w.-]{1,40}$/.test(v)) n[orgao] = v;
    else delete n[orgao];
    mapaRef.current = n;
    setMapa(n);
    gravarLocal(CHAVE_ENTIDADES, n);
  }, []);

  // `abrir` = a extensão abre a ABA DA AUTOMAÇÃO na Centi se ela não existir (ao abrir esta tela e no Verificar; a
  // conferência a cada 20 s não reabre a aba que o usuário fechou).
  const avisouParada = useRef(false);
  const verificar = useCallback(
    async (abrir = false) => {
      const r = await pedir("estado", abrir ? { abrir: true } : null, abrir ? 45_000 : 8000);
      setLogado(r);
      if (r.ok && r.operacao) aplicarRef.current(r.operacao);
      // O lote parou porque esta tela foi recarregada (F5) no meio: avisa uma vez o último passo.
      const a = r.atividade;
      if (!avisouParada.current && a && a.estado === "parado" && Date.now() - a.atualizado < 30 * 60_000) {
        avisouParada.current = true;
        toast.info(`O último lote (${a.titulo}) parou: ${a.passo}`, 12_000);
      }
    },
    [pedir],
  );
  // LOGIN AUTOMÁTICO: a extensão entra com as credenciais guardadas NELA (o sistema só pede e mostra a situação).
  const [entrando, setEntrando] = useState(false);
  const entrarAgora = useCallback(async () => {
    setEntrando(true);
    const r = await pedir("entrarAgora", null, 60_000);
    setEntrando(false);
    setLogado(r);
    if (r.ok && r.logado) toast.success("Centi logada.");
    else toast.error(r.login?.pausado ? (r.login.motivo ?? "Login automático pausado.") : (r.erro ?? "Não consegui entrar na Centi."));
  }, [pedir]);
  // AO VIVO: a extensão se anuncia sozinha (instalada/atualizada — sem F5); o estado da Centi é conferido ao abrir, ao
  // voltar à janela e a cada 20 s com a tela à vista (fora do meio de um lote — o canal fica com a Centi).
  const rodandoRef = useRef(false);
  const ocupado = rodando || rodandoTela;
  rodandoRef.current = ocupado;
  // Sair desta tela no meio de um lote o PARA (a extensão não segue sozinha): avisa antes.
  useEffect(() => {
    if (!ocupado) return;
    const avisar = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [ocupado]);
  useEffect(() => {
    if (!ext || !versaoAtende(ext.versao)) return;
    void verificar(true);
    const ver = () => {
      if (document.visibilityState === "visible" && !rodandoRef.current) void verificar();
    };
    const t = window.setInterval(ver, 20_000);
    window.addEventListener("focus", ver);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("focus", ver);
    };
  }, [ext, verificar]);

  // O FREIO de emergência (Configuração da plataforma, no servidor): desligado, nenhuma gravação na Centi passa.
  const [gravacao, setGravacao] = useState<boolean | null>(null);
  const [historico, setHistorico] = useState(false);
  // O GRAVADOR de receitas (na aba da Centi): ligar → o ADM faz a ação lá → parar mostra a estrutura gravada.
  const [gravando, setGravando] = useState(false);
  const [gravados, setGravados] = useState<PassoGravado[] | null>(null);
  const usarGravador = async (acao: "iniciar" | "parar") => {
    const r = (await pedir("gravador", { acao }, 8000)) as Resposta & { gravando?: boolean; passos?: PassoGravado[] };
    if (!r.ok) {
      toast.error(`Gravador: ${r.erro ?? "a extensão não respondeu."}`);
      return;
    }
    setGravando(r.gravando === true);
    if (acao === "iniciar") toast.info("Gravando: faça a ação na tela da Centi e volte para parar.", 10_000);
    else setGravados(r.passos ?? []);
  };
  useEffect(() => {
    fetch("/api/admin/automacao/config")
      .then((r) => r.json())
      .then((j: unknown) => {
        const x = j as { ok?: boolean; config?: { ativa?: boolean; operacao?: unknown } } | null;
        setGravacao(x?.ok ? x.config?.ativa !== false : null);
        // A operação que outro ADM (ou outra aba) já aprendeu da Centi vale aqui também.
        if (x?.ok && x.config?.operacao) {
          opServidor.current = chaveOp(x.config.operacao);
          aplicarRef.current(x.config.operacao, true);
        }
      })
      .catch(() => setGravacao(null));
  }, []);
  const mudarGravacao = async (ativa: boolean) => {
    if (!ativa) {
      const sim = await confirmar({
        titulo: "Pausar a gravação na Centi?",
        texto: "Nenhum anexo será gravado (por ninguém) até ligar de novo. Uma gravação em andamento para no próximo documento.",
        confirmar: "Pausar",
      });
      if (!sim) return;
    }
    try {
      const r = await fetch("/api/admin/automacao/config", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ativa }) });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; error?: string; config?: { ativa?: boolean } } | null;
      if (!r.ok || !j?.ok) throw new Error(j?.error ?? "Falha ao gravar.");
      setGravacao(j.config?.ativa !== false);
      toast.success(ativa ? "Gravação na Centi ligada." : "Gravação na Centi PAUSADA.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gravar.");
    }
  };

  // "Na Centi": quantos documentos o sistema registrou como anexados em cada protocolo (destino "Protocolo de cada DFD").
  const carregarNaCenti = useCallback(async () => {
    const ids = protocolos.map((p) => p.id).slice(0, 2000);
    if (!ids.length) return;
    try {
      const r = await fetch(`/api/admin/automacao/registros?protocolos=${ids.join(",")}`);
      const j = (await r.json().catch(() => null)) as { ok?: boolean; registros?: { protocoloId: number | null }[] } | null;
      if (!r.ok || !j?.ok) return;
      const m = new Map<number, number>();
      for (const x of j.registros ?? []) if (x.protocoloId != null) m.set(x.protocoloId, (m.get(x.protocoloId) ?? 0) + 1);
      setNaCentiCol(m);
    } catch {}
  }, [protocolos]);
  useEffect(() => {
    void carregarNaCenti();
  }, [carregarNaCenti]);

  const { ids, excedente } = lerIdsCenti(texto);
  const escolhidos = useMemo(() => protocolos.filter((p) => sel.has(p.id)), [protocolos, sel]);
  const doProtocolo = useMemo(() => planoDosProtocolos(escolhidos, saida), [escolhidos, saida]);
  const arquivos = useMemo(() => (modo === "protocolo" ? doProtocolo.arquivos : planoDosIds(ids, protocolos, saida)), [modo, doProtocolo, ids, protocolos, saida]);
  const totalDfds = arquivos.reduce((s, a) => s + a.partes.length, 0);
  // A análise antes de baixar: cada DFD do plano (na ordem) + os pulados por não terem planejamento.
  const previa = useMemo<Linha[]>(() => {
    const vistos = new Set<string>();
    const fila: Linha[] = [];
    for (const a of arquivos)
      for (const t of a.partes)
        if (!vistos.has(t.chave)) {
          vistos.add(t.chave);
          fila.push({ ...t, estado: "fila" });
        }
    if (modo === "protocolo")
      for (const x of doProtocolo.semPlanejamento)
        fila.push({ chave: `sem:${x.protocolo}:${x.dfd}`, id: "", dfd: x.dfd, orgao: null, orgaoNome: null, grupo: x.grupo, estado: "pulado" });
    if (modo === "protocolo")
      for (const x of doProtocolo.repetidos)
        fila.push({ chave: x.chave, id: x.id, dfd: x.dfd, orgao: null, orgaoNome: null, grupo: x.grupo, estado: "repetido", erro: x.motivo });
    return fila;
  }, [arquivos, modo, doProtocolo]);

  // Os órgãos dos DFDs (os do que está escolhido; sem escolha, todos) para o mapa órgão → entidade da Centi.
  const orgaos = useMemo(() => {
    const base = modo === "protocolo" && escolhidos.length ? escolhidos : protocolos;
    const m = new Map<string, { nome: string; n: number }>();
    for (const p of base)
      for (const d of p.dfds)
        if (d.orgao) {
          const o = m.get(d.orgao) ?? { nome: d.orgaoNome ?? d.orgao.slice(2), n: 0 };
          o.n++;
          m.set(d.orgao, o);
        }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n);
  }, [modo, escolhidos, protocolos]);

  async function escolherPasta() {
    try {
      const p = await (window as unknown as { showDirectoryPicker: (o: object) => Promise<Pasta> }).showDirectoryPicker({ mode: "readwrite", startIn: "downloads" });
      setPasta(p);
    } catch {}
  }

  type Emissao = { pdf?: Uint8Array; erro?: string; amostra?: string; ambiente?: boolean; entidade?: string; recusada?: boolean };
  // A LÓGICA da emissão (a extensão só leva o pedido à aba da Centi): Processar → o PDF, ou a chave do arquivo → baixa.
  async function emitirUm(id: string, entidade?: string, deNovo = false): Promise<Emissao> {
    const ambiente = (r: Resposta): Emissao => ({ erro: r.erro ?? "Falha na extensão.", ambiente: true });
    const r = await pedir("pedir", { metodo: "POST", caminho: "restauth/operation", corpo: pedidoEmitirDfd(id, cfgRef.current, new Date()), entidade }, 150_000);
    if (!r.ok || r.b64 == null) return ambiente(r);
    const a = analisarRespostaCenti(deBase64(r.b64), r.status ?? 0);
    // A Centi recusou a OPERAÇÃO (ela muda o ModuleKey/Guid do Emitir DFD de tempos em tempos): pega a da tela, que a
    // extensão guardou sozinha, e tenta UMA vez de novo. Sem ela, o erro diz o que fazer — e não adianta outra entidade.
    if (a.tipo === "nada" && operacaoRecusada(a.amostra ?? a.erro)) {
      if (!deNovo) {
        const e = await pedir("estado", null, 8000);
        if (e.ok && aplicarOperacao(e.operacao)) return emitirUm(id, entidade, true);
      }
      return {
        erro: "A Centi recusou a operação Emitir DFD (“Usuário sem permissão!”) — ela deve ter mudado a operação. Emita UM DFD pela própria tela da Centi nesta aba (Planejamento → Operações → Emitir DFD → Processar): a extensão pega a operação nova sozinha. Depois, tente de novo.",
        amostra: a.amostra,
        recusada: true,
      };
    }
    const r2 = await pdfDoAchado(a, baixarPelaExtensao(pedir, entidade));
    if ("pdf" in r2) return { pdf: r2.pdf };
    return { erro: r2.erro, amostra: r2.amostra, ambiente: a.tipo === "nada" && /sessão/i.test(a.erro) };
  }

  // Emite e CONFERE: o PDF tem de trazer o planejamento (e o DFD) pedidos — um PDF de outro DFD nunca é salvo.
  async function emitirConferido(t: TarefaCenti, entidade?: string): Promise<Emissao> {
    const r = await emitirUm(t.id, entidade);
    if (!r.pdf || !saida.conferir) return r;
    const erro = conferirConteudoDfd(await textoDoPdf(r.pdf).catch(() => ""), t);
    return erro ? { erro } : r;
  }

  // A ENTIDADE do DFD: a do órgão (mapa); sem ela, a aberta na Centi. Falhou e "descobrir" está ligado → tenta as outras
  // entidades e lembra a que deu certo para o órgão (os próximos DFDs dele vão direto).
  async function emitirNaEntidade(t: TarefaCenti, semSaida: Set<string>, atual: string | null): Promise<Emissao> {
    const mapeada = t.orgao ? mapaRef.current[t.orgao] : undefined;
    const r = await emitirConferido(t, mapeada);
    if (r.pdf) {
      if (t.orgao && !mapeada && atual) definirEntidade(t.orgao, atual);
      return { ...r, entidade: mapeada ?? atual ?? undefined };
    }
    if (r.ambiente || r.recusada || !cfg.descobrirEntidade || (t.orgao && semSaida.has(t.orgao))) return r;
    const ja = mapeada ?? atual;
    const tentar = [...new Set([...Object.values(mapaRef.current), ...candidatosEntidade(cfg.entidades, atual)])].filter((e) => e !== ja);
    for (const e of tentar) {
      const x = await emitirConferido(t, e);
      if (x.ambiente || x.recusada) return x;
      if (x.pdf) {
        if (t.orgao) definirEntidade(t.orgao, e);
        return { ...x, entidade: e };
      }
    }
    if (t.orgao) semSaida.add(t.orgao);
    return tentar.length ? { ...r, erro: `${r.erro ?? "Falha"} (não achei em nenhuma das ${tentar.length + 1} entidades tentadas)` } : r;
  }

  // Um arquivo após o outro, um DFD após o outro (a Centi processa um pedido por vez na aba). Sem pasta escolhida: um
  // arquivo só vai direto para Downloads; vários vão num ZIP com as pastas montadas.
  async function baixar() {
    if (!arquivos.length || rodando) return;
    const plano = arquivos;
    const tipo = saida.tipoDocumento;
    if (saida.destino === "protocolo" && !alvo) return;
    if (proprio && modo !== "protocolo") return;
    setRodando(true);
    setLinhas(previa);
    // O resultado FINAL de cada DFD (o histórico da execução de leitura — "Emitir DFDs").
    const resultados = new Map<string, { estado: "ok" | "falhou"; texto: string }>();
    const marcar = (chave: string, l: Partial<Linha>) => {
      if (l.estado === "ok" || l.estado === "falha")
        resultados.set(chave, { estado: l.estado === "ok" ? "ok" : "falhou", texto: l.erro ?? (l.estado === "ok" ? "Salvo." : "Falhou.") });
      setLinhas((ls) => (ls ?? []).map((x) => (x.chave === chave ? { ...x, ...l } : x)));
    };
    const marcarArquivo = (a: ArquivoSaida, l: Partial<Linha>) => {
      for (const t of a.partes) marcar(t.chave, l);
    };
    // ANEXAR: cada arquivo tem o SEU protocolo da Centi (o indicado, ou o do protocolo de onde vieram os DFDs). Antes de
    // emitir qualquer DFD: cada protocolo é conferido na Centi (Id + nº) e o que o sistema já registrou como anexado não é
    // emitido de novo (pré-verificação). Depois, a EXECUÇÃO no sistema — sem ela nada é gravado (a autorização sai dela).
    const destinos = new Map<ArquivoSaida, { passo: PassoAnexo; protocoloId: number | null }>();
    let fila = plano;
    let execucaoId: number | null = null;
    if (anexando) {
      const alvos = new Map<ArquivoSaida, { alvo: AlvoCenti; protocoloId: number | null }>();
      for (const a of plano) {
        const d = proprio ? alvoDoArquivo(a, protocolos) : alvo ? { alvo, protocoloId: null } : { erro: "Informe o protocolo da Centi." };
        if ("erro" in d) marcarArquivo(a, { estado: "falha", erro: d.erro });
        else alvos.set(a, d);
      }
      const porId = new Map<string, AlvoCenti>();
      for (const d of alvos.values()) porId.set(d.alvo.id, d.alvo);
      const recusados = new Map<string, string>();
      for (const [id, al] of porId) {
        const p = await conferirAlvo(al);
        if (typeof p === "string") recusados.set(id, p);
        if (!proprio) setConferencia(typeof p === "string" ? { erro: p } : { protocolo: p });
      }
      const ja = await jaAnexados([...porId.keys()]);
      if (!ja) toast.info("Não consegui ler o que já foi anexado — o sistema confere de novo antes de cada gravação.", 8000);
      let i = 0;
      for (const [a, d] of alvos) {
        const motivo = recusados.get(d.alvo.id);
        if (motivo) {
          marcarArquivo(a, { estado: "falha", erro: motivo });
          continue;
        }
        const descricao = descricaoDoArquivo(a.nome);
        const feito = ja?.get(`${d.alvo.id}|${descricaoCanonica(descricao)}`);
        if (feito) {
          marcarArquivo(a, { estado: "ok", erro: `Já anexado antes${feito.documento ? ` (documento ${feito.documento})` : ""}${feito.quem ? ` por ${feito.quem}` : ""} — não emitido de novo.` });
          continue;
        }
        destinos.set(a, { passo: { chave: `arquivo-${++i}`, alvo: { ...d.alvo, descricao } }, protocoloId: d.protocoloId });
      }
      fila = plano.filter((a) => destinos.has(a));
      if (!fila.length) {
        setRodando(false);
        return;
      }
      const ex = await iniciarExecucao("anexar-dfds", [...destinos.values()].map((x) => x.passo), {
        destino: saida.destino,
        protocolos: porId.size,
        arquivos: fila.length,
        tipo,
      });
      if ("erro" in ex) {
        for (const a of fila) marcarArquivo(a, { estado: "falha", erro: ex.erro });
        toast.error(`Anexar: ${ex.erro}`, 15_000);
        setRodando(false);
        return;
      }
      execucaoId = ex.id;
    } else {
      // BAIXAR também é uma EXECUÇÃO registrada (receita "Emitir DFDs", só leitura): quem, quando e cada DFD.
      const vistos = new Set<string>();
      const ps: { chave: string; alvo: string }[] = [];
      for (const a of plano)
        for (const t of a.partes)
          if (!vistos.has(t.chave)) {
            vistos.add(t.chave);
            ps.push({ chave: t.chave, alvo: `Planejamento ${t.id}${t.dfd ? ` · DFD ${t.dfd}` : ""} → ${a.nome}` });
          }
      const ex = await iniciarExecucaoLeitura("emitir-dfd", "baixar", ps, { destino: "pasta", arquivos: plano.length, formato: saida.formato });
      if ("erro" in ex) {
        for (const a of plano) marcarArquivo(a, { estado: "falha", erro: ex.erro });
        toast.error(`Baixar: ${ex.erro}`, 15_000);
        setRodando(false);
        return;
      }
      execucaoId = ex.id;
    }
    const reportados = new Set<string>();
    const destino = !anexando && saida.escolherPasta ? pasta : null;
    const zip = !anexando && !destino && (plano.length > 1 || plano[0].pastas.length > 0) ? new ZipArmazenar() : null;
    const pedacos: Blob[] = [];
    // Devolve a nota da linha (o anexo: o nº do documento na Centi). Falha → lança com o motivo.
    const gravar = async (a: ArquivoSaida, bytes: Uint8Array, unido = false): Promise<string | undefined> => {
      const dest = destinos.get(a);
      if (anexando && execucaoId != null && dest) {
        // O PDF CRU da Centi (o relatório dela) é recusado no salvar do protocolo (500); o regravado pelo pdf-lib — o mesmo
        // do PDF unido, que a Centi aceita — vai no lugar. Não deu para regravar: o cru.
        const pdf = unido ? bytes : await regravarPdf(bytes).catch(() => bytes);
        const r = await anexarNaCenti(
          execucaoId,
          dest.passo,
          dest.protocoloId,
          { ...dest.passo.alvo, tipo, arquivo: a.nome, pdf: paraBase64(pdf) },
          320_000,
        );
        reportados.add(dest.passo.chave);
        if (!r.ok) throw new Error(r.erro ?? "A Centi não gravou.");
        return r.jaAnexado
          ? `Já estava no protocolo${r.sequencial ? ` (documento ${r.sequencial})` : ""} — não anexado de novo.`
          : `Documento ${r.sequencial} do protocolo.`;
      }
      // Anexando, um arquivo sem destino na Centi NUNCA cai na pasta/Downloads por engano.
      if (anexando) throw new Error("Sem o protocolo da Centi para este arquivo.");
      if (destino) await gravarNaPasta(destino, a.pastas, a.nome, comoBlob(bytes));
      else if (zip) pedacos.push(...zip.adicionar([...a.pastas, a.nome].join("/"), bytes).map((b) => comoBlob(b)));
      else baixarNoNavegador(a.nome, comoBlob(bytes));
      return undefined;
    };
    const falhaGravar = (e: unknown, unido: boolean) =>
      anexando && e instanceof Error
        ? e.message
        : unido
          ? "Não consegui gravar o PDF unido."
          : "Não consegui gravar (o tamanho não bateu) — escolha a pasta de novo.";
    const semSaida = new Set<string>();
    const atual = logado?.entidade ?? null;
    let parar = false;
    const pararAnexo = (motivo: string | undefined) => {
      parar = true;
      setLinhas((ls) =>
        (ls ?? []).map((x) => (x.estado === "fila" ? { ...x, estado: "falha", erro: `Não emitido — o anexo anterior foi recusado (${motivo ?? "erro"}).` } : x)),
      );
    };
    // O andamento vai à EXTENSÃO (selo no ícone, cartão na aba da automação e popup) — e de lá pode vir o INTERROMPER.
    const totalDfds = fila.reduce((n, a) => n + a.partes.length, 0);
    interrompidoRef.current = false;
    const lt = await pedir("lote", { fase: "inicio", titulo: anexando ? "Anexar DFDs na Centi" : "Baixar DFDs da Centi", total: totalDfds }, 8000);
    loteRef.current = lt.ok && typeof lt.loteId === "string" ? lt.loteId : null;
    let feitos = 0;
    const andamento = (texto: string) => {
      const id = loteRef.current;
      if (id) void pedir("lote", { fase: "passo", loteId: id, texto, feito: feitos, total: totalDfds }, 8000);
    };
    for (const a of fila) {
      if (parar || interrompidoRef.current) break;
      const uniao = a.partes.length > 1 ? await novaUniao() : null;
      const unidas: string[] = [];
      for (const t of a.partes) {
        if (interrompidoRef.current) break;
        feitos++;
        andamento(`${anexando ? "Emitindo e anexando" : "Emitindo"} planejamento ${t.id}${t.dfd ? ` · DFD ${t.dfd}` : ""}`);
        marcar(t.chave, { estado: "baixando" });
        const r = await emitirNaEntidade(t, semSaida, atual);
        if (!r.pdf) {
          const erro = r.erro ?? "Falha ao emitir.";
          // Falha do AMBIENTE (extensão/aba/sessão) ou a OPERAÇÃO recusada pela Centi: os demais falhariam igual — para o
          // lote (o que já veio é salvo).
          if (r.ambiente || r.recusada) {
            setLinhas((ls) => (ls ?? []).map((x) => (x.estado === "fila" || x.chave === t.chave ? { ...x, estado: "falha", erro } : x)));
            void verificar();
            parar = true;
            break;
          }
          marcar(t.chave, { estado: "falha", erro, amostra: r.amostra });
          continue;
        }
        try {
          if (uniao) {
            await uniao.adicionar(r.pdf);
            unidas.push(t.chave);
            marcar(t.chave, { estado: "baixando", entidade: r.entidade, erro: "Conferido — entra no PDF unido." });
          } else {
            const nota = await gravar(a, r.pdf);
            marcar(t.chave, { estado: "ok", entidade: r.entidade, erro: nota });
          }
        } catch (e) {
          marcar(t.chave, { estado: "falha", erro: uniao ? "PDF ilegível — não entrou no arquivo unido." : falhaGravar(e, false) });
          // A Centi recusou o ANEXO: os próximos seriam recusados igual — para o lote (nada de emitir à toa).
          if (anexando && !uniao) {
            pararAnexo(falhaGravar(e, false));
            break;
          }
        }
      }
      if (uniao && !uniao.vazio && !interrompidoRef.current) {
        const res = await uniao
          .salvar()
          .then((b) => gravar(a, b, true))
          .then((nota) => ({ ok: true as const, nota }))
          .catch((e: unknown) => ({ ok: false as const, nota: falhaGravar(e, true) }));
        for (const c of unidas) resultados.set(c, { estado: res.ok ? "ok" : "falhou", texto: res.nota ?? (res.ok ? "Salvo no PDF unido." : "Falhou.") });
        setLinhas((ls) =>
          (ls ?? []).map((x) => (unidas.includes(x.chave) ? { ...x, estado: res.ok ? "ok" : "falha", erro: res.nota } : x)),
        );
        if (anexando && !res.ok) pararAnexo(res.nota);
      }
    }
    // INTERROMPIDO pela extensão: o que estava na fila não roda (o que já foi salvo/anexado fica) e o lote é encerrado.
    const foiInterrompido = interrompidoRef.current;
    if (foiInterrompido) {
      parar = true;
      setLinhas((ls) =>
        (ls ?? []).map((x) => (x.estado === "fila" || x.estado === "baixando" ? { ...x, estado: "falha", erro: "Interrompido na extensão." } : x)),
      );
      toast.info("Lote interrompido pela extensão — o que já tinha sido salvo ou anexado continua.", 10_000);
    }
    if (loteRef.current) {
      const id = loteRef.current;
      loteRef.current = null;
      void pedir("lote", { fase: "fim", loteId: id, resumo: foiInterrompido ? "Interrompido na extensão." : parar ? "O lote parou." : "Lote terminado." }, 8000);
    }
    // Interrompida (falha do ambiente, anexo recusado): a execução é encerrada — os passos que sobraram não rodam.
    if (execucaoId != null && !anexando) {
      const vistos = new Set<string>();
      const lista: { chave: string; estado: "ok" | "falhou"; texto: string }[] = [];
      for (const a of plano)
        for (const t of a.partes)
          if (!vistos.has(t.chave)) {
            vistos.add(t.chave);
            lista.push({ chave: t.chave, ...(resultados.get(t.chave) ?? { estado: "falhou" as const, texto: "Não emitido (o lote parou antes)." }) });
          }
      await concluirPassos(execucaoId, lista);
    } else if (execucaoId != null) {
      if (parar) await cancelarExecucao(execucaoId);
      else
        for (const x of destinos.values())
          if (!reportados.has(x.passo.chave)) await concluirPasso(execucaoId, x.passo.chave, "falhou", "Nenhum DFD deste arquivo foi emitido.");
      void carregarNaCenti();
    }
    if (zip && !zip.vazio) {
      pedacos.push(...zip.fechar().map((b) => comoBlob(b)));
      const raiz = new Set(plano.map((a) => a.pastas[0] ?? ""));
      const nome = raiz.size === 1 && [...raiz][0] ? [...raiz][0] : `DFDs Centi - ${hojeBR()}`;
      baixarNoNavegador(`${nomeSeguro(nome)}.zip`, new Blob(pedacos, { type: "application/zip" }));
    }
    setRodando(false);
  }

  const atualizada = !!ext && versaoAtende(ext.versao);
  const pronto = atualizada && !!logado?.ok && !!logado.logado;
  const precisaPasta = !anexando && saida.escolherPasta && podePasta;
  const semAlvo = saida.destino === "protocolo" && !alvo;
  const proprioSemProtocolo = proprio && modo !== "protocolo";
  const pausada = anexando && gravacao === false;
  const desabilitado = !pronto || !totalDfds || (precisaPasta && !pasta) || semAlvo || proprioSemProtocolo || pausada;
  const motivo = !atualizada
    ? "Instale a extensão (botão no topo)."
    : !pronto
      ? "Abra a Centi logada e clique em Verificar."
      : pausada
        ? "A gravação na Centi está pausada (Ajustes → Gravação na Centi)."
        : proprioSemProtocolo
          ? "O destino “Protocolo de cada DFD” vale só no modo Por protocolo."
          : semAlvo
        ? "Informe o protocolo da Centi em Ajustes → Destino."
        : precisaPasta && !pasta
          ? "Escolha a pasta."
          : undefined;
  const verbo = anexando ? "Anexar" : "Baixar";
  // A análise mostra o plano até a 1ª execução; depois, o resultado (mudou a escolha, volta ao plano).
  const vista = rodando || (linhas && mesmasChaves(linhas, previa)) ? (linhas ?? []) : previa;

  const acoes = (
    <>
      {precisaPasta && (
        <Button size="sm" variant="secondary" onClick={escolherPasta} disabled={rodando} title={pasta ? `Pasta: ${pasta.name}` : "Escolher a pasta de destino"}>
          <IconPastaAberta className="h-4 w-4" />
          <span className="max-w-40 truncate">{pasta ? pasta.name : "Pasta"}</span>
        </Button>
      )}
      <Button size="sm" onClick={baixar} loading={rodando} disabled={desabilitado} title={motivo}>
        <IconDownload className="h-4 w-4" />
        {modo === "protocolo" ? `${verbo} ${escolhidos.length} · ${totalDfds} DFD(s)` : `${verbo} ${totalDfds} DFD(s)`}
      </Button>
    </>
  );

  return (
    <div className="space-y-[var(--gap-block)]">
      <div className="flex flex-wrap items-center gap-2">
        <IconRobo className="h-5 w-5 text-muted" />
        <h1 className="text-lg font-bold text-text">Automação</h1>
        <Ajuda titulo="Automação — baixar DFDs da Centi">
          <p>
            A extensão do Chrome repete, na Centi, Planejamento → Operações → Emitir DFD → Processar para cada planejamento,
            com o login já feito na Centi (aba aberta). Nada entra na Mesa; a emissão é sempre PDF, sem vincular
            ao protocolo, sem assinar, sem enviar e-mail, sem segundo plano.
          </p>
          <p>
            <strong>Destino:</strong> uma pasta (Downloads ou a escolhida) ou <strong>Protocolo da Centi</strong> — informe o Id
            (o “Id” do cadastro do protocolo na Centi, o mesmo da capa) e o nº (“156844” ou “156844/2026”). Cada PDF entra como
            um documento novo do tipo escolhido (padrão 1039 — DFD), com a descrição igual ao nome do arquivo. A extensão abre o
            protocolo, confere Id e nº (diferente = nada é gravado) e não anexa duas vezes a mesma descrição; se a Centi pedir
            uma confirmação (como na tela dela), mostra a pergunta e só grava com o seu “sim”. Só isso é gravado na Centi.
          </p>
          <p>
            <strong>Protocolo de cada DFD:</strong> cada arquivo vai ao protocolo da Centi de onde vieram os DFDs (o “Id:” da
            capa + o nº) — no modo Por protocolo, com PDFs separados ou um por protocolo. A coluna <strong>Na Centi</strong>{" "}
            conta o que já foi anexado em cada um.
          </p>
          <p>
            <strong>Segurança:</strong> cada documento só é gravado com a autorização de uso único do sistema (vale uma vez, para
            aquele protocolo e aquela descrição) e com a sua confirmação na <strong>janela da própria extensão</strong> (uma vez
            por execução e protocolo). O que o sistema já registrou como anexado não é emitido de novo. Em Ajustes → Gravação na
            Centi, o <strong>freio</strong> pausa toda gravação na hora (para todos); o <strong>Histórico das execuções</strong>{" "}
            mostra cada lote, passo a passo.
          </p>
          <p>
            <strong>Aba da automação:</strong> a extensão abre uma aba PRÓPRIA da Centi (no grupo azul “Automação PCA”) e trabalha
            só nela — suas outras abas da Centi não são usadas. Atualizar (F5) esta tela ou a aba da automação não perde a
            sessão: se a Centi pedir login, a extensão entra sozinha. <strong>Login:</strong> o usuário e a senha são salvos UMA
            vez no banner da extensão (Configurar login), <strong>cifrados só nela</strong> — nunca no sistema. Depois de uma
            falha, no máximo uma tentativa a cada 5 minutos; senha recusada ou verificação pedida (captcha, código, troca de
            senha) pausa o login automático até salvar de novo. <strong>Andamento:</strong> o ícone da extensão conta os DFDs
            (ex.: 3/15) e a aba da automação mostra um cartão com o passo atual; tocar no ícone ou no cartão permite{" "}
            <strong>Interromper</strong> — o que já foi salvo ou anexado fica e nada novo começa. Sair desta tela no meio de um
            lote o para.
          </p>
          <p>
            <strong>Instalar/atualizar a extensão:</strong> “Baixar extensão” → descompacte (na atualização, substitua os
            arquivos na MESMA pasta) → chrome://extensions → Modo do desenvolvedor → Carregar sem compactação (ou ↻ no cartão
            dela) → F5 nesta tela. A aba da Centi não precisa ser recarregada. Cada versão nova avisa no sino. Desde a 1.8.0 a
            extensão tem um <strong>id fixo</strong>: o login salvo nela continua depois de cada atualização (salve uma última
            vez ao instalar a 1.8.0). No login da extensão, <strong>“Guardar também no sistema PCA”</strong> (opcional) guarda o
            usuário e a senha cifrados na sua conta do sistema: se a extensão for removida e instalada de novo, o login volta
            sozinho. Só a extensão lê a senha de volta; em Ajustes → Login da Centi dá para ver e remover.
          </p>
          <p>
            <strong>Tarefa “Ler a Tela Protocolo”:</strong> a extensão entra na PO011 – Tela Protocolo da aba “Automação PCA” e
            opera a própria tela da Centi, só para LER. <strong>1 · Buscar repartições</strong> lista o seletor Departamentos;
            marque as suas (a escolha fica lembrada neste computador). <strong>2 · Ler “Em Análise”</strong>: a extensão escolhe
            essas repartições, clica na lupa, abre a aba Em Análise e traz os protocolos (todas as páginas).
            <strong> 3 · Tocar num protocolo</strong> (ou marcar vários e “Emitir e analisar”): a extensão abre o cadastro dele
            na Centi, traz TODOS os dados (viram colunas da tabela), emite pelo Operações → Emitir documentos — sem anexar,
            assinar nem enviar — e o PDF abre na MESMA análise da importação de protocolo (capa, DFDs e itens), um por vez.
            Nada é protocolado sozinho. Protocolar, Salvar, Excluir e Novo nunca são tocados; do menu Operações, só o “Emitir
            documentos”.
          </p>
          <p>
            <strong>Por protocolo:</strong> marque um ou vários (tocar na linha abre o protocolo). Cada um vira a pasta “SIGLA - PCA
            ano - (nº) - ano” com os PDFs “Planejamento P - DFD N - PCA ano - (nº) - ano” — o protocolo sempre no fim (vários:
            “(1222, 2212) - 2026”). DFD sem nº de planejamento é pulado; cada planejamento é baixado UMA vez (a análise avisa
            o duplicado no protocolo e o que já veio de outro protocolo).
            <strong> Por Id:</strong> nºs de planejamento separados por “:” ({MAX_IDS_CENTI} no máximo).
          </p>
          <p>
            <strong>Ajustes:</strong> PDFs separados, unidos por protocolo, por unidade ou num único; pasta “PCA ano”; ordem pelo planejamento;
            escolher a pasta (desligado = Downloads, vários arquivos num .zip com as pastas); conferir cada PDF (precisa
            trazer o planejamento e o DFD pedidos, senão não é salvo).
          </p>
          <p>
            <strong>Entidade (órgão):</strong> cada DFD é emitido na entidade da Centi do órgão dele. Sem ela cadastrada, usa
            a aberta e, se o DFD não estiver nela, tenta as outras e lembra a que deu certo. À mão: abra a entidade na Centi,
            Verificar e toque no código ao lado do órgão.
          </p>
        </Ajuda>
        <SelectField
          compacto
          label="Tarefa"
          value={modo}
          disabled={ocupado}
          onChange={(e) => {
            const v = lerTarefa(e.target.value);
            setModo(v);
            gravarLocal(CHAVE_TAREFA, v);
          }}
        >
          {TAREFAS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </SelectField>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {gravacao === false && (
            <Badge tone="red" dot>
              Gravação pausada
            </Badge>
          )}
          {ext && ext.copias > 1 && (
            <Badge tone="amber" dot>
              {ext.copias} cópias da extensão — remova a antiga
            </Badge>
          )}
          {!ext ? (
            <Badge tone="amber" dot>
              Sem extensão
            </Badge>
          ) : !atualizada ? (
            <Badge tone="amber" dot>
              Extensão v{ext.versao} desatualizada
            </Badge>
          ) : logado?.ok && logado.logado ? (
            <Badge tone="emerald" dot>
              Centi logada{logado.entidade ? ` · ${logado.entidade}` : ""}
            </Badge>
          ) : logado?.tela === "login" ? (
            <LoginCenti login={logado.login ?? null} entrando={entrando} onEntrar={() => void entrarAgora()} onOpcoes={() => void pedir("abrirOpcoes", null, 8000)} />
          ) : (
            <Badge tone="amber" dot>
              {logado?.erro ?? "Centi sem login"}
            </Badge>
          )}
          <Button size="sm" variant="secondary" onClick={() => (ext ? void verificar(true) : window.location.reload())} title="Verificar a extensão e a Centi" aria-label="Verificar">
            <IconRefresh className="h-4 w-4" />
          </Button>
          <Button size="sm" variant={atualizada ? "secondary" : "primary"} onClick={baixarExtensao} title={`Baixar a extensão ${VERSAO_EXTENSAO_CENTI}`}>
            <IconDownload className="h-4 w-4" /> Extensão {VERSAO_EXTENSAO_CENTI}
          </Button>
          <Dropdown
            papel="dialog"
            ariaLabel="Ajustes"
            align="end"
            width={360}
            trigger={
              <span className="inline-flex h-11 items-center gap-2 rounded-control border border-border-2 bg-surface px-3 text-sm font-semibold text-text lg:h-[var(--h-control-sm)]">
                <IconSettings className="h-4 w-4" /> Ajustes
              </span>
            }
          >
            <Ajustes
              saida={saida}
              onSaida={mudarSaida}
              cfg={cfg}
              onCfg={mudar}
              orgaos={orgaos}
              mapa={mapa}
              onEntidade={definirEntidade}
              aberta={logado?.entidade ?? null}
              alvo={alvoTexto}
              onAlvo={mudarAlvo}
              conferir={conferirNaCenti}
              conferencia={conferencia}
              testar={testarAnexo}
              teste={teste}
              gravacao={gravacao}
              onGravacao={(v) => void mudarGravacao(v)}
              onHistorico={() => setHistorico(true)}
              gravando={pronto ? gravando : null}
              onGravador={(a) => void usarGravador(a)}
              onConfigurarLogin={() => void pedir("abrirOpcoes", null, 8000)}
            />
          </Dropdown>
        </div>
      </div>

      <div
        ref={corpo}
        style={{ "--h-automacao": altura ? `${altura}px` : undefined } as React.CSSProperties}
        className={`grid gap-[var(--gap-block)] lg:h-[var(--h-automacao)] lg:grid-rows-[minmax(0,1fr)] ${modo === "tela" ? "" : "lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_24rem]"}`}
      >
        {modo === "tela" ? (
          <TarefaTelaProtocolo
            pedir={pedir}
            lote={loteRef}
            interrompido={interrompidoRef}
            pronto={pronto}
            protocolos={protocolos}
            analise={{ reparticoes: banners.reparticoes, regras: banners.regras, orgaos: banners.orgaos, pcas: banners.pcas }}
            onRodando={setRodandoTela}
          />
        ) : (
        <div className="min-w-0 lg:min-h-0">
          {modo === "protocolo" ? (
            <DataTable
              columns={colunas}
              rows={protocolos}
              getKey={(p) => p.id}
              selectable
              selected={sel}
              onSelected={setSel}
              onRowClick={(p) => setAberto({ tipo: "protocolo", id: p.id })}
              activeKey={aberto?.tipo === "protocolo" ? aberto.id : null}
              density="compact"
              scrollInterno
              acoesRodape={acoes}
              vazio="Nenhum protocolo no sistema."
              resumo={(ls) =>
                `${ls.length} protocolo(s) · ${ls.reduce((s, p) => s + p.dfds.length, 0)} DFD(s) · ${brl(ls.reduce((s, p) => s + p.valor, 0))}`
              }
            />
          ) : (
            <section className={`${CARTAO} space-y-3 p-[var(--pad-card)]`}>
              <TextField
                label="Nºs de planejamento"
                placeholder="1154:1155:1160"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                error={excedente ? `Só os ${MAX_IDS_CENTI} primeiros (${excedente} a mais).` : undefined}
              />
              <div className="flex flex-wrap items-center justify-end gap-2">{acoes}</div>
            </section>
          )}
        </div>
        )}
        {modo !== "tela" && (
          <Analise linhas={vista} rodando={rodando} destino={anexando ? (proprio ? "protocolo de cada DFD" : (rotuloAlvo ?? "protocolo da Centi")) : null} />
        )}
      </div>

      <BannersMesa
        abrir={aberto}
        onFechar={() => setAberto(null)}
        onAbrir={setAberto}
        pode={banners.pode}
        reparticoes={banners.reparticoes}
        reparticaoAtivaId={null}
        regras={banners.regras}
        orgaos={banners.orgaos}
        pcas={banners.pcas}
        onAlterado={() => router.refresh()}
      />
      {historico && <HistoricoExecucoes onFechar={() => setHistorico(false)} />}
      {gravados && <GravadorReceitas passos={gravados} onFechar={() => setGravados(null)} />}
      {confirmacao}
    </div>
  );
}

/** A aba da Centi está na TELA DE LOGIN: a situação do login automático da extensão + Entrar agora / Configurar login. */
function LoginCenti({
  login,
  entrando,
  onEntrar,
  onOpcoes,
}: {
  login: Resposta["login"];
  entrando: boolean;
  onEntrar: () => void;
  onOpcoes: () => void;
}) {
  const pronto = !!login?.credenciais && !login.pausado;
  const detalhe = !login?.credenciais
    ? "Sem login salvo na extensão"
    : login.pausado
      ? (login.motivo ?? "Login automático pausado")
      : login.auto
        ? "entrando sozinha…"
        : "login automático desligado";
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Badge tone={login?.pausado ? "red" : "amber"} dot>
        <span title={detalhe}>{login?.pausado ? "Centi: login pausado" : "Centi na tela de login"}</span>
      </Badge>
      {pronto && (
        <Button size="sm" variant="secondary" onClick={onEntrar} loading={entrando} title="A extensão entra agora com o login guardado nela">
          Entrar agora
        </Button>
      )}
      <Button size="sm" variant="secondary" onClick={onOpcoes} title={detalhe} aria-label={`Configurar login — ${detalhe}`}>
        <IconKey className="h-4 w-4" /> Configurar login
      </Button>
    </span>
  );
}
