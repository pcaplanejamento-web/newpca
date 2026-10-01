import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatarCpu,
  interpretarSiteverify,
  motivoErroCloudflare,
  NOME_WORKER,
  parseMetricas,
  queryMetricas,
  requisicoesDoDia,
} from "../src/lib/cloudflare-core.ts";

describe("interpretarSiteverify (Turnstile)", () => {
  it("token ausente → reprova", () => {
    assert.equal(interpretarSiteverify({ success: true }, false).ok, false);
  });
  it("success:true → aprova", () => {
    assert.equal(interpretarSiteverify({ success: true }, true).ok, true);
  });
  it("success:false → reprova", () => {
    assert.equal(interpretarSiteverify({ success: false }, true).ok, false);
  });
  it("resposta nula/inesperada com token → fail-open (não trava login)", () => {
    assert.equal(interpretarSiteverify(null, true).ok, true);
    assert.equal(interpretarSiteverify({}, true).ok, true);
  });
});

describe("parseMetricas (Cloudflare GraphQL → série)", () => {
  const json = {
    data: {
      viewer: {
        accounts: [
          {
            dias: [
              { sum: { requests: 100, errors: 2, subrequests: 10 }, dimensions: { date: "2026-09-16" } },
              { sum: { requests: 100, errors: 0, subrequests: 5 }, dimensions: { date: "2026-09-17" } },
              { sum: { requests: 50, errors: 0 }, dimensions: { date: "2026-09-17" } },
            ],
            periodo: [{ quantiles: { cpuTimeP50: 1500, cpuTimeP99: 9000 } }],
          },
        ],
      },
    },
  };
  it("soma por dia, totais e taxa de erro", () => {
    const m = parseMetricas(json);
    assert.equal(m.dias.length, 2);
    assert.equal(m.dias[1].requests, 150);
    assert.equal(m.totalRequests, 250);
    assert.equal(m.totalErrors, 2);
    assert.equal(m.totalSubrequests, 15);
    assert.equal(m.erroPct, 0.8);
  });
  it("CPU = quantis do PERÍODO inteiro", () => {
    const m = parseMetricas(json);
    assert.equal(m.cpuP50, 1500);
    assert.equal(m.cpuP99, 9000);
  });
  it("resposta vazia/inesperada → zeros (tolerante)", () => {
    const m = parseMetricas({});
    assert.deepEqual(m.dias, []);
    assert.equal(m.totalRequests, 0);
    assert.equal(m.erroPct, 0);
    assert.equal(m.cpuP99, null);
  });
  it("requisicoesDoDia pega o dia UTC pedido", () => {
    const m = parseMetricas(json);
    assert.equal(requisicoesDoDia(m, "2026-09-17"), 150);
    assert.equal(requisicoesDoDia(m, "2026-09-18"), 0);
  });
});

describe("queryMetricas", () => {
  const q = queryMetricas();
  it("usa o escalar minúsculo string! (String! é recusado pela Cloudflare)", () => {
    assert.ok(q.includes("$accountTag: string!"));
    assert.ok(!/String!/.test(q));
  });
  it("filtra pelo Worker e traz os quantis do período", () => {
    assert.ok(q.includes("scriptName: $script"));
    assert.ok(q.includes("periodo: workersInvocationsAdaptive"));
    assert.equal(NOME_WORKER, "newpca");
  });
});

describe("formatarCpu e motivoErroCloudflare", () => {
  it("µs e ms", () => {
    assert.equal(formatarCpu(null), "—");
    assert.equal(formatarCpu(850), "850 µs");
    assert.equal(formatarCpu(12_400), "12,4 ms");
  });
  it("permissão, conta, limite e HTTP", () => {
    assert.match(motivoErroCloudflare("not authorized to access this account"), /Account Analytics: Read/);
    assert.match(motivoErroCloudflare(undefined, 403), /Account Analytics: Read/);
    assert.match(motivoErroCloudflare(undefined, 429), /limitou/);
    assert.match(motivoErroCloudflare(undefined, 502), /indisponível/);
    assert.equal(motivoErroCloudflare("outro erro"), "outro erro");
  });
});
