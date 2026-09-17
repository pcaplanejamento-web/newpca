import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { interpretarSiteverify, parseMetricas, queryMetricas } from "../src/lib/cloudflare-core.ts";

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
  it("agrega requests/errors e calcula taxa de erro", () => {
    const json = {
      data: {
        viewer: {
          accounts: [
            {
              workersInvocationsAdaptive: [
                { sum: { requests: 100, errors: 2 }, quantiles: { cpuTimeP50: 5, cpuTimeP99: 20 }, dimensions: { date: "2026-09-16" } },
                { sum: { requests: 100, errors: 0 }, quantiles: { cpuTimeP50: 6, cpuTimeP99: 25 }, dimensions: { date: "2026-09-17" } },
              ],
            },
          ],
        },
      },
    };
    const m = parseMetricas(json);
    assert.equal(m.dias.length, 2);
    assert.equal(m.totalRequests, 200);
    assert.equal(m.totalErrors, 2);
    assert.equal(m.erroPct, 1);
    assert.equal(m.cpuP99, 25); // do último dia
  });
  it("resposta vazia/inesperada → zeros (tolerante)", () => {
    const m = parseMetricas({});
    assert.deepEqual(m.dias, []);
    assert.equal(m.totalRequests, 0);
    assert.equal(m.erroPct, 0);
    assert.equal(m.cpuP99, null);
  });
  it("queryMetricas é uma string GraphQL não-vazia", () => {
    assert.ok(queryMetricas().includes("workersInvocationsAdaptive"));
  });
});
