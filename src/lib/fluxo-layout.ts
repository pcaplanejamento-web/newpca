/**
 * GEOMETRIA dos diagramas de fluxo (puro, testado em `tests/fluxo-layout.test.ts`): o tamanho dos nós e a posição das
 * portas, o ORGANIZAR automático (colunas na ordem do fluxo, da esquerda para a direita) e as LIGAÇÕES em ângulo reto
 * que nunca passam por cima de um componente (desviam pelos corredores entre eles).
 */
import { type DefNo, type Grafo, type NoFluxo, PORTA_VOLTA, portasDo, type Registro, SAIDA_ERRO } from "./fluxo-core.ts";

export const LARGURA_NO = 216;
export const TOPO_PORTAS = 52;
export const PASSO_PORTA = 24;
export const GRADE = 16;
/** Vão entre as colunas (o corredor por onde as linhas descem/sobem) e entre os nós de uma coluna. */
export const VAO_COLUNA = 96;
export const VAO_LINHA = 40;
/** Folga das linhas em volta dos nós. */
const FOLGA = 16;
const RAIO = 8;

export type Ponto = { x: number; y: number };
type Caixa = { x0: number; y0: number; x1: number; y1: number };

export const alturaNo = (d: DefNo | undefined) => {
  const p = portasDo(d);
  return TOPO_PORTAS + Math.max(1, p ? Math.max(p.entradas.length, p.saidas.length) : 1) * PASSO_PORTA + 6;
};

export const posPorta = (n: NoFluxo, d: DefNo | undefined, lado: "entrada" | "saida", porta: string): Ponto => {
  const p = portasDo(d);
  const lista = lado === "entrada" ? (p?.entradas ?? []) : (p?.saidas ?? []);
  const i = Math.max(0, lista.indexOf(porta));
  return { x: n.x + (lado === "entrada" ? 0 : LARGURA_NO), y: n.y + TOPO_PORTAS + i * PASSO_PORTA + PASSO_PORTA / 2 };
};

export const snap = (v: number) => Math.round(v / GRADE) * GRADE;

const caixaDo = (n: NoFluxo, reg: Registro): Caixa => ({ x0: n.x, y0: n.y, x1: n.x + LARGURA_NO, y1: n.y + alturaNo(reg.get(n.tipo)) });

/** Conexão que VOLTA no fluxo (a porta "volta" do Laço) — não conta para a ordem das colunas. */
const ehVolta = (c: Grafo["conexoes"][number]) => c.entrada === PORTA_VOLTA;

/**
 * ORGANIZAR: cada nó numa COLUNA pela distância do Início (o caminho mais longo — quem depende de outro fica depois dele),
 * a saída "erro" e os ramos ficam abaixo do principal, e dentro da coluna a ordem segue a altura das portas de quem chega
 * (menos cruzamentos). Nós soltos (sem ligação) vão para a última coluna + 1. Devolve as posições novas (na grade).
 */
export function organizarGrafo(g: Grafo, reg: Registro): Grafo {
  if (!g.nos.length) return g;
  const ids = g.nos.map((n) => n.id);
  const frente = g.conexoes.filter((c) => !ehVolta(c) && c.de !== c.para);
  const entram = new Map(ids.map((id) => [id, frente.filter((c) => c.para === id)]));
  // Camada = caminho mais longo a partir das raízes (sem ciclos fora do Laço — garantido pela validação; protege mesmo assim).
  const camada = new Map<string, number>();
  const calcular = (id: string, pilha: Set<string>): number => {
    const ja = camada.get(id);
    if (ja != null) return ja;
    if (pilha.has(id)) return 0;
    pilha.add(id);
    const v = Math.max(-1, ...(entram.get(id) ?? []).map((c) => calcular(c.de, pilha))) + 1;
    pilha.delete(id);
    camada.set(id, v);
    return v;
  };
  for (const id of ids) calcular(id, new Set());
  const ligados = new Set(g.conexoes.flatMap((c) => [c.de, c.para]));
  const soltos = ids.filter((id) => !ligados.has(id) && reg.get(g.nos.find((n) => n.id === id)?.tipo ?? "")?.categoria !== "gatilho");
  const ultima = Math.max(0, ...ids.filter((id) => !soltos.includes(id)).map((id) => camada.get(id) ?? 0));
  for (const id of soltos) camada.set(id, ultima + 1);

  const porId = new Map(g.nos.map((n) => [n.id, n]));
  const colunas = new Map<number, string[]>();
  for (const id of ids) {
    const k = camada.get(id) ?? 0;
    colunas.set(k, [...(colunas.get(k) ?? []), id]);
  }
  const pos = new Map<string, Ponto>();
  const ordemSaida = (c: Grafo["conexoes"][number]) => {
    const d = reg.get(porId.get(c.de)?.tipo ?? "");
    const saidas = portasDo(d)?.saidas ?? [];
    // A saída "erro" por último: o caminho feliz fica em cima.
    return c.saida === SAIDA_ERRO ? 1000 : Math.max(0, saidas.indexOf(c.saida));
  };
  for (const k of [...colunas.keys()].sort((a, b) => a - b)) {
    const col = colunas.get(k) ?? [];
    // Peso = a altura média de onde as ligações chegam (nós e portas já posicionados) — mantém a ordem e evita cruzar.
    const peso = (id: string) => {
      const cs = entram.get(id) ?? [];
      if (!cs.length) return Number.POSITIVE_INFINITY;
      return cs.reduce((s, c) => s + (pos.get(c.de)?.y ?? 0) + ordemSaida(c) * PASSO_PORTA, 0) / cs.length;
    };
    const ordenada = [...col].sort((a, b) => peso(a) - peso(b) || ids.indexOf(a) - ids.indexOf(b));
    let y = 0;
    for (const id of ordenada) {
      const alvo = Number.isFinite(peso(id)) ? Math.max(y, snap(peso(id))) : y;
      pos.set(id, { x: k * (LARGURA_NO + VAO_COLUNA), y: alvo });
      y = alvo + alturaNo(reg.get(porId.get(id)?.tipo ?? "")) + VAO_LINHA;
    }
  }
  // Organizar também desfaz as dobras ajustadas à mão (as posições mudaram).
  return { ...g, nos: g.nos.map((n) => ({ ...n, ...(pos.get(n.id) ?? {}) })), conexoes: g.conexoes.map(({ x: _x, ...c }) => c) };
}

// ———————————————————————————————————————————————— ligações em ângulo reto

const cruzaH = (y: number, xa: number, xb: number, c: Caixa) => y > c.y0 - FOLGA && y < c.y1 + FOLGA && Math.max(xa, xb) > c.x0 - FOLGA && Math.min(xa, xb) < c.x1 + FOLGA;
const cruzaV = (x: number, ya: number, yb: number, c: Caixa) => x > c.x0 - FOLGA && x < c.x1 + FOLGA && Math.max(ya, yb) > c.y0 - FOLGA && Math.min(ya, yb) < c.y1 + FOLGA;
const livre = (pts: Ponto[], cx: Caixa[]) =>
  pts.every((p, i) => {
    if (!i) return true;
    const a = pts[i - 1];
    return cx.every((c) => (a.y === p.y ? !cruzaH(a.y, a.x, p.x, c) : !cruzaV(a.x, a.y, p.y, c)));
  });

/** Tira os pontos repetidos e os que estão no meio de um segmento reto. */
function limpar(pts: Ponto[]): Ponto[] {
  const u = pts.filter((p, i) => !i || p.x !== pts[i - 1].x || p.y !== pts[i - 1].y);
  return u.filter((p, i) => i === 0 || i === u.length - 1 || !((u[i - 1].x === p.x && p.x === u[i + 1].x) || (u[i - 1].y === p.y && p.y === u[i + 1].y)));
}

/**
 * A ROTA de uma ligação (os pontos, em ângulo reto) da saída `a` à entrada `b`: sai sempre para a DIREITA e entra pela
 * ESQUERDA; a dobra vertical fica num corredor livre; se algum segmento passaria por cima de um componente (`obst` — sem
 * os dois nós da ligação), desvia por cima ou por baixo deles. Ligação que volta (b à esquerda de a) contorna por baixo.
 */
export function rotaOrtogonal(a: Ponto, b: Ponto, obst: Caixa[], de?: Caixa, para?: Caixa, preferido?: number): Ponto[] {
  const sai = a.x + FOLGA * 1.5;
  const entra = b.x - FOLGA * 1.5;
  const todos = [...obst, ...(de ? [de] : []), ...(para ? [para] : [])];
  const tentar = (meio: Ponto[]) => limpar([a, { x: sai, y: a.y }, ...meio, { x: entra, y: b.y }, b]);
  const candidatos: Ponto[][] = [];
  if (entra >= sai) {
    // Dobra no meio, junto da saída e junto da entrada.
    for (const x of [snap((sai + entra) / 2), sai, entra]) candidatos.push(tentar([{ x, y: a.y }, { x, y: b.y }]));
  }
  // A dobra escolhida (à mão ou a faixa livre) vale primeiro — entre a saída e a entrada.
  if (preferido != null && entra >= sai) {
    const x = Math.min(entra, Math.max(sai, preferido));
    const r = tentar([{ x, y: a.y }, { x, y: b.y }]);
    if (livre(r, obst)) return r;
  }
  // Corredor horizontal por cima/por baixo de tudo o que fica entre as duas pontas.
  const entre = todos.filter((c) => c.x1 + FOLGA > Math.min(sai, entra) && c.x0 - FOLGA < Math.max(sai, entra));
  const topo = Math.min(a.y, b.y, ...entre.map((c) => c.y0)) - FOLGA * 2;
  const base = Math.max(a.y, b.y, ...entre.map((c) => c.y1)) + FOLGA * 2;
  for (const y of [base, topo].sort((p, q) => Math.abs(p - (a.y + b.y) / 2) - Math.abs(q - (a.y + b.y) / 2)))
    candidatos.push(tentar([{ x: sai, y }, { x: entra, y }]));
  return candidatos.find((c) => livre(c, obst)) ?? candidatos[candidatos.length - 1];
}

/** O `d` do SVG com as dobras arredondadas. */
export function caminhoSvg(pts: Ponto[]): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    const prox = pts[i + 1];
    if (!prox) {
      d += ` L ${p.x} ${p.y}`;
      break;
    }
    const ant = pts[i - 1];
    const r = Math.min(RAIO, Math.hypot(p.x - ant.x, p.y - ant.y) / 2, Math.hypot(prox.x - p.x, prox.y - p.y) / 2);
    const ux = Math.sign(p.x - ant.x);
    const uy = Math.sign(p.y - ant.y);
    const vx = Math.sign(prox.x - p.x);
    const vy = Math.sign(prox.y - p.y);
    d += ` L ${p.x - ux * r} ${p.y - uy * r} Q ${p.x} ${p.y} ${p.x + vx * r} ${p.y + vy * r}`;
  }
  return d;
}

/** As caixas de todos os nós (para desviar). */
export const caixasDoGrafo = (g: Grafo, reg: Registro) => new Map(g.nos.map((n) => [n.id, caixaDo(n, reg)]));

// ———————————————————————————————————————————————— todas as ligações: faixas, setas e cores

/** A distância entre duas linhas que dividiriam o mesmo corredor. */
export const FAIXA = 12;

const verticais = (pts: Ponto[]) =>
  pts.flatMap((p, i) => (i && pts[i - 1].x === p.x && pts[i - 1].y !== p.y ? [{ x: p.x, y0: Math.min(p.y, pts[i - 1].y), y1: Math.max(p.y, pts[i - 1].y) }] : []));
const sobrepoe = (a: { x: number; y0: number; y1: number }, b: { x: number; y0: number; y1: number }) => a.x === b.x && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 2;

/**
 * As ROTAS de todas as ligações do grafo, SEM LINHA SOBRE LINHA: a dobra vertical que cairia em cima da de outra ligação
 * vai para a faixa livre mais perto (±12px, ±24px…), sempre sem passar por cima de um componente. A dobra ajustada à mão
 * (`Conexao.x`) é respeitada. `null` = a ligação aponta um nó que não existe.
 */
export function rotasDoGrafo(g: Grafo, reg: Registro): (Ponto[] | null)[] {
  const caixas = caixasDoGrafo(g, reg);
  const nos = new Map(g.nos.map((n) => [n.id, n]));
  const usadas: { x: number; y0: number; y1: number }[] = [];
  // As ajustadas à mão primeiro: as automáticas desviam delas.
  const ordem = g.conexoes.map((c, i) => i).sort((p, q) => Number(g.conexoes[q].x != null) - Number(g.conexoes[p].x != null));
  const saida: (Ponto[] | null)[] = g.conexoes.map(() => null);
  for (const i of ordem) {
    const c = g.conexoes[i];
    const a = nos.get(c.de);
    const b = nos.get(c.para);
    if (!a || !b) continue;
    const obst = [...caixas].filter(([id]) => id !== c.de && id !== c.para).map(([, cx]) => cx);
    const pa = posPorta(a, reg.get(a.tipo), "saida", c.saida);
    const pb = posPorta(b, reg.get(b.tipo), "entrada", c.entrada);
    const rota = (x?: number) => rotaOrtogonal(pa, pb, obst, caixas.get(c.de), caixas.get(c.para), x);
    let r = rota(c.x);
    if (c.x == null) {
      const base = verticais(r).find((v) => v.x !== pa.x && v.x !== pb.x)?.x;
      if (base != null && verticais(r).some((v) => usadas.some((u) => sobrepoe(v, u)))) {
        for (let k = 1; k <= 8; k++) {
          const x = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * FAIXA;
          const t = rota(x);
          if (verticais(t).some((v) => v.x === x) && !verticais(t).some((v) => usadas.some((u) => sobrepoe(v, u)))) {
            r = t;
            break;
          }
        }
      }
    }
    usadas.push(...verticais(r));
    saida[i] = r;
  }
  return saida;
}

/** A DOBRA arrastável de uma rota (o segmento vertical do meio), ou `null` quando não há. */
export function dobraDaRota(pts: Ponto[]): { x: number; y0: number; y1: number } | null {
  const vs = verticais(pts).filter((v) => v.x !== pts[0].x && v.x !== pts[pts.length - 1].x);
  return vs.length === 1 ? vs[0] : null;
}

/**
 * As SETAS da direção do fluxo ao longo da linha: no meio de cada trecho comprido (≥ 64px) e na chegada (antes da
 * bolinha da porta). `ang` em graus (0 = para a direita).
 */
export function setasDaRota(pts: Ponto[], raioPorta = 8): { x: number; y: number; ang: number }[] {
  const out: { x: number; y: number; ang: number }[] = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const p = pts[i];
    const ang = (Math.atan2(p.y - a.y, p.x - a.x) * 180) / Math.PI;
    if (Math.hypot(p.x - a.x, p.y - a.y) >= 64) out.push({ x: (a.x + p.x) / 2, y: (a.y + p.y) / 2, ang });
    if (i === pts.length - 1) out.push({ x: p.x - Math.cos((ang * Math.PI) / 180) * raioPorta, y: p.y - Math.sin((ang * Math.PI) / 180) * raioPorta, ang });
  }
  return out;
}

/** A COR de cada ligação: a saída "erro" em vermelho; as demais de um MESMO nó em cores diferentes (as séries do tema). */
export function coresDasLigacoes(g: Grafo): string[] {
  const conta = new Map<string, number>();
  return g.conexoes.map((c) => {
    if (c.saida === SAIDA_ERRO) return "var(--danger)";
    const k = conta.get(c.de) ?? 0;
    conta.set(c.de, k + 1);
    return `var(--serie-${(k % 8) + 1})`;
  });
}
