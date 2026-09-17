import { getCloudflareContext } from "@opennextjs/cloudflare";

// Introspecção de armazenamento do D1 (só ADM). Tudo em runtime, sem persistir:
// tamanho total do banco (só o binding cru expõe `.meta.size_after`), enumeração
// via `sqlite_master` (inclui tabelas legadas órfãs + de sistema, invisíveis ao
// ORM) e, por tabela, COUNT(*) + soma de LENGTH das colunas. `dbstat` não é
// confiável no D1, então o tamanho por tabela é por CONTEÚDO (bom p/ rateio/%).

type D1 = ReturnType<typeof getCloudflareContext>["env"]["DB"];

export type TabelaArmazenamento = {
  nome: string;
  dominio: string;
  linhas: number;
  bytes: number;
  legado: boolean;
  sistema: boolean;
};

export type ColunaPesada = {
  tabela: string;
  coluna: string;
  rotulo: string;
  bytes: number;
};

export type FotoGrande = { id: number; nome: string; bytes: number };

export type Armazenamento = {
  geradoEm: string;
  totalBytes: number;
  limiteBytes: number;
  limiteContaBytes: number;
  tabelas: TabelaArmazenamento[];
  colunasPesadas: ColunaPesada[];
  sessoes: { total: number; expiradas: number };
  fotos: { qtd: number; limiar: number; maiores: FotoGrande[] };
};

// Só nomes do catálogo do SQLite entram nas queries; ainda assim validamos e
// usamos aspas duplas (defesa em profundidade — nunca há input de usuário aqui).
const ID_VALIDO = /^[A-Za-z0-9_]+$/;
// Limites informativos do D1 no plano gratuito (Workers Free).
const LIMITE_D1_BYTES = 500 * 1024 ** 2; // 500 MB por banco
const LIMITE_CONTA_BYTES = 5 * 1024 ** 3; // 5 GB por conta
const LIMIAR_FOTO_BYTES = 150_000; // fotos de perfil acima disso são sinalizadas

// Domínio por tabela (rótulo de agrupamento na tela). `reparticoes` = "Unidades"
// na interface. Tabelas novas caem em "Outros"; as de sistema, em "Sistema".
const DOMINIOS: Record<string, string> = {
  usuarios: "Autenticação",
  sessoes: "Autenticação",
  grupos: "Acesso",
  usuario_grupos: "Acesso",
  permissoes: "Acesso",
  orgaos: "Acesso",
  reparticoes: "Acesso",
  grupo_reparticoes: "Acesso",
  protocolos: "Protocolos",
  protocolo_opcoes: "Protocolos",
  unidades: "Planilha PCA",
  itens: "Planilha PCA",
  dfd_protocolos: "DFD/PCA",
  dfds: "DFD/PCA",
  dfd_itens: "DFD/PCA",
  pcas: "DFD/PCA",
  pca_dfds: "DFD/PCA",
  catalogos: "Catálogo",
  catalogo_itens: "Catálogo",
  configuracoes: "Configuração",
  tabelas: "Legado",
  colunas: "Legado",
  coluna_opcoes: "Legado",
  linhas: "Legado",
};

const LEGADO = new Set(["tabelas", "colunas", "coluna_opcoes", "linhas"]);

// Colunas notoriamente grandes (base64/JSON) — destaque só-leitura na tela.
const COLUNAS_PESADAS: { tabela: string; coluna: string; rotulo: string }[] = [
  { tabela: "usuarios", coluna: "foto", rotulo: "Fotos de perfil (base64)" },
  { tabela: "dfds", coluna: "secoes", rotulo: "Seções dos DFDs (JSON)" },
  { tabela: "dfds", coluna: "assinaturas", rotulo: "Assinaturas dos DFDs (JSON)" },
  { tabela: "configuracoes", coluna: "dados", rotulo: "Configurações do ADM (JSON)" },
  { tabela: "reparticoes", coluna: "responsavel_dfd", rotulo: "Responsáveis por DFDs (JSON)" },
  { tabela: "linhas", coluna: "dados", rotulo: "Linhas legadas (JSON)" },
];

function ehSistema(nome: string): boolean {
  return /^(sqlite_|__|_cf_|d1_)/.test(nome);
}

function dominioDe(nome: string): string {
  if (ehSistema(nome)) return "Sistema";
  return DOMINIOS[nome] ?? "Outros";
}

function exprBytes(cols: string[]): string {
  if (cols.length === 0) return "0";
  return cols.map((c) => `COALESCE(LENGTH(CAST("${c}" AS BLOB)),0)`).join(" + ");
}

/** Colunas de cada tabela (via PRAGMA), com fallback por tabela se o batch falhar. */
async function colunasPorTabela(db: D1, nomes: string[]): Promise<Map<string, string[]>> {
  const m = new Map<string, string[]>();
  const ler = (res: unknown): string[] => {
    const rows = (res as { results?: { name?: string }[] } | undefined)?.results ?? [];
    return rows.map((r) => String(r.name ?? "")).filter((c) => ID_VALIDO.test(c));
  };
  try {
    const res = await db.batch(nomes.map((n) => db.prepare(`PRAGMA table_info("${n}")`)));
    nomes.forEach((n, i) => {
      m.set(n, ler(res[i]));
    });
  } catch {
    // Alguns runtimes não aceitam PRAGMA em batch — cai para uma a uma.
    for (const n of nomes) {
      try {
        m.set(n, ler(await db.prepare(`PRAGMA table_info("${n}")`).all()));
      } catch {
        m.set(n, []); // sem colunas → bytes 0 (COUNT ainda funciona)
      }
    }
  }
  return m;
}

/** COUNT(*) + soma de bytes por tabela, com fallback por tabela se o batch falhar. */
async function statsPorTabela(
  db: D1,
  nomes: string[],
  cols: Map<string, string[]>,
): Promise<Map<string, { linhas: number; bytes: number }>> {
  const m = new Map<string, { linhas: number; bytes: number }>();
  const q = (n: string) =>
    `SELECT COUNT(*) AS linhas, COALESCE(SUM(${exprBytes(cols.get(n) ?? [])}),0) AS bytes FROM "${n}"`;
  const ler = (res: unknown) => {
    const row = (res as { results?: { linhas?: number; bytes?: number }[] } | undefined)?.results?.[0] ?? {};
    return { linhas: Number(row.linhas ?? 0), bytes: Number(row.bytes ?? 0) };
  };
  try {
    const res = await db.batch(nomes.map((n) => db.prepare(q(n))));
    nomes.forEach((n, i) => {
      m.set(n, ler(res[i]));
    });
  } catch {
    // Uma tabela protegida (ex.: interna do D1) não pode derrubar as demais.
    for (const n of nomes) {
      try {
        m.set(n, ler(await db.prepare(q(n)).all()));
      } catch {
        m.set(n, { linhas: 0, bytes: 0 });
      }
    }
  }
  return m;
}

/** Snapshot completo do armazenamento do banco. */
export async function getArmazenamento(): Promise<Armazenamento> {
  const { env } = getCloudflareContext();
  const db = env.DB;
  const agora = new Date().toISOString();

  // Tamanho total do banco (só o binding cru expõe `.meta.size_after`).
  const probe = await db.prepare("SELECT 1").all();
  const totalBytes = Number((probe.meta as { size_after?: number } | undefined)?.size_after ?? 0);

  // Enumera TODAS as tabelas (inclui legadas órfãs + de sistema).
  const tabRes = await db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all<{ name: string }>();
  const nomes = (tabRes.results ?? []).map((r) => r.name).filter((n) => ID_VALIDO.test(n));

  const cols = await colunasPorTabela(db, nomes);
  const stats = await statsPorTabela(db, nomes, cols);

  const tabelas: TabelaArmazenamento[] = nomes
    .map((n) => {
      const s = stats.get(n) ?? { linhas: 0, bytes: 0 };
      return {
        nome: n,
        dominio: dominioDe(n),
        linhas: s.linhas,
        bytes: s.bytes,
        legado: LEGADO.has(n),
        sistema: ehSistema(n),
      };
    })
    .sort((a, b) => b.bytes - a.bytes);

  // Colunas pesadas — só as que existem no schema atual.
  const alvos = COLUNAS_PESADAS.filter((h) => (cols.get(h.tabela) ?? []).includes(h.coluna));
  const colunasPesadas: ColunaPesada[] = [];
  if (alvos.length > 0) {
    const q = (h: (typeof COLUNAS_PESADAS)[number]) =>
      `SELECT COALESCE(SUM(COALESCE(LENGTH(CAST("${h.coluna}" AS BLOB)),0)),0) AS bytes FROM "${h.tabela}"`;
    let res: unknown[] = [];
    try {
      res = await db.batch(alvos.map((h) => db.prepare(q(h))));
    } catch {
      res = [];
      for (const h of alvos) {
        try {
          res.push(await db.prepare(q(h)).all());
        } catch {
          res.push(undefined);
        }
      }
    }
    alvos.forEach((h, i) => {
      const row = (res[i] as { results?: { bytes?: number }[] } | undefined)?.results?.[0] ?? {};
      colunasPesadas.push({ tabela: h.tabela, coluna: h.coluna, rotulo: h.rotulo, bytes: Number(row.bytes ?? 0) });
    });
    colunasPesadas.sort((a, b) => b.bytes - a.bytes);
  }

  // Sessões: total + expiradas (mesmo formato ISO gravado por auth.ts).
  let sessoes = { total: 0, expiradas: 0 };
  try {
    const r = await db
      .prepare(
        "SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN expira_em < ? THEN 1 ELSE 0 END),0) AS expiradas FROM sessoes",
      )
      .bind(agora)
      .all<{ total: number; expiradas: number }>();
    const row = r.results?.[0];
    if (row) sessoes = { total: Number(row.total ?? 0), expiradas: Number(row.expiradas ?? 0) };
  } catch {
    // tabela ausente — mantém zeros
  }

  // Fotos de perfil grandes (só leitura — apontar, não apagar).
  let fotos = { qtd: 0, limiar: LIMIAR_FOTO_BYTES, maiores: [] as FotoGrande[] };
  if ((cols.get("usuarios") ?? []).includes("foto")) {
    try {
      const maioresRes = await db
        .prepare(
          "SELECT id, nome, COALESCE(LENGTH(CAST(foto AS BLOB)),0) AS bytes FROM usuarios WHERE foto IS NOT NULL ORDER BY bytes DESC LIMIT 10",
        )
        .all<{ id: number; nome: string; bytes: number }>();
      const maiores = (maioresRes.results ?? []).map((r) => ({
        id: Number(r.id),
        nome: String(r.nome),
        bytes: Number(r.bytes),
      }));
      const qtdRes = await db
        .prepare("SELECT COUNT(*) AS n FROM usuarios WHERE foto IS NOT NULL AND LENGTH(CAST(foto AS BLOB)) > ?")
        .bind(LIMIAR_FOTO_BYTES)
        .all<{ n: number }>();
      fotos = { qtd: Number(qtdRes.results?.[0]?.n ?? 0), limiar: LIMIAR_FOTO_BYTES, maiores };
    } catch {
      // coluna/tabela ausente — mantém vazio
    }
  }

  return {
    geradoEm: agora,
    totalBytes,
    limiteBytes: LIMITE_D1_BYTES,
    limiteContaBytes: LIMITE_CONTA_BYTES,
    tabelas,
    colunasPesadas,
    sessoes,
    fotos,
  };
}

/** Higiene: apaga as sessões já vencidas. Retorna quantas foram removidas. */
export async function expurgarSessoesExpiradas(): Promise<{ removidas: number }> {
  const { env } = getCloudflareContext();
  const agora = new Date().toISOString();
  const res = await env.DB.prepare("DELETE FROM sessoes WHERE expira_em < ?").bind(agora).run();
  return { removidas: Number((res.meta as { changes?: number } | undefined)?.changes ?? 0) };
}
