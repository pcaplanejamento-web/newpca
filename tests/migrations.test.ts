import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { before, describe, it } from "node:test";

// Aplica toda a cadeia de migrações (drizzle/*.sql) num SQLite em memória —
// mesmo dialeto do D1 — garantindo que a cadeia evolui sem erro e que o schema
// final tem as tabelas/colunas esperadas. Requer --experimental-sqlite.

const DIR = join(process.cwd(), "drizzle");
const arquivos = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();

function aplicarTudo(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  for (const arq of arquivos) {
    db.exec(readFileSync(join(DIR, arq), "utf8"));
  }
  return db;
}

function nomes(db: DatabaseSync, sql: string): string[] {
  const rows = db.prepare(sql).all() as Array<Record<string, unknown>>;
  return rows.map((r) => String(r.name));
}

describe("migrações D1 (drizzle/*.sql)", () => {
  let db: DatabaseSync;
  before(() => {
    db = aplicarTudo();
  });

  it("há a cadeia completa de arquivos", () => {
    assert.ok(arquivos.length >= 8);
  });

  it("cria todas as tabelas do domínio", () => {
    const tabelas = nomes(db, "SELECT name FROM sqlite_master WHERE type='table'");
    for (const t of [
      "unidades",
      "itens",
      "usuarios",
      "sessoes",
      "protocolos",
      "protocolo_opcoes",
      "tabelas",
      "colunas",
      "coluna_opcoes",
      "linhas",
      "configuracoes",
    ]) {
      assert.ok(tabelas.includes(t), `tabela ausente: ${t}`);
    }
  });

  it("0007 adiciona matricula e foto em usuarios", () => {
    const cols = nomes(db, "SELECT name FROM pragma_table_info('usuarios')");
    assert.ok(cols.includes("matricula"));
    assert.ok(cols.includes("foto"));
  });

  it("0009/0010 criam RBAC por grupo e repartições", () => {
    const tabelas = nomes(db, "SELECT name FROM sqlite_master WHERE type='table'");
    for (const t of [
      "permissoes",
      "grupos",
      "usuario_grupos",
      "reparticoes",
      "grupo_reparticoes",
    ]) {
      assert.ok(tabelas.includes(t), `tabela ausente: ${t}`);
    }
    const prot = nomes(db, "SELECT name FROM pragma_table_info('protocolos')");
    assert.ok(prot.includes("grupo_id"));
  });

  it("0011 adiciona reparticao_id em unidades", () => {
    const cols = nomes(db, "SELECT name FROM pragma_table_info('unidades')");
    assert.ok(cols.includes("reparticao_id"));
  });

  it("0012 cria tabelas DFD/PCA", () => {
    const tabelas = nomes(db, "SELECT name FROM sqlite_master WHERE type='table'");
    for (const t of ["dfds", "dfd_itens", "pcas", "pca_dfds"]) {
      assert.ok(tabelas.includes(t), `tabela ausente: ${t}`);
    }
    const idx = nomes(db, "SELECT name FROM sqlite_master WHERE type='index'");
    assert.ok(idx.includes("dfds_numero_uq"), "índice dfds_numero_uq ausente");
  });

  it("0013 adiciona campos completos do DFD", () => {
    const dfd = nomes(db, "SELECT name FROM pragma_table_info('dfds')");
    for (const c of ["matricula", "email", "telefone", "valor_total", "secoes"]) {
      assert.ok(dfd.includes(c), `coluna ausente em dfds: ${c}`);
    }
    const item = nomes(db, "SELECT name FROM pragma_table_info('dfd_itens')");
    for (const c of ["valor_unitario", "valor_total"]) {
      assert.ok(item.includes(c), `coluna ausente em dfd_itens: ${c}`);
    }
  });

  it("0014 semeia as repartições da Prefeitura de Rio Verde", () => {
    const cods = nomes(db, "SELECT codigo AS name FROM reparticoes");
    for (const c of ["GP", "CGM", "AMT", "AMAE", "SME", "SMS", "SETIA"]) {
      assert.ok(cods.includes(c), `repartição ausente: ${c}`);
    }
    // idempotência: nenhum código duplicado após aplicar a cadeia.
    const dup = db
      .prepare("SELECT codigo, COUNT(*) n FROM reparticoes GROUP BY codigo HAVING n > 1")
      .all() as Array<Record<string, unknown>>;
    assert.equal(dup.length, 0, `códigos duplicados: ${dup.map((d) => d.codigo).join(", ")}`);
  });

  it("0015 concede a aba 'dfd' a quem já tinha 'pca'", () => {
    const row = db.prepare("SELECT abas FROM permissoes WHERE id = 1").get() as {
      abas: string;
    };
    assert.ok(String(row.abas).includes("dfd"), `abas sem dfd: ${row.abas}`);
  });

  it("0016 cria dfd_protocolos e vincula dfds.protocolo_id", () => {
    const tabelas = nomes(db, "SELECT name FROM sqlite_master WHERE type='table'");
    assert.ok(tabelas.includes("dfd_protocolos"), "tabela dfd_protocolos ausente");
    const cols = nomes(db, "SELECT name FROM pragma_table_info('dfd_protocolos')");
    for (const c of ["numero", "interessado", "documento", "assunto", "valor_capa", "reparticao_id"]) {
      assert.ok(cols.includes(c), `coluna ausente em dfd_protocolos: ${c}`);
    }
    const dfd = nomes(db, "SELECT name FROM pragma_table_info('dfds')");
    assert.ok(dfd.includes("protocolo_id"), "coluna dfds.protocolo_id ausente");
    const idx = nomes(db, "SELECT name FROM sqlite_master WHERE type='index'");
    assert.ok(idx.includes("protocolos_dfd_numero_uq"), "índice único de numero ausente");
    assert.ok(idx.includes("dfds_protocolo_idx"), "índice dfds_protocolo_idx ausente");
  });

  it("0017 adiciona numero_interessado e responsavel_dfd em reparticoes", () => {
    const cols = nomes(db, "SELECT name FROM pragma_table_info('reparticoes')");
    assert.ok(cols.includes("numero_interessado"), "coluna numero_interessado ausente");
    assert.ok(cols.includes("responsavel_dfd"), "coluna responsavel_dfd ausente");
  });

  it("0018 adiciona assinaturas em dfds", () => {
    const cols = nomes(db, "SELECT name FROM pragma_table_info('dfds')");
    assert.ok(cols.includes("assinaturas"), "coluna assinaturas ausente");
  });

  it("0020 adiciona ativo em pcas", () => {
    const cols = nomes(db, "SELECT name FROM pragma_table_info('pcas')");
    assert.ok(cols.includes("ativo"), "coluna pcas.ativo ausente");
  });

  it("0022 cria orgaos, adiciona orgao_id/setor_requisitante e PRESERVA o legado", () => {
    const tabelas = nomes(db, "SELECT name FROM sqlite_master WHERE type='table'");
    assert.ok(tabelas.includes("orgaos"), "tabela orgaos ausente");
    const cols = nomes(db, "SELECT name FROM pragma_table_info('reparticoes')");
    // Colunas novas + as antigas continuam presentes (nada perdido no ALTER aditivo).
    for (const c of ["orgao_id", "setor_requisitante", "numero_interessado", "responsavel_dfd", "codigo", "nome", "ordem"]) {
      assert.ok(cols.includes(c), `coluna ausente em reparticoes: ${c}`);
    }
    // Órgão padrão semeado.
    const org = db.prepare("SELECT nome FROM orgaos WHERE id = 1").get() as { nome: string } | undefined;
    assert.ok(org?.nome?.includes("Rio Verde"), "órgão padrão (Prefeitura) ausente");
    // Legado ADAPTADO: unidades pré-existentes (não-GERAL) vinculadas ao órgão 1…
    const amae = db.prepare("SELECT orgao_id FROM reparticoes WHERE codigo = 'AMAE'").get() as { orgao_id: number | null } | undefined;
    assert.equal(amae?.orgao_id, 1, "AMAE deveria estar no órgão 1 (Prefeitura)");
    // …e a GERAL virtual permanece SEM órgão (representa todas as unidades).
    const geral = db.prepare("SELECT orgao_id FROM reparticoes WHERE codigo = 'GERAL'").get() as { orgao_id: number | null } | undefined;
    assert.equal(geral?.orgao_id, null, "GERAL não deve ter órgão");
  });

  it("0023 adiciona assinatura_unica e responsavel_dfd em orgaos (padrão = por unidade)", () => {
    const cols = nomes(db, "SELECT name FROM pragma_table_info('orgaos')");
    assert.ok(cols.includes("assinatura_unica"), "coluna assinatura_unica ausente");
    assert.ok(cols.includes("responsavel_dfd"), "coluna responsavel_dfd ausente em orgaos");
    // Default preserva o comportamento atual: cada unidade tem a sua assinatura (0).
    const org = db.prepare("SELECT assinatura_unica FROM orgaos WHERE id = 1").get() as { assinatura_unica: number } | undefined;
    assert.equal(org?.assinatura_unica, 0, "assinatura_unica deveria começar 0 (por unidade)");
  });

  it("0024 cria catalogo/catalogo_itens (código único global + cascade)", () => {
    const tabelas = nomes(db, "SELECT name FROM sqlite_master WHERE type='table'");
    for (const t of ["catalogos", "catalogo_itens"]) {
      assert.ok(tabelas.includes(t), `tabela ausente: ${t}`);
    }
    const idx = nomes(db, "SELECT name FROM sqlite_master WHERE type='index'");
    assert.ok(idx.includes("catalogo_itens_codigo_uq"), "índice único de código ausente");
    // A aba 'catalogo' foi concedida a quem já tinha 'dfd'.
    const perm = db.prepare("SELECT abas FROM permissoes WHERE id = 1").get() as { abas: string };
    assert.ok(String(perm.abas).includes("catalogo"), `abas sem catalogo: ${perm.abas}`);
    // Com FK ligada: unicidade GLOBAL do código + cascade ao excluir o catálogo.
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("INSERT INTO catalogos (id, nome) VALUES (901, 'Cat A'), (902, 'Cat B')");
    db.exec("INSERT INTO catalogo_itens (catalogo_id, codigo, descricao) VALUES (901, '5241924358', 'AGUA MINERAL')");
    assert.throws(
      () => db.exec("INSERT INTO catalogo_itens (catalogo_id, codigo, descricao) VALUES (902, '5241924358', 'AGUA 2')"),
      "o mesmo código em outro catálogo deveria violar a unicidade global",
    );
    db.exec("DELETE FROM catalogos WHERE id = 901");
    const restantes = db.prepare("SELECT COUNT(*) AS n FROM catalogo_itens WHERE catalogo_id = 901").get() as { n: number };
    assert.equal(restantes.n, 0, "excluir o catálogo deveria apagar os itens (cascade)");
  });

  it("0026 cria auditoria (append-only; FK usuario ON DELETE set null preserva o snapshot)", () => {
    const tabelas = nomes(db, "SELECT name FROM sqlite_master WHERE type='table'");
    assert.ok(tabelas.includes("auditoria"), "tabela auditoria ausente");
    const cols = nomes(db, "SELECT name FROM pragma_table_info('auditoria')");
    for (const c of ["usuario_id", "usuario_nome", "usuario_email", "acao", "entidade", "entidade_id", "resumo", "antes", "depois", "criado_em"]) {
      assert.ok(cols.includes(c), `coluna ausente em auditoria: ${c}`);
    }
    const idx = nomes(db, "SELECT name FROM sqlite_master WHERE type='index'");
    assert.ok(idx.includes("auditoria_entidade_idx"), "índice de entidade ausente");
    // FK usuario_id ON DELETE set null: excluir o usuário mantém a linha (snapshot preservado).
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("INSERT INTO usuarios (id, nome, email, senha_hash) VALUES (955, 'Fulano', 'f955@x.com', 'h')");
    db.exec("INSERT INTO auditoria (usuario_id, usuario_nome, acao, entidade) VALUES (955, 'Fulano', 'editar', 'dfd')");
    db.exec("DELETE FROM usuarios WHERE id = 955");
    const row = db.prepare("SELECT usuario_id, usuario_nome FROM auditoria WHERE usuario_nome = 'Fulano'").get() as {
      usuario_id: number | null;
      usuario_nome: string;
    };
    assert.equal(row.usuario_id, null, "usuario_id deveria virar null ao excluir o usuário");
    assert.equal(row.usuario_nome, "Fulano", "o snapshot do nome deve permanecer");
  });

  it("0027 adiciona numero_interessado/oculto (orgaos), oculto (reparticoes), orgao_id (dfds/dfd_protocolos)", () => {
    const org = nomes(db, "SELECT name FROM pragma_table_info('orgaos')");
    for (const c of ["numero_interessado", "oculto"]) assert.ok(org.includes(c), `coluna ausente em orgaos: ${c}`);
    const rep = nomes(db, "SELECT name FROM pragma_table_info('reparticoes')");
    assert.ok(rep.includes("oculto"), "coluna oculto ausente em reparticoes");
    assert.ok(nomes(db, "SELECT name FROM pragma_table_info('dfds')").includes("orgao_id"), "orgao_id ausente em dfds");
    assert.ok(nomes(db, "SELECT name FROM pragma_table_info('dfd_protocolos')").includes("orgao_id"), "orgao_id ausente em dfd_protocolos");
    // Default preserva o legado: órgão/unidade começam VISÍVEIS (oculto=0).
    const o = db.prepare("SELECT oculto FROM orgaos WHERE id = 1").get() as { oculto: number } | undefined;
    assert.equal(o?.oculto, 0, "órgão deve começar visível");
    const u = db.prepare("SELECT oculto FROM reparticoes WHERE codigo = 'AMAE'").get() as { oculto: number } | undefined;
    assert.equal(u?.oculto, 0, "unidade deve começar visível");
  });

  it("0039 acrescenta Função/Programa/Ação/Ficha/Fonte em orcamento_itens (novo padrão do CUBO)", () => {
    const cols = nomes(db, "SELECT name FROM pragma_table_info('orcamento_itens')");
    for (const c of ["funcao", "programa", "acao", "ficha", "fonte"]) assert.ok(cols.includes(c), `coluna ausente em orcamento_itens: ${c}`);
  });

  it("0028 cria orcamento/orcamento_itens (aba orcamento + cascade)", () => {
    const tabelas = nomes(db, "SELECT name FROM sqlite_master WHERE type='table'");
    for (const t of ["orcamentos", "orcamento_itens"]) {
      assert.ok(tabelas.includes(t), `tabela ausente: ${t}`);
    }
    const cols = nomes(db, "SELECT name FROM pragma_table_info('orcamento_itens')");
    for (const c of ["orcamento_id", "orgao", "unidade", "nome_elemento", "codigo_elemento", "valor_inicial", "saldo", "sequencial"]) {
      assert.ok(cols.includes(c), `coluna ausente em orcamento_itens: ${c}`);
    }
    const idx = nomes(db, "SELECT name FROM sqlite_master WHERE type='index'");
    assert.ok(idx.includes("orcamento_itens_orcamento_idx"), "índice de orcamento_id ausente");
    // A aba 'orcamento' foi concedida a quem já via 'catalogo'.
    const perm = db.prepare("SELECT abas FROM permissoes WHERE id = 1").get() as { abas: string };
    assert.ok(String(perm.abas).includes("orcamento"), `abas sem orcamento: ${perm.abas}`);
    // FK cascade: excluir o orçamento apaga os lançamentos.
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("INSERT INTO orcamentos (id, nome, ano) VALUES (971, 'Orç 2026', 2026)");
    db.exec("INSERT INTO orcamento_itens (orcamento_id, orgao, nome_elemento, valor_inicial) VALUES (971, 'FUNDO A', 'OBRAS', 5000000)");
    db.exec("DELETE FROM orcamentos WHERE id = 971");
    const restantes = db.prepare("SELECT COUNT(*) AS n FROM orcamento_itens WHERE orcamento_id = 971").get() as { n: number };
    assert.equal(restantes.n, 0, "excluir o orçamento deveria apagar os lançamentos (cascade)");
  });

  it("0030 cria orcamento_vinculos (único por tipo+chave; excluir o alvo zera o vínculo)", () => {
    const cols = nomes(db, "SELECT name FROM pragma_table_info('orcamento_vinculos')");
    for (const c of ["tipo", "chave", "texto", "orgao_id", "reparticao_id"]) {
      assert.ok(cols.includes(c), `coluna ausente em orcamento_vinculos: ${c}`);
    }
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("INSERT INTO orgaos (id, nome, sigla) VALUES (981, 'Fundo X', 'FX')");
    db.exec("INSERT INTO orcamento_vinculos (tipo, chave, texto, orgao_id) VALUES ('orgao', 'FUNDO X', 'Fundo X', 981)");
    assert.throws(
      () => db.exec("INSERT INTO orcamento_vinculos (tipo, chave, texto) VALUES ('orgao', 'FUNDO X', 'outro')"),
      "o mesmo texto (tipo+chave) deveria ser único",
    );
    db.exec("DELETE FROM orgaos WHERE id = 981");
    const v = db.prepare("SELECT orgao_id FROM orcamento_vinculos WHERE chave = 'FUNDO X'").get() as { orgao_id: number | null };
    assert.equal(v.orgao_id, null, "excluir o órgão deveria zerar o vínculo (set null)");
  });

  it("0029 adiciona orgao_proprio em reparticoes (default 0 preserva o legado)", () => {
    const cols = nomes(db, "SELECT name FROM pragma_table_info('reparticoes')");
    assert.ok(cols.includes("orgao_proprio"), "coluna orgao_proprio ausente");
    // Nenhuma unidade nasce como "própria do órgão" — todas são filhas comuns.
    const u = db.prepare("SELECT orgao_proprio FROM reparticoes WHERE codigo = 'AMAE'").get() as { orgao_proprio: number } | undefined;
    assert.equal(u?.orgao_proprio, 0, "unidade legada deve começar como filha comum (0)");
  });

  it("0031 cria situações do protocolo, responsável/situação, responsável padrão e o histórico conectado", () => {
    const tabelas = nomes(db, "SELECT name FROM sqlite_master WHERE type='table'");
    assert.ok(tabelas.includes("protocolo_situacoes"), "tabela protocolo_situacoes ausente");
    const prot = nomes(db, "SELECT name FROM pragma_table_info('dfd_protocolos')");
    for (const c of ["responsavel_id", "situacao_id", "criado_por"]) assert.ok(prot.includes(c), `coluna ausente em dfd_protocolos: ${c}`);
    assert.ok(nomes(db, "SELECT name FROM pragma_table_info('usuarios')").includes("responsavel_padrao_id"), "responsavel_padrao_id ausente");
    const aud = nomes(db, "SELECT name FROM pragma_table_info('auditoria')");
    for (const c of ["protocolo_id", "origem", "detalhe"]) assert.ok(aud.includes(c), `coluna ausente em auditoria: ${c}`);
    const idx = nomes(db, "SELECT name FROM sqlite_master WHERE type='index'");
    for (const i of ["auditoria_protocolo_idx", "protocolos_dfd_responsavel_idx", "protocolos_dfd_situacao_idx"]) assert.ok(idx.includes(i), `índice ausente: ${i}`);
    // Excluir a situação LIMPA a do protocolo (FK set null) — o protocolo continua.
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("INSERT INTO protocolo_situacoes (id, nome, cor, ordem) VALUES (981, 'Em análise', '#2563eb', 0)");
    db.exec("INSERT INTO dfd_protocolos (id, numero, situacao_id) VALUES (982, 'P-982/2026', 981)");
    db.exec("DELETE FROM protocolo_situacoes WHERE id = 981");
    const p = db.prepare("SELECT situacao_id FROM dfd_protocolos WHERE id = 982").get() as { situacao_id: number | null } | undefined;
    assert.equal(p?.situacao_id, null, "excluir a situação deveria limpar a do protocolo");
  });

  it("0032 cria o apelido do usuário e as passagens (rastro do DFD sobrescrito) por protocolo", () => {
    assert.ok(nomes(db, "SELECT name FROM pragma_table_info('usuarios')").includes("apelido"), "coluna apelido ausente");
    const cols = nomes(db, "SELECT name FROM pragma_table_info('dfd_passagens')");
    for (const c of ["protocolo_id", "dfd_numero", "planejamento", "tipo", "sigla", "total_itens", "valor_total", "usuario_id", "criado_em"])
      assert.ok(cols.includes(c), `coluna ausente em dfd_passagens: ${c}`);
    const idx = nomes(db, "SELECT name FROM sqlite_master WHERE type='index'");
    for (const i of ["dfd_passagens_uq", "dfd_passagens_numero_idx"]) assert.ok(idx.includes(i), `índice ausente: ${i}`);
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("INSERT INTO dfd_protocolos (id, numero) VALUES (991, 'P-991/2026')");
    db.exec("INSERT INTO dfd_passagens (protocolo_id, dfd_numero, valor_total) VALUES (991, '1525', 100)");
    // Uma passagem por (protocolo, nº do DFD): a segunda do MESMO par é rejeitada (o código faz upsert).
    assert.throws(() => db.exec("INSERT INTO dfd_passagens (protocolo_id, dfd_numero) VALUES (991, '1525')"));
    // Excluir o protocolo apaga o rastro dele (cascade).
    db.exec("DELETE FROM dfd_protocolos WHERE id = 991");
    const n = db.prepare("SELECT COUNT(*) AS n FROM dfd_passagens WHERE protocolo_id = 991").get() as { n: number };
    assert.equal(n.n, 0, "excluir o protocolo deveria apagar as passagens dele");
  });

  it("0033 PCA como espaço: fonte/status/capa, planilha por PCA, ação do DFD, camada da situação e visões", () => {
    const pcas = nomes(db, "SELECT name FROM pragma_table_info('pcas')");
    for (const c of ["fonte", "status", "capa", "publicado_em", "orcamento_visao_id"]) assert.ok(pcas.includes(c), `coluna ausente em pcas: ${c}`);
    assert.ok(nomes(db, "SELECT name FROM pragma_table_info('unidades')").includes("pca_id"));
    const pd = nomes(db, "SELECT name FROM pragma_table_info('pca_dfds')");
    for (const c of ["acao", "substitui_dfd_id", "vinculado_por", "vinculado_em"]) assert.ok(pd.includes(c), `coluna ausente em pca_dfds: ${c}`);
    const sit = nomes(db, "SELECT name FROM pragma_table_info('protocolo_situacoes')");
    for (const c of ["permite_mover_pca", "camada_pca"]) assert.ok(sit.includes(c), `coluna ausente em protocolo_situacoes: ${c}`);
    assert.ok(nomes(db, "SELECT name FROM sqlite_master WHERE type='table'").includes("orcamento_visoes"));
    // O mesmo código de unidade pode existir em PCAs diferentes, mas não duas vezes no mesmo.
    db.exec("INSERT INTO pcas (id, nome, ano) VALUES (991, 'PCA A', 2026), (992, 'PCA B', 2027)");
    db.exec("INSERT INTO unidades (codigo, municipio, pca_id) VALUES ('SEMED', 'RV', 991), ('SEMED', 'RV', 992)");
    assert.throws(() => db.exec("INSERT INTO unidades (codigo, municipio, pca_id) VALUES ('SEMED', 'RV', 991)"));
  });

  it("0033 legado: planilhas viram um PCA 'lista' PUBLICADO e edições com DFDs viram fonte 'protocolo'", () => {
    const d = new DatabaseSync(":memory:");
    const i33 = arquivos.findIndex((f) => f.startsWith("0033"));
    for (const arq of arquivos.slice(0, i33)) d.exec(readFileSync(join(DIR, arq), "utf8"));
    d.exec("INSERT INTO unidades (id, codigo, municipio) VALUES (1, 'SEMED', 'RV'), (2, 'SEMUS', 'RV')");
    d.exec("INSERT INTO itens (unidade_id, nome_produto, ano_desejado) VALUES (1, 'X', 2026)");
    d.exec("INSERT INTO pcas (id, nome, ano) VALUES (10, 'Edição', 2026)");
    d.exec("INSERT INTO dfds (id, numero) VALUES (50, 'DFD-50')");
    d.exec("INSERT INTO pca_dfds (pca_id, dfd_id) VALUES (10, 50)");
    for (const arq of arquivos.slice(i33)) d.exec(readFileSync(join(DIR, arq), "utf8"));
    const ed = d.prepare("SELECT fonte FROM pcas WHERE id = 10").get() as { fonte: string };
    assert.equal(ed.fonte, "protocolo");
    const pub = d.prepare("SELECT id, nome, ano, fonte, status FROM pcas WHERE fonte = 'lista' AND status = 'publicado'").all() as Array<{ id: number; nome: string; ano: number }>;
    assert.equal(pub.length, 1);
    assert.equal(pub[0].ano, 2026);
    assert.equal(pub[0].nome, "PCA 2026");
    const us = d.prepare("SELECT pca_id FROM unidades ORDER BY id").all() as Array<{ pca_id: number }>;
    assert.deepEqual(us.map((u) => u.pca_id), [pub[0].id, pub[0].id]);
  });

  it("0034 Mesa do PCA: protocolo enviado/incorporado; excluir o PCA devolve o protocolo (set null)", () => {
    const cols = nomes(db, "SELECT name FROM pragma_table_info('dfd_protocolos')");
    for (const c of ["pca_id", "pca_enviado_em", "pca_enviado_por", "pca_incorporado_em"]) assert.ok(cols.includes(c), `coluna ausente em dfd_protocolos: ${c}`);
    assert.ok(nomes(db, "SELECT name FROM sqlite_master WHERE type='index'").includes("protocolos_dfd_pca_idx"));
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("INSERT INTO pcas (id, nome, ano, fonte) VALUES (995, 'PCA M', 2027, 'protocolo')");
    db.exec("INSERT INTO dfd_protocolos (id, numero, pca_id, pca_incorporado_em) VALUES (996, 'P-996/2027', 995, CURRENT_TIMESTAMP)");
    db.exec("DELETE FROM pcas WHERE id = 995");
    const p = db.prepare("SELECT pca_id FROM dfd_protocolos WHERE id = 996").get() as { pca_id: number | null };
    assert.equal(p.pca_id, null, "excluir o PCA deveria devolver o protocolo à Mesa principal");
  });

  it("0035 sequencial do item no PCA: pca_itens (único por PCA) + o nº no próprio item", () => {
    assert.ok(nomes(db, "SELECT name FROM sqlite_master WHERE type='table'").includes("pca_itens"));
    const idx = nomes(db, "SELECT name FROM sqlite_master WHERE type='index'");
    for (const i of ["pca_itens_pca_seq_uq", "pca_itens_item_idx"]) assert.ok(idx.includes(i), `índice ausente: ${i}`);
    const cols = nomes(db, "SELECT name FROM pragma_table_info('dfd_itens')");
    for (const c of ["pca_id", "pca_sequencial"]) assert.ok(cols.includes(c), `coluna ausente em dfd_itens: ${c}`);
  });

  it("0036 tudo na Mesa: quem tinha a aba 'protocolos' ganha a Mesa ('dfd'); idempotente, sem mexer nas demais", () => {
    const d = new DatabaseSync(":memory:");
    const i36 = arquivos.findIndex((f) => f.startsWith("0036"));
    assert.ok(i36 > 0, "migração 0036 ausente");
    for (const arq of arquivos.slice(0, i36)) d.exec(readFileSync(join(DIR, arq), "utf8"));
    d.exec(
      `INSERT INTO permissoes (id, nome, abas) VALUES (901, 'Protocolos', '["dashboard","protocolos"]'), (902, 'Protocolos + Mesa', '["protocolos","dfd"]'), (903, 'Só PCA', '["pca"]'), (904, 'Só Dashboard', '["dashboard"]')`,
    );
    const sql = readFileSync(join(DIR, arquivos[i36]), "utf8");
    d.exec(sql);
    d.exec(sql); // idempotente: rodar de novo não duplica a aba
    for (const arq of arquivos.slice(i36 + 1)) d.exec(readFileSync(join(DIR, arq), "utf8"));
    const abas = (id: number) => JSON.parse((d.prepare("SELECT abas FROM permissoes WHERE id = ?").get(id) as { abas: string }).abas);
    assert.deepEqual(abas(901), ["dashboard", "protocolos", "dfd"]);
    assert.deepEqual(abas(902), ["protocolos", "dfd"]);
    assert.deepEqual(abas(903), ["pca"]);
    assert.deepEqual(abas(904), ["dashboard"]);
  });

  it("0037 responsável inicial da Mesa: usuarios.mesa_responsavel (NULL = 'eu')", () => {
    assert.ok(nomes(db, "SELECT name FROM pragma_table_info('usuarios')").includes("mesa_responsavel"));
  });

  it("0038 padronização: classificações e unidades de medida (excluir a classificação zera a da unidade)", () => {
    const tabelas = nomes(db, "SELECT name FROM sqlite_master WHERE type='table'");
    for (const t of ["item_classificacoes", "unidades_medida"]) assert.ok(tabelas.includes(t), `tabela ausente: ${t}`);
    const idx = nomes(db, "SELECT name FROM sqlite_master WHERE type='index'");
    for (const i of ["item_classificacoes_ordem_idx", "unidades_medida_ordem_idx"]) assert.ok(idx.includes(i), `índice ausente: ${i}`);
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("INSERT INTO item_classificacoes (id, nome, palavras) VALUES (981, 'SERVIÇO', '[\"MANUTENCAO\"]')");
    db.exec("INSERT INTO unidades_medida (id, sigla, nome, classificacao_id) VALUES (982, 'SV', 'SERVIÇO', 981)");
    const u = db.prepare("SELECT sinonimos, ordem FROM unidades_medida WHERE id = 982").get() as { sinonimos: string; ordem: number };
    assert.equal(u.sinonimos, "[]");
    assert.equal(u.ordem, 0);
    db.exec("DELETE FROM item_classificacoes WHERE id = 981");
    const depois = db.prepare("SELECT classificacao_id FROM unidades_medida WHERE id = 982").get() as { classificacao_id: number | null };
    assert.equal(depois.classificacao_id, null, "excluir a classificação deveria zerar a da unidade (set null)");
  });

  it("índice único de e-mail existe", () => {
    const idx = nomes(db, "SELECT name FROM sqlite_master WHERE type='index'");
    assert.ok(idx.includes("usuarios_email_uq"));
  });
});
