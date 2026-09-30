import { z } from "zod";

// Mensagens PADRÃO do Zod em português do Brasil (as dos schemas que não trazem a própria — ex.: o tamanho máximo de um
// texto). Importado pelo `http.ts`, que toda rota usa para validar o corpo.
z.config(z.locales.ptBR());
