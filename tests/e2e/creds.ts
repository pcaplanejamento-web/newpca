/**
 * Credenciais do usuário de teste SEMEADO no D1 local (ver `seed.ts`). Sem imports
 * (não puxa @playwright/test) → pode ser usado tanto pelo seed (node) quanto pelos specs.
 * NÃO é segredo: o banco é local/efêmero e o usuário é descartável.
 */
export const E2E_EMAIL = "e2e@teste.local";
export const E2E_SENHA = "E2e-teste-2026!";
