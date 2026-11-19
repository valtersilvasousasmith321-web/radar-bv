import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeSupabase } from "./fakeSupabase.js";

const fake = new FakeSupabase();

vi.mock("../src/db.js", () => ({ supabase: fake }));
vi.mock("../src/logger.js", () => ({ log: vi.fn().mockResolvedValue(undefined) }));

// Mock rss-parser: a 1ª fonte devolve 2 itens normalmente; a 2ª fonte (que
// simula um site fora do ar) lança erro — serve pra provar o Isolamento de
// Fontes: o erro numa fonte não pode impedir a coleta da outra.
vi.mock("rss-parser", () => {
  return {
    default: class ParserFake {
      async parseURL(url: string) {
        if (url.includes("fonte-com-erro")) {
          throw new Error("ECONNREFUSED — site fora do ar");
        }
        return {
          items: [
            { title: "Notícia A", link: "https://fonte-ok.gov.br/a", content: "Conteúdo A", pubDate: "2026-11-18" },
            { title: "Notícia B", link: "https://fonte-ok.gov.br/b", content: "Conteúdo B", pubDate: "2026-11-18" },
          ],
        };
      }
    },
  };
});

const { executarCicloDeColeta, marcarComoProcessada } = await import("../src/collector.js");

beforeEach(() => {
  fake.reset();
});

describe("Trava de Silêncio + Isolamento de Fontes", () => {
  it("coleta itens inéditos e isola a fonte com erro sem afetar a fonte saudável", async () => {
    fake.tables["fontes_monitoradas"] = [
      { id: "fonte-ok", nome: "Fonte OK", url_base: "https://fonte-ok.gov.br/feed", tipo: "rss", editoria_padrao: "boa_vista", ativa: true, erros_consecutivos: 0 },
      { id: "fonte-com-erro", nome: "Fonte Instável", url_base: "https://fonte-com-erro.gov.br/feed", tipo: "rss", editoria_padrao: "roraima", ativa: true, erros_consecutivos: 0 },
    ];

    const inéditos = await executarCicloDeColeta();

    // As 2 notícias da fonte saudável vieram; a fonte com erro não derrubou o ciclo.
    expect(inéditos).toHaveLength(2);
    expect(inéditos.map((i) => i.url).sort()).toEqual(["https://fonte-ok.gov.br/a", "https://fonte-ok.gov.br/b"]);

    // Isolamento: a fonte com erro teve erros_consecutivos incrementado, a saudável não.
    const fonteErro = fake.tables["fontes_monitoradas"].find((f) => f.id === "fonte-com-erro");
    const fonteOk = fake.tables["fontes_monitoradas"].find((f) => f.id === "fonte-ok");
    expect(fonteErro.erros_consecutivos).toBe(1);
    expect(fonteErro.ativa).toBe(true); // só desativa depois de 10 erros seguidos
    expect(fonteOk.erros_consecutivos).toBe(0);
  });

  it("fecha a Trava de Silêncio: um item já marcado como processado não volta a ser inédito", async () => {
    fake.tables["fontes_monitoradas"] = [
      { id: "fonte-ok", nome: "Fonte OK", url_base: "https://fonte-ok.gov.br/feed", tipo: "rss", editoria_padrao: "boa_vista", ativa: true, erros_consecutivos: 0 },
    ];

    const primeiraColeta = await executarCicloDeColeta();
    expect(primeiraColeta).toHaveLength(2);

    // Simula o pipeline tendo processado e marcado os 2 itens como vistos.
    for (const item of primeiraColeta) {
      await marcarComoProcessada(item.fonteId, item.url, item.hash);
    }

    const segundaColeta = await executarCicloDeColeta();
    expect(segundaColeta).toHaveLength(0); // nenhum gasto de IA de novo — trava funcionando
  });

  it("desativa a fonte automaticamente após 10 erros consecutivos", async () => {
    fake.tables["fontes_monitoradas"] = [
      { id: "fonte-com-erro", nome: "Fonte Instável", url_base: "https://fonte-com-erro.gov.br/feed", tipo: "rss", editoria_padrao: "roraima", ativa: true, erros_consecutivos: 9 },
    ];

    await executarCicloDeColeta();

    const fonte = fake.tables["fontes_monitoradas"][0];
    expect(fonte.erros_consecutivos).toBe(10);
    expect(fonte.ativa).toBe(false);
  });
});
