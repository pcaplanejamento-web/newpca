/**
 * Responsáveis por DFDs de uma repartição. Modelo: **N padrões** + **N temporários**.
 * Todo responsável tem nome, matrícula, função e uma **nomeação** (ato: portaria/decreto/
 * lei + número + link). O temporário tem, além disso, **período** (início/fim). No período
 * de um temporário, ELE é o efetivo (os padrões ficam em cinza). Guardado como JSON na
 * coluna `reparticoes.responsavel_dfd` (reaproveitada; sem migração). Puro/testável.
 * Parse tolerante: aceita o objeto novo, o `{padrao,temporarios[ato]}` anterior, o array
 * de nomes e a string única antigos.
 */

import type { Comportamento } from "./avaliacao-core.ts";
import { type Assinatura, norm } from "./parse-dfd-comum.ts";

export type TipoAto = "portaria" | "decreto" | "lei";

export const TIPOS_ATO: { valor: TipoAto; rotulo: string }[] = [
  { valor: "portaria", rotulo: "Portaria" },
  { valor: "decreto", rotulo: "Decreto" },
  { valor: "lei", rotulo: "Lei" },
];

/** Ato que nomeia o responsável (opcional). */
export type Nomeacao = { tipo: TipoAto | null; numero: string; link: string };
/** Responsável (padrão ou base do temporário). */
export type Responsavel = { nome: string; matricula: string; funcao: string; nomeacao: Nomeacao };
/** Responsável temporário = responsável + período de vigência. */
export type ResponsavelTemporario = Responsavel & { inicio: string; fim: string };
export type Responsaveis = { padroes: Responsavel[]; temporarios: ResponsavelTemporario[] };

export const RESPONSAVEIS_VAZIO: Responsaveis = { padroes: [], temporarios: [] };

/** Fábricas — sempre objetos NOVOS (sem referências compartilhadas). */
export function novaNomeacao(): Nomeacao {
  return { tipo: null, numero: "", link: "" };
}
export function novoResponsavel(nome = ""): Responsavel {
  return { nome, matricula: "", funcao: "", nomeacao: novaNomeacao() };
}
export function novoTemporario(): ResponsavelTemporario {
  return { ...novoResponsavel(), inicio: "", fim: "" };
}

/** Data LOCAL de hoje em "YYYY-MM-DD" (comparável lexicograficamente com as datas ISO). */
export function hojeISO(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}

function txt(v: unknown): string {
  return String(v ?? "").trim();
}

function normNomeacao(o: unknown): Nomeacao {
  const oo = (o ?? {}) as Record<string, unknown>;
  const tipo = oo.tipo === "portaria" || oo.tipo === "decreto" || oo.tipo === "lei" ? oo.tipo : null;
  return { tipo, numero: txt(oo.numero), link: txt(oo.link) };
}
function normResponsavel(o: unknown): Responsavel {
  const oo = (o ?? {}) as Record<string, unknown>;
  return { nome: txt(oo.nome), matricula: txt(oo.matricula), funcao: txt(oo.funcao), nomeacao: normNomeacao(oo.nomeacao) };
}
function normTemporario(o: unknown): ResponsavelTemporario {
  const oo = (o ?? {}) as Record<string, unknown>;
  return { ...normResponsavel(oo), inicio: txt(oo.inicio), fim: txt(oo.fim) };
}
/** Temporário do formato ANTERIOR ({nome, inicio, fim, ato}) — `ato` (texto livre) vira o número. */
function migrarTemporarioAntigo(o: unknown): ResponsavelTemporario {
  const oo = (o ?? {}) as Record<string, unknown>;
  const ato = txt(oo.ato);
  return {
    nome: txt(oo.nome),
    matricula: "",
    funcao: "",
    nomeacao: { tipo: null, numero: ato, link: "" },
    inicio: txt(oo.inicio),
    fim: txt(oo.fim),
  };
}

/** Lê a coluna → `Responsaveis` (tolerante aos formatos novo e antigos). */
export function parseResponsaveis(raw: string | null | undefined): Responsaveis {
  if (raw == null) return { padroes: [], temporarios: [] };
  const s = String(raw).trim();
  if (!s) return { padroes: [], temporarios: [] };

  if (s.startsWith("{")) {
    try {
      const o = JSON.parse(s) as Record<string, unknown>;
      if (o && typeof o === "object" && !Array.isArray(o)) {
        // Formato novo: { padroes: [...], temporarios: [...] }.
        if (Array.isArray(o.padroes)) {
          return {
            padroes: o.padroes.map(normResponsavel).filter((r) => r.nome),
            temporarios: Array.isArray(o.temporarios) ? o.temporarios.map(normTemporario).filter((t) => t.nome) : [],
          };
        }
        // Formato anterior: { padrao: string, temporarios: [{nome, inicio, fim, ato}] }.
        const padroes: Responsavel[] = [];
        if (typeof o.padrao === "string" && o.padrao.trim()) padroes.push(novoResponsavel(o.padrao.trim()));
        const temporarios = Array.isArray(o.temporarios)
          ? o.temporarios.map(migrarTemporarioAntigo).filter((t) => t.nome)
          : [];
        return { padroes, temporarios };
      }
    } catch {
      /* cai no fallback */
    }
  }

  // Formato antigo: array de nomes → 1º vira padrão.
  if (s.startsWith("[")) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) {
        const nome = arr.map((x) => txt(x)).find(Boolean) ?? "";
        return { padroes: nome ? [novoResponsavel(nome)] : [], temporarios: [] };
      }
    } catch {
      /* cai no fallback */
    }
  }

  // Formato antigo: string única.
  return { padroes: [novoResponsavel(s)], temporarios: [] };
}

function limparNomeacao(n: Nomeacao): Nomeacao {
  if (!n.tipo) return { tipo: null, numero: "", link: "" }; // sem ato → zera número/link
  return { tipo: n.tipo, numero: n.numero.trim(), link: n.link.trim() };
}
function limparResponsavel(r: Responsavel): Responsavel {
  return { nome: r.nome.trim(), matricula: r.matricula.trim(), funcao: r.funcao.trim(), nomeacao: limparNomeacao(r.nomeacao) };
}

/** `Responsaveis` → JSON para gravar, ou `null` se vazio. Descarta responsáveis sem nome e
 * temporários sem as duas datas. */
export function serializeResponsaveis(r: Responsaveis): string | null {
  const padroes = r.padroes.map(limparResponsavel).filter((p) => p.nome);
  const temporarios = r.temporarios
    .map((t) => ({ ...limparResponsavel(t), inicio: t.inicio.trim(), fim: t.fim.trim() }))
    .filter((t) => t.nome && t.inicio && t.fim);
  if (padroes.length === 0 && temporarios.length === 0) return null;
  return JSON.stringify({ padroes, temporarios });
}

/**
 * Responsáveis EFETIVOS de uma unidade para conferir a assinatura: quando o órgão está em
 * "assinatura única" (`orgao.assinatura_unica`), valem os do ÓRGÃO (uma config p/ todas as
 * unidades); senão, os da própria unidade. Puro — fonte única cliente+servidor (`carregarResponsaveis`
 * / `responsaveisPorReparticao`). Os `*Raw` são o JSON cru de cada `responsavel_dfd`.
 */
export function responsaveisEfetivos(fonte: {
  assinaturaUnica: boolean;
  orgaoRaw: string | null | undefined;
  unidadeRaw: string | null | undefined;
}): Responsaveis {
  return parseResponsaveis(fonte.assinaturaUnica ? fonte.orgaoRaw : fonte.unidadeRaw);
}

/**
 * Prevê a UNIDADE de um DFD pela ASSINATURA (ponto 5): quando o órgão é "por unidade", cada
 * unidade tem o seu gestor — então o ASSINANTE do DFD identifica a unidade. Devolve o id da 1ª
 * unidade (não oculta) cujo responsável assinou, ou `null`. `exigeAssinatura:false` — só testa
 * o casamento do assinante (não exige o PDF assinado aqui). Puro/testável.
 */
export function preverUnidadePorAssinatura(
  assinaturas: Assinatura[],
  unidades: { id: number; responsaveis: Responsaveis; oculto?: boolean | null }[],
): number | null {
  if (assinaturas.length === 0) return null;
  for (const u of unidades) {
    if (u.oculto) continue;
    if (validarAssinatura(assinaturas, u.responsaveis, { exigeAssinatura: false }).status === "ok") return u.id;
  }
  return null;
}

export type EstadoTemporario = "agendado" | "vigente" | "encerrado";

/** Estado de um temporário em relação a `hoje` (datas incompletas → agendado). */
export function estadoTemporario(t: ResponsavelTemporario, hoje: string): EstadoTemporario {
  if (!t.inicio || !t.fim) return "agendado";
  if (hoje < t.inicio) return "agendado";
  if (hoje > t.fim) return "encerrado";
  return "vigente";
}

/** Temporários VIGENTES hoje (período cobre `hoje`). */
export function temporariosVigentes(r: Responsaveis, hoje: string): ResponsavelTemporario[] {
  return r.temporarios.filter((t) => t.nome && t.inicio && t.fim && t.inicio <= hoje && hoje <= t.fim);
}

/** Os padrões ficam INATIVOS (cinza) quando há ao menos um temporário vigente. */
export function padroesInativos(r: Responsaveis, hoje: string): boolean {
  return temporariosVigentes(r, hoje).length > 0;
}

/** Responsáveis EFETIVOS hoje: os temporários vigentes, senão os padrões. */
export function responsaveisVigentes(
  r: Responsaveis,
  hoje: string,
): { resp: Responsavel; tipo: "temporario" | "padrao" }[] {
  const temps = temporariosVigentes(r, hoje);
  if (temps.length > 0) return temps.map((t) => ({ resp: t, tipo: "temporario" as const }));
  return r.padroes.filter((p) => p.nome).map((p) => ({ resp: p, tipo: "padrao" as const }));
}

// ————————————————————————————————————————————————————————————————————————————
// Conferência da ASSINATURA DIGITAL do DFD contra os responsáveis da repartição.
// Puro/testável — fonte única usada no cliente (banner) e no servidor (gravação).
// ————————————————————————————————————————————————————————————————————————————

/** Data da assinatura ("31/08/2026 16:20:00" | "31/08/2026") → ISO "2026-08-31"
 * (comparável com `inicio`/`fim`); "" se não casar. */
export function dataAssinaturaISO(data: string): string {
  const m = String(data ?? "").match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

/** PDF exige assinatura (avulso/protocolo). O `.xlsx` nunca tem. */
export function pdfExigeAssinatura(nomeArquivo: string | null | undefined): boolean {
  return /\.pdf$/i.test(String(nomeArquivo ?? ""));
}

function mesmoNome(a: string, b: string): boolean {
  const na = norm(a);
  return na.length > 0 && na === norm(b);
}

/** O responsável que SOLICITOU a consolidação do DFD no PCA (assinatura que casou)
 * — snapshot p/ exibição. Não é ele quem autoriza; é quem pede a inclusão. */
export type Solicitante = {
  tipo: "padrao" | "temporario";
  nome: string;
  matricula: string;
  funcao: string;
  nomeacao: Nomeacao;
  inicio?: string;
  fim?: string;
  assinaturaCodigo: string;
  assinaturaData: string;
};

/**
 * Resultado da conferência: `ok` (com o responsável que casou), `sem-assinatura`
 * (informativo, só `.xlsx`) ou `erro` (bloqueia importar/protocolar/salvar).
 */
export type ResultadoAssinatura =
  // `origem`: "auto" = o SISTEMA casou o assinante com o responsável; "equipe" = validada à mão.
  | { status: "ok"; origem: "auto" | "equipe"; tipo: "padrao" | "temporario"; assinatura: Assinatura; responsavel: Responsavel }
  | { status: "dropsigner"; assinatura: Assinatura }
  // Formato E — Foxit/ICP-Brasil lida por OCR, reconhecida SEM match (não bloqueia; ver abaixo).
  | { status: "ocr"; assinatura: Assinatura }
  | { status: "sem-assinatura" }
  | { status: "erro"; motivo: string };

/**
 * Confere as assinaturas do DFD contra os responsáveis da repartição. **Dropsigner** e **Adobe/
 * ICP-Brasil** entram na MESMA lógica dos demais formatos (match por nome) — muda só a cor/rótulo
 * (visual, por `fonte`):
 * - sem assinatura → `erro` se PDF (exigeAssinatura), senão `sem-assinatura` (.xlsx);
 * - vale (→ `ok`) se AO MENOS UMA assinatura (certificado/sistema/dropsigner/adobe) casar (nome) com
 *   um **padrão**, ou com um **temporário** cujo período cobre a data;
 * - com assinatura mas sem responsável cadastrado → `erro`; assinante não autorizado → `erro`;
 * - **exceção estreita:** a Dropsigner "só carimbo" (marca d'água sem bloco visível → nome vazio)
 *   é reconhecida SEM match (verificável pela URL) → `dropsigner` (não bloqueia).
 * - **fallback OCR (assinatura ACHATADA — Foxit/Dropsigner/Adobe sem camada de texto, lida por OCR):** o
 *   OCR é imperfeito, então uma assinatura lida por OCR (`ocr:true`, ou `foxit`) que não casou um
 *   responsável **não bloqueia** → `ocr` (reconhecida; confira no PDF original). Exceto se houver uma
 *   assinatura de leitura LIMPA (texto) com nome que também falhou — essa bloqueia como sempre.
 */
export function validarAssinatura(
  assinaturas: Assinatura[],
  responsaveis: Responsaveis,
  opts: { exigeAssinatura: boolean },
): ResultadoAssinatura {
  if (assinaturas.length === 0) {
    return opts.exigeAssinatura
      ? { status: "erro", motivo: "DFD sem assinatura digital — o PDF precisa vir assinado." }
      : { status: "sem-assinatura" };
  }
  // Match por responsável — TODOS os formatos (inclusive Dropsigner com nome). `mesmoNome` exige
  // nome não-vazio, então o "carimbo" (nome vazio) naturalmente não casa aqui.
  const temResponsavel = responsaveis.padroes.length > 0 || responsaveis.temporarios.length > 0;
  /** O período do temporário cobre a data (`iso` "aaaa-mm-dd"). */
  const cobre = (t: ResponsavelTemporario, iso: string) => !!t.inicio && !!t.fim && t.inicio <= iso && iso <= t.fim;
  if (temResponsavel) {
    // Conferência AUTOMÁTICA (o sistema casa o assinante LIDO). A assinatura ADICIONADA pela equipe
    // (`manual`) leva o nome do responsável atestado — não é leitura: vale só como validação da equipe.
    const lidas = assinaturas.filter((a) => a.fonte !== "manual");
    for (const a of lidas) {
      const padrao = responsaveis.padroes.find((p) => mesmoNome(p.nome, a.nome));
      if (padrao) return { status: "ok", origem: "auto", tipo: "padrao", assinatura: a, responsavel: padrao };
    }
    for (const a of lidas) {
      const iso = dataAssinaturaISO(a.data);
      const temp = responsaveis.temporarios.find((t) => mesmoNome(t.nome, a.nome) && cobre(t, iso));
      if (temp) return { status: "ok", origem: "auto", tipo: "temporario", assinatura: a, responsavel: temp };
    }
    // Validação MANUAL pela EQUIPE: vale enquanto o responsável atestado for da unidade. Na assinatura LIDA
    // validada pela equipe, ela conferiu o PDF — o período do temporário não é reexigido (como sempre foi).
    // Na assinatura ADICIONADA pela equipe (`manual`), a DATA é a que ela informou: um TEMPORÁRIO só vale se
    // o período dele a cobre (sem data — legado —, vale como antes). Trocar a unidade para uma sem esse
    // responsável desfaz o efeito (cai nas regras abaixo).
    for (const a of assinaturas) {
      const nome = a.validacao?.por === "equipe" ? a.validacao.responsavel : "";
      if (!nome) continue;
      const padrao = responsaveis.padroes.find((p) => mesmoNome(p.nome, nome));
      if (padrao) return { status: "ok", origem: "equipe", tipo: "padrao", assinatura: a, responsavel: padrao };
      const iso = a.fonte === "manual" ? dataAssinaturaISO(a.data) : "";
      const temp = responsaveis.temporarios.find((t) => mesmoNome(t.nome, nome) && (!iso || cobre(t, iso)));
      if (temp) return { status: "ok", origem: "equipe", tipo: "temporario", assinatura: a, responsavel: temp };
    }
  }
  // Exceção estreita: Dropsigner "só carimbo" (sem bloco visível, nome vazio) → reconhecida.
  const carimbo = assinaturas.find((a) => a.fonte === "dropsigner" && !a.nome.trim());
  if (carimbo) return { status: "dropsigner", assinatura: carimbo };
  // Fallback OCR: uma assinatura lida por OCR (imperfeita) que não casou NÃO bloqueia → `ocr`. Exceção:
  // se há uma assinatura de leitura LIMPA (texto) COM nome, que também falhou, o fluxo cai no erro
  // normal (a leitura limpa é confiável e deve bloquear).
  const porOcr = (a: Assinatura) => a.ocr === true || a.fonte === "foxit";
  const lidaOcr = assinaturas.find((a) => porOcr(a) && a.nome.trim()) ?? assinaturas.find(porOcr);
  const limpaComNome = assinaturas.some((a) => !porOcr(a) && a.nome.trim());
  if (lidaOcr && !limpaComNome) return { status: "ocr", assinatura: lidaOcr };
  // Senão: fluxo idêntico ao de sempre (sem responsável cadastrado, ou assinante não autorizado).
  if (!temResponsavel) {
    return {
      status: "erro",
      motivo: "Repartição sem responsável por DFDs cadastrado — cadastre o responsável para conferir a assinatura.",
    };
  }
  return {
    status: "erro",
    motivo:
      "Assinante não é responsável autorizado desta repartição (ou fora do período do responsável temporário).",
  };
}

/** Assinatura RECONHECIDA mas NÃO conferida com o responsável (lida por OCR ou só o carimbo Dropsigner)
 * — não bloqueia, mas fica em ATENÇÃO até a equipe validar. Puro. */
export function assinaturaPendenteValidacao(r: ResultadoAssinatura): boolean {
  return r.status === "ocr" || r.status === "dropsigner";
}

// ---- DATA da assinatura (a equipe informa ao ADICIONAR/validar uma assinatura) ----

/** "dd/mm/aaaa" é uma data REAL (sem 31/02), de 2000 em diante e NÃO futura (`hojeIso` = hoje "aaaa-mm-dd"
 * em Brasília; +1 dia de folga p/ fuso). Puro. */
export function dataAssinaturaValida(dataBR: string, hojeIso: string): boolean {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dataBR.trim());
  if (!m) return false;
  const [d, mo, a] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(a, mo - 1, d));
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d || a < 2000) return false;
  const [ha, hm, hd] = hojeIso.split("-").map(Number);
  return dt.getTime() <= Date.UTC(ha, hm - 1, hd) + 86_400_000;
}

/** "aaaa-mm-dd" (campo de data) → "dd/mm/aaaa" gravado na assinatura; `null` se inválida/futura. Puro. */
export function dataAssinaturaDeIso(iso: string, hojeIso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const br = `${m[3]}/${m[2]}/${m[1]}`;
  return dataAssinaturaValida(br, hojeIso) ? br : null;
}

/** Aplica a DATA informada pela equipe numa assinatura: mantém a lida quando é o MESMO dia (não perde a
 * hora/fuso do certificado); senão grava a nova "dd/mm/aaaa". Puro. */
const comData = (a: Assinatura, data: string | undefined): Assinatura => (data && !a.data.trim().startsWith(data) ? { ...a, data } : a);

/**
 * Validação MANUAL pela EQUIPE: o usuário atesta que `responsavel` (da unidade) assinou — e, opcionalmente,
 * a DATA da assinatura ("dd/mm/aaaa"). Marca a 1ª assinatura NOMEADA (senão a 1ª); sem nenhuma assinatura
 * lida (ex.: OCR falhou), ADICIONA uma `fonte:"manual"` com o nome do responsável e a data. Remove
 * validações anteriores (uma só vale). Puro.
 */
export function validarAssinaturaPelaEquipe(assinaturas: Assinatura[], responsavel: string, data?: string): Assinatura[] {
  const limpas = desfazerValidacaoEquipe(assinaturas);
  const validacao = { por: "equipe" as const, responsavel: responsavel.trim() };
  const d = data?.trim() || undefined;
  if (limpas.length === 0)
    return [{ nome: responsavel.trim(), eCpf: "", usuario: "", local: "", data: d ?? "", ip: "", codigo: "", url: "", fonte: "manual", validacao }];
  const i = Math.max(0, limpas.findIndex((a) => a.nome.trim()));
  return limpas.map((a, j) => (j === i ? { ...comData(a, d), validacao } : a));
}

/** Altera a DATA da assinatura VALIDADA pela equipe (a que tem a marca). Vazio não muda nada: a data da
 * assinatura ADICIONADA é obrigatória e a lida do PDF fica. Puro. */
export function definirDataAssinaturaEquipe(assinaturas: Assinatura[], data: string): Assinatura[] {
  const d = data.trim();
  if (!d) return assinaturas;
  return assinaturas.map((a) => (a.validacao?.por === "equipe" ? comData(a, d) : a));
}

/** Desfaz a validação pela equipe (remove a marca e a assinatura `manual` criada por ela). Puro. */
export function desfazerValidacaoEquipe(assinaturas: Assinatura[]): Assinatura[] {
  return assinaturas
    .filter((a) => a.fonte !== "manual")
    .map((a) => {
      if (!a.validacao) return a;
      const { validacao: _v, ...resto } = a;
      return resto;
    });
}

/**
 * Carimba QUEM/QUANDO nas validações pela equipe (servidor — o cliente não decide o autor). Mantém o
 * carimbo de uma validação JÁ gravada idêntica (mesmo responsável); a nova recebe `usuario`/`em`. Puro.
 */
export function carimbarValidacao(novas: Assinatura[], gravadas: Assinatura[], usuario: string, em: string): Assinatura[] {
  const anterior = gravadas.find((a) => a.validacao?.por === "equipe")?.validacao;
  return novas.map((a) => {
    if (a.validacao?.por !== "equipe") return a;
    const mesma = anterior && mesmoNome(anterior.responsavel, a.validacao.responsavel);
    return {
      ...a,
      validacao: {
        por: "equipe",
        responsavel: a.validacao.responsavel,
        usuario: mesma ? anterior.usuario : usuario,
        em: mesma ? anterior.em : em,
      },
    };
  });
}

/**
 * `true` quando o resultado bloqueia a gravação. O COMPORTAMENTO de `dfd.assinatura` (ADM)
 * decide: `bloqueia` (padrão) trava no erro (comportamento de hoje); `avisa`/`automatico`/
 * `ignora` nunca bloqueiam (só avisam / ignoram).
 */
export function bloqueiaAssinatura(r: ResultadoAssinatura, comportamento: Comportamento = "bloqueia"): boolean {
  if (comportamento !== "bloqueia") return false;
  return r.status === "erro";
}

/** Snapshot do responsável que solicitou a consolidação (a partir de um resultado `ok`). */
export function solicitanteDeResultado(r: ResultadoAssinatura): Solicitante | null {
  if (r.status !== "ok") return null;
  const base: Solicitante = {
    tipo: r.tipo,
    nome: r.responsavel.nome,
    matricula: r.responsavel.matricula,
    funcao: r.responsavel.funcao,
    nomeacao: r.responsavel.nomeacao,
    assinaturaCodigo: r.assinatura.codigo,
    assinaturaData: r.assinatura.data,
  };
  if (r.tipo === "temporario") {
    const t = r.responsavel as ResponsavelTemporario;
    base.inicio = t.inicio;
    base.fim = t.fim;
  }
  return base;
}
