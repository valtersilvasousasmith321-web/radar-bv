import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeSupabase } from "./fakeSupabase.js";

const fake = new FakeSupabase();

vi.mock("../src/db.js", () => ({ supabase: fake }));
vi.mock("../src/logger.js", () => ({ log: vi.fn().mockResolvedValue(undefined) }));

// Unsplash/Pexels indisponíveis neste teste (sem chave) -> força o Banco de
// Imagens de Segurança a cair no fallback de categoria, que vem do Supabase fake.
vi.mock("../src/config.js", () => ({
  config: {
    supabase: { url: "x", serviceRoleKey: "x" },
    ia: { geminiApiKey: "x", anthropicApiKey: "x", groqApiKey: "" },
    imagens: { unsplashAccessKey: "", pexelsApiKey: "" },
    whatsapp: { webhookUrl: "", webhookToken: "" },
    site: { baseUrl: "https://radarbv.com.br" },
    cron: {},
    gotejamento: { minMinutos: 20, maxMinutos: 30 },
    dedupHoras: 24,
  },
}));

const enviarParaWhatsApp = vi.fn().mockResolvedValue(undefined);
vi.mock("../src/whatsapp.js", async () => {
  const real = await vi.importActual<any>("../src/whatsapp.js");
  return { ...real, enviarParaWhatsApp };
});

const { agendarPublicacao, publicarNoticiasAgendadas } = await import("../src/queue.js");

const resultadoBase = {
  materia: {
    titulo: "Prefeitura inaugura posto de saúde",
    subtitulo: "Unidade vai atender 3 bairros",
    conteudo: "Parágrafo 1.\n\nParágrafo 2.",
    editoria: "boa_vista" as const,
    tags: ["saude"],
    urgente: false,
  },
  origemIA: "claude" as const,
  palavraChaveImagem: "posto de saude",
  fonteUrl: "https://exemplo.gov.br/noticia-1",
  fonteNome: "Prefeitura de Boa Vista",
};

beforeEach(() => {
  fake.reset();
  enviarParaWhatsApp.mockClear();
  fake.tables["imagens_fallback"] = [
    { editoria: "boa_vista", url: "https://img.example.com/fallback-boa-vista.jpg", padrao: true },
  ];
});

describe("Fila de Gotejamento + Banco de Imagens de Segurança", () => {
  it("agenda a notícia com status 'agendado' e usa a imagem de fallback quando não há API de imagens", async () => {
    await agendarPublicacao(resultadoBase, "fonte-1", "hash-1");

    const noticias = fake.tables["noticias"];
    expect(noticias).toHaveLength(1);
    expect(noticias[0].status).toBe("agendado");
    expect(noticias[0].imagem_e_fallback).toBe(true);
    expect(noticias[0].imagem_url).toBe("https://img.example.com/fallback-boa-vista.jpg");
    expect(noticias[0].resumo_whatsapp).toContain("Prefeitura inaugura posto de saúde");

    // Trava de Silêncio foi fechada para este item (marcado como processado)
    expect(fake.tables["urls_processadas"]).toHaveLength(1);
    expect(fake.tables["urls_processadas"][0].hash_conteudo).toBe("hash-1");
  });

  it("espaça publicações sucessivas entre 20 e 30 minutos (gotejamento, não tudo de uma vez)", async () => {
    const antes = Date.now();
    await agendarPublicacao(resultadoBase, "fonte-1", "hash-1");
    await agendarPublicacao({ ...resultadoBase, fonteUrl: "https://exemplo.gov.br/noticia-2" }, "fonte-1", "hash-2");
    await agendarPublicacao({ ...resultadoBase, fonteUrl: "https://exemplo.gov.br/noticia-3" }, "fonte-1", "hash-3");

    const noticias = fake.tables["noticias"].sort(
      (a: any, b: any) => new Date(a.data_publicacao).getTime() - new Date(b.data_publicacao).getTime()
    );

    const gaps = [1, 2].map(
      (i) => new Date(noticias[i].data_publicacao).getTime() - new Date(noticias[i - 1].data_publicacao).getTime()
    );

    for (const gap of gaps) {
      expect(gap).toBeGreaterThanOrEqual(20 * 60_000 - 1000);
      expect(gap).toBeLessThanOrEqual(30 * 60_000 + 1000);
    }
    // todas no futuro em relação ao momento do agendamento
    expect(new Date(noticias[0].data_publicacao).getTime()).toBeGreaterThan(antes);
  });

  it("só publica (e só dispara WhatsApp) quando a data_publicacao já chegou", async () => {
    fake.tables["noticias"] = [
      { id: "n1", status: "agendado", data_publicacao: new Date(Date.now() - 60_000).toISOString(), resumo_whatsapp: "resumo passado" },
      { id: "n2", status: "agendado", data_publicacao: new Date(Date.now() + 60_000).toISOString(), resumo_whatsapp: "resumo futuro" },
    ];

    await publicarNoticiasAgendadas();

    const n1 = fake.tables["noticias"].find((n: any) => n.id === "n1");
    const n2 = fake.tables["noticias"].find((n: any) => n.id === "n2");
    expect(n1.status).toBe("publicado");
    expect(n2.status).toBe("agendado"); // ainda não chegou a hora

    expect(enviarParaWhatsApp).toHaveBeenCalledTimes(1);
    expect(enviarParaWhatsApp).toHaveBeenCalledWith("resumo passado");
  });
});
