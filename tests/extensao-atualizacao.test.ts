// A ATUALIZAÇÃO AUTOMÁTICA da extensão (v1.304.0, extensão 1.44.0): o serviço confere a versão publicada no sistema, baixa
// o .zip pela sessão do ADM e manda ao ATUALIZADOR local (native messaging) com o SHA-256; depois se recarrega. Nunca
// durante uma automação. E o atualizador (atualizador/) — conferido no texto: a lista branca, a key, a versão e o SHA-256.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ate, POPUP_URL, pausa, servicoFalso } from "./fixtures/chrome-falso.ts";

const ZIP = new Uint8Array([0x50, 0x4b, 3, 4, 1, 2, 3, 4, 5, 6, 7, 8]);
const sha = createHash("sha256").update(ZIP).digest("hex");

function sistema(publicada = "1.45.0") {
  const pedidos: string[] = [];
  const fetch = async (url: string, init: Record<string, unknown>) => {
    pedidos.push(url);
    assert.equal(init.credentials, "include");
    if (url.endsWith("extensao?info=1"))
      return { ok: true, status: 200, json: async () => ({ ok: true, versao: publicada, minima: "1.38.0" }) };
    if (url.endsWith("/automacao/extensao"))
      return { ok: true, status: 200, json: async () => null, arrayBuffer: async () => ZIP.slice().buffer };
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  return { pedidos, fetch };
}
const hostOk = (versao = "1.44.0") => (_: string, m: Record<string, unknown>) =>
  m.acao === "versao" ? { ok: true, versao, pasta: "C:\\PCA\\extensao" } : { ok: true, versao: m.versao };

test("versão nova + atualizador: manda o .zip com o SHA-256 e se recarrega", async () => {
  const sis = sistema();
  const s = servicoFalso({ versao: "1.44.0", fetch: sis.fetch, nativo: hostOk() });
  const r = (await s.pedir({ tipo: "atualizarAgora" }, { url: POPUP_URL })) as { atualizacao: Record<string, unknown> };
  const enviado = s.nativos.find((n) => n.m.acao === "atualizar");
  assert.ok(enviado, "pediu ao atualizador");
  assert.equal(enviado.host, "br.gov.governarv.pca_atualizador");
  assert.equal(enviado.m.versao, "1.45.0");
  assert.equal(enviado.m.sha256, sha);
  assert.deepEqual(new Uint8Array(Buffer.from(String(enviado.m.zip), "base64")), ZIP);
  assert.equal(s.recargas.length, 1, "recarregou");
  assert.equal(r.atualizacao.situacao, "recarregar");
  assert.equal(r.atualizacao.para, "1.45.0");
  // Depois do recarregar: o onInstalled "update" registra a versão nova.
  await s.instalar({ reason: "update", previousVersion: "1.44.0" });
  assert.equal((s.local.atualizacao as Record<string, unknown>).situacao, "emDia");
  assert.equal((s.local.atualizacao as Record<string, unknown>).de, "1.44.0");
});

test("versão igual: não baixa nem recarrega", async () => {
  const sis = sistema("1.44.0");
  const s = servicoFalso({ versao: "1.44.0", fetch: sis.fetch, nativo: hostOk() });
  const r = (await s.pedir({ tipo: "atualizarAgora" }, { url: POPUP_URL })) as { atualizacao: Record<string, unknown> };
  assert.equal(r.atualizacao.situacao, "emDia");
  assert.ok(!sis.pedidos.some((u) => u.endsWith("/automacao/extensao")), "não baixou");
  assert.equal(s.recargas.length, 0);
});

test("sem o atualizador: situação 'ausente', nada baixado", async () => {
  const sis = sistema();
  const s = servicoFalso({ versao: "1.44.0", fetch: sis.fetch });
  const r = (await s.pedir({ tipo: "atualizarAgora" }, { url: POPUP_URL })) as { atualizacao: Record<string, unknown> };
  assert.equal(r.atualizacao.situacao, "ausente");
  assert.equal(r.atualizacao.instalado, false);
  assert.ok(!sis.pedidos.some((u) => u.endsWith("/automacao/extensao")));
  assert.equal(s.recargas.length, 0);
});

test("o atualizador recusa: 'falhou' com o motivo, sem recarregar", async () => {
  const sis = sistema();
  const s = servicoFalso({
    versao: "1.44.0",
    fetch: sis.fetch,
    nativo: (_h, m) => (m.acao === "versao" ? { ok: true, versao: "1.44.0" } : { ok: false, erro: "O pacote é de outra extensão (key diferente)." }),
  });
  const r = (await s.pedir({ tipo: "atualizarAgora" }, { url: POPUP_URL })) as { atualizacao: Record<string, unknown> };
  assert.equal(r.atualizacao.situacao, "falhou");
  assert.match(String(r.atualizacao.erro), /key diferente/);
  assert.equal(s.recargas.length, 0);
});

test("o atualizador cuida de OUTRA pasta: avisa, não manda o pacote", async () => {
  const sis = sistema();
  const s = servicoFalso({ versao: "1.44.0", fetch: sis.fetch, nativo: hostOk("1.40.0") });
  const r = (await s.pedir({ tipo: "atualizarAgora" }, { url: POPUP_URL })) as { atualizacao: Record<string, unknown> };
  assert.equal(r.atualizacao.situacao, "outraPasta");
  assert.ok(!s.nativos.some((n) => n.m.acao === "atualizar"));
});

test("automação em curso: não atualiza; os arquivos trocados esperam o fim para recarregar", async () => {
  const sis = sistema();
  const s = servicoFalso({
    versao: "1.44.0",
    fetch: sis.fetch,
    nativo: hostOk(),
    sessao: { atividade: { id: "L1", estado: "rodando", titulo: "Lote", feito: 1, total: 3, passos: [] } },
  });
  const r = (await s.pedir({ tipo: "atualizarAgora" }, { url: POPUP_URL })) as { atualizacao: Record<string, unknown> };
  assert.equal(r.atualizacao.situacao, "ocupada");
  assert.equal(s.nativos.length, 0);
  // Os arquivos já trocados (a automação começou durante o download): o recarregar espera o lote parar.
  s.local.atualizacao = { situacao: "recarregar", para: "1.45.0" };
  await s.alarme("atualizar-extensao");
  assert.equal(s.recargas.length, 0, "não recarrega no meio da automação");
  (s.sessao.atividade as { estado: string }).estado = "concluido";
  await s.alarme("atualizar-extensao");
  assert.equal(s.recargas.length, 1, "terminada a automação, recarrega");
});

test("o alarme respeita o intervalo de 30 min; o 'Atualizar agora' ignora", async () => {
  const sis = sistema("1.44.0");
  const s = servicoFalso({ versao: "1.44.0", fetch: sis.fetch, nativo: hostOk(), local: { atualizacao: { verificadaEm: Date.now(), instalado: true } } });
  await s.alarme("atualizar-extensao");
  assert.equal(sis.pedidos.length, 0, "dentro do intervalo, nada");
  await s.pedir({ tipo: "atualizarAgora" }, { url: POPUP_URL });
  assert.equal(sis.pedidos.filter((u) => u.endsWith("info=1")).length, 1);
  assert.ok(s.alarmes.includes("atualizar-extensao"), "o alarme de 30 min existe");
  await pausa(1);
});

test("ação na Centi há pouco (um fluxo sem lote) também segura a atualização", async () => {
  const sis = sistema();
  const s = servicoFalso({ versao: "1.44.0", fetch: sis.fetch, nativo: hostOk(), sessao: { acaoEm: Date.now() } });
  const r = (await s.pedir({ tipo: "atualizarAgora" }, { url: POPUP_URL })) as { atualizacao: Record<string, unknown> };
  assert.equal(r.atualizacao.situacao, "ocupada");
  assert.equal(s.nativos.length, 0);
});

test("fora do sistema: 'semSistema' sem gastar o intervalo — confere de novo ao abrir o sistema", async () => {
  let logado = false;
  const sis = sistema("1.44.0");
  const fetch = async (url: string, init: Record<string, unknown>) =>
    logado ? sis.fetch(url, init) : { ok: false, status: 401, json: async () => ({ ok: false, error: "Não autenticado" }) };
  const s = servicoFalso({ versao: "1.44.0", fetch, nativo: hostOk() });
  const r = (await s.pedir({ tipo: "atualizarAgora" }, { url: POPUP_URL })) as { atualizacao: Record<string, unknown> };
  assert.equal(r.atualizacao.situacao, "semSistema");
  assert.equal(r.atualizacao.verificadaEm ?? null, null, "não conta como conferida");
  logado = true;
  await s.alarme("atualizar-extensao");
  assert.equal((s.local.atualizacao as Record<string, unknown>).situacao, "emDia");
});

test("abrir o banner sem situação ainda: confere sozinho; instalada à mão: confere já", async () => {
  const sis = sistema("1.44.0");
  const s = servicoFalso({ versao: "1.44.0", fetch: sis.fetch, nativo: hostOk() });
  await s.instalar({ reason: "update", previousVersion: "1.43.0" });
  await ate(() => (s.local.atualizacao as { situacao?: string } | undefined)?.situacao === "emDia");
  assert.equal((s.local.atualizacao as Record<string, unknown>).instalado, true, "conferiu o atualizador");
  assert.ok(!("para" in (s.local.atualizacao as object)), "não diz 'atualizada' quando foi à mão");
});

// ---------------------------------------------------------------- O ATUALIZADOR (atualizador/)
const arq = (n: string) => readFileSync(new URL(`../extensao-centi/atualizador/${n}`, import.meta.url), "utf8");

test("atualizador: lista branca, mesma key, versão maior e SHA-256 — nos dois sistemas; nunca grava em atualizador/", () => {
  for (const n of ["atualizador.ps1", "atualizador.jxa"]) {
    const t = arq(n);
    assert.match(t, /\^\[a-z0-9\]\[a-z0-9-\]\*\\\.\(js\|json\|html\)\$/, `${n}: a lista branca`);
    assert.match(t, /icone\.png/, `${n}: o ícone`);
    assert.match(t, /key diferente/, `${n}: a mesma key`);
    assert.match(t, /não é mais nova/, `${n}: versão maior`);
    assert.match(t, /SHA-256/, `${n}: o SHA-256`);
    assert.match(t, /atualizador\//, `${n}: pula a pasta do atualizador`);
    assert.match(t, /manifest\.json por ÚLTIMO/, `${n}: o manifesto por último`);
  }
  // O .bat do host é UMA linha (o cmd lê aos pedaços; ele nunca é trocado).
  assert.equal(arq("atualizador.bat").trim().split("\n").length, 1);
  for (const n of ["instalar-windows.ps1", "instalar-mac.command"]) assert.match(arq(n), /lhdooglmnecpbocibgfobaefahliicnn/, `${n}: só a extensão fixa`);
  assert.match(arq("instalar-mac.command"), /^#!\/bin\/sh/);
  assert.match(arq("atualizador.jxa"), /^#!\/usr\/bin\/osascript -l JavaScript/);
});

test("zip da extensão: leva o atualizador — CRLF/BOM no Windows, executável no Mac", async () => {
  const { ARQUIVOS_EXTENSAO } = await import("../src/lib/extensao-centi-arquivos.ts");
  const { zipDaExtensao } = await import("../src/lib/extensao-zip.ts");
  for (const n of ["atualizador/atualizador.ps1", "atualizador/atualizador.bat", "atualizador/atualizador.jxa", "atualizador/instalar-windows.bat", "atualizador/instalar-windows.ps1", "atualizador/instalar-mac.command"])
    assert.ok(n in ARQUIVOS_EXTENSAO, `${n} no pacote`);
  const zip = Buffer.concat(zipDaExtensao(ARQUIVOS_EXTENSAO, null));
  // Diretório central: o modo 0755 nos do Mac; o .ps1 com BOM e CRLF.
  let i = zip.indexOf(Buffer.from([0x50, 0x4b, 1, 2]));
  const modos: Record<string, number> = {};
  while (i >= 0) {
    const nlen = zip.readUInt16LE(i + 28);
    const nome = zip.subarray(i + 46, i + 46 + nlen).toString("utf8");
    modos[nome] = zip.readUInt32LE(i + 38) >>> 16;
    i = zip.indexOf(Buffer.from([0x50, 0x4b, 1, 2]), i + 46);
  }
  assert.equal(modos["atualizador/instalar-mac.command"], 0o100755);
  assert.equal(modos["atualizador/atualizador.jxa"], 0o100755);
  assert.equal(modos["manifest.json"], 0);
  const ps1 = zip.indexOf(Buffer.from([0xef, 0xbb, 0xbf, 0x23]));
  assert.ok(ps1 > 0, "o .ps1 com BOM");
  assert.ok(zip.includes(Buffer.from("$ErrorActionPreference = 'Stop'\r\n")), "CRLF no .ps1");
});

test("instalador do Mac: copia para a pasta fixa e registra o atualizador nela (rodado de verdade, numa pasta temporária)", async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, readFileSync: ler, existsSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join, dirname } = await import("node:path");
  const { spawnSync } = await import("node:child_process");
  const { ARQUIVOS_EXTENSAO } = await import("../src/lib/extensao-centi-arquivos.ts");
  const raiz = mkdtempSync(join(tmpdir(), "pca-inst-"));
  try {
    const baixado = join(raiz, "Downloads", "extensao-centi");
    for (const [n, t] of Object.entries(ARQUIVOS_EXTENSAO)) {
      mkdirSync(dirname(join(baixado, n)), { recursive: true });
      writeFileSync(join(baixado, n), t);
    }
    const r = spawnSync("sh", [join(baixado, "atualizador/instalar-mac.command")], { env: { ...process.env, HOME: raiz }, encoding: "utf8" });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const fixa = join(raiz, "Library/Application Support/Automacao PCA/extensao");
    assert.ok(existsSync(join(fixa, "manifest.json")), "a extensão na pasta fixa");
    assert.ok(existsSync(join(fixa, "atualizador/atualizador.jxa")));
    const host = JSON.parse(ler(join(raiz, "Library/Application Support/Google/Chrome/NativeMessagingHosts/br.gov.governarv.pca_atualizador.json"), "utf8"));
    assert.equal(host.path, join(fixa, "atualizador/atualizador.jxa"), "o host aponta para a pasta FIXA");
    assert.deepEqual(host.allowed_origins, ["chrome-extension://lhdooglmnecpbocibgfobaefahliicnn/"]);
    assert.match(r.stdout, /Carregar sem compactação/);
    assert.match(r.stdout, new RegExp(`Caminho: ${fixa.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test("instalador do Windows: pasta fixa em LOCALAPPDATA, o caminho copiado e a página de extensões aberta", () => {
  const t = arq("instalar-windows.ps1");
  assert.match(t, /\$env:LOCALAPPDATA 'Automacao PCA\\extensao'/);
  assert.match(t, /Set-Clipboard -Value \$pasta/);
  assert.match(t, /chrome:\/\/extensions\//);
  assert.match(t, /HKCU:\\Software\\Google\\Chrome\\NativeMessagingHosts/);
  assert.match(t, /Join-Path \$aqui 'atualizador\.bat'/, "o host da pasta fixa");
});
