import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeSupabase } from "./fakeSupabase.js";

const fake = new FakeSupabase();

vi.mock("../src/db.js", () => ({ supabase: fake }));
vi.mock("../src/logger.js", () => ({ log: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../src/config.js", () => ({
  config: {
    supabase: { url: "x", serviceRoleKey: "x" },
    whatsapp: { webhookUrl: "", webhookToken: "token-teste" },
    site: { baseUrl: "https://radarbv.com.br" },
  },
}));

// node-fetch é importado dinamicamente (`await import("node-fetch")`) dentro
// do próprio código — mockamos o módulo para capturar as chamadas sem bater
// numa rede de verdade.
const fetchMock = vi.fn();
vi.mock("node-fetch", () => ({ default: fetchMock }));

const { enviarParaWhatsApp } = await import("../src/whatsapp.js");
const { executarResumoDiario, montarTextoResumoDiario } = await import("../src/resumoDiario.js");

beforeEach(() => {
  fake.reset();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, status: 200 });
});

describe("Isolamento de Destinos — disparo por matéria (Fase 3)", () => {
  it("dispara o resumo para TODOS os destinos ativos cadastrados", async () => {
    fake.tables["destinos_whatsapp"] = [
      { id: "d1", nome: "Grupo A", tipo: "grupo", webhook_url: "https://wh.example.com/a", ativo: true, resumo_diario: true },
      { id: "d2", nome: "Canal B", tipo: "canal", webhook_url: "https://wh.example.com/b", ativo: true, resumo_diario: false },
      { id: "d3", nome: "Grupo Inativo", tipo: "grupo", webhook_url: "https://wh.example.com/c", ativo: false, resumo_diario: true },
    ];

    await enviarParaWhatsApp("🔴 teste de disparo");

    expect(fetchMock).toHaveBeenCalledTimes(2); // só os 2 ativos — o inativo (d3) é ignorado
    const urls = fetchMock.mock.calls.map((c) => c[0]);
    expect(urls).toContain("https://wh.example.com/a");
    expect(urls).toContain("https://wh.example.com/b");
    expect(urls).not.toContain("https://wh.example.com/c");
  });

  it("um destino com webhook fora do ar não impede o disparo para os demais (isolamento)", async () => {
    fake.tables["destinos_whatsapp"] = [
      { id: "d1", nome: "Grupo que falha", tipo: "grupo", webhook_url: "https://wh.example.com/fail", ativo: true, resumo_diario: true },
      { id: "d2", nome: "Grupo saudável", tipo: "grupo", webhook_url: "https://wh.example.com/ok", ativo: true, resumo_diario: true },
    ];

    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("fail")) throw new Error("ECONNREFUSED");
      return { ok: true, status: 200 };
    });

    await expect(enviarParaWhatsApp("teste")).resolves.not.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2); // tentou os dois, mesmo o 1º tendo falhado
  });
});

describe("Resumo diário (Fase 3)", () => {
  it("monta o texto com urgentes primeiro e link de cada matéria", () => {
    const texto = montarTextoResumoDiario([
      { id: "1", titulo: "Matéria comum", slug: "materia-comum", editoria: "roraima", urgente: false },
      { id: "2", titulo: "Matéria urgente", slug: "materia-urgente", editoria: "policia", urgente: true },
    ]);

    const posUrgente = texto.indexOf("Matéria urgente");
    const posComum = texto.indexOf("Matéria comum");
    expect(posUrgente).toBeGreaterThanOrEqual(0);
    expect(posUrgente).toBeLessThan(posComum); // urgente aparece primeiro
    expect(texto).toContain("https://radarbv.com.br/noticia/materia-urgente");
  });

  it("não envia nada se não há notícia publicada nas últimas 24h", async () => {
    fake.tables["noticias"] = [];
    fake.tables["destinos_whatsapp"] = [
      { id: "d1", nome: "Grupo A", tipo: "grupo", webhook_url: "https://wh.example.com/a", ativo: true, resumo_diario: true },
    ];

    await executarResumoDiario();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("envia 1x por destino e respeita o dedupe diário (não envia 2x no mesmo dia)", async () => {
    const hoje = new Date().toISOString();
    fake.tables["noticias"] = [
      { id: "n1", titulo: "Notícia de hoje", slug: "noticia-de-hoje", editoria: "boa_vista", urgente: false, status: "publicado", data_publicacao: hoje },
    ];
    fake.tables["destinos_whatsapp"] = [
      { id: "d1", nome: "Grupo A", tipo: "grupo", webhook_url: "https://wh.example.com/a", ativo: true, resumo_diario: true },
    ];
    fake.tables["resumos_diarios_enviados"] = [];

    await executarResumoDiario();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fake.tables["resumos_diarios_enviados"]).toHaveLength(1);

    // segunda chamada no mesmo dia: já tem registro de envio -> não dispara de novo
    await executarResumoDiario();
    expect(fetchMock).toHaveBeenCalledTimes(1); // continua 1, não foi pra 2
  });

  it("isolamento entre destinos: um destino já enviado hoje não bloqueia outro destino novo", async () => {
    const hoje = new Date().toISOString();
    fake.tables["noticias"] = [
      { id: "n1", titulo: "Notícia de hoje", slug: "noticia-de-hoje", editoria: "boa_vista", urgente: false, status: "publicado", data_publicacao: hoje },
    ];
    fake.tables["destinos_whatsapp"] = [
      { id: "d1", nome: "Já enviado", tipo: "grupo", webhook_url: "https://wh.example.com/a", ativo: true, resumo_diario: true },
      { id: "d2", nome: "Novo destino", tipo: "grupo", webhook_url: "https://wh.example.com/b", ativo: true, resumo_diario: true },
    ];
    fake.tables["resumos_diarios_enviados"] = [
      { id: "r1", destino_id: "d1", data_envio: new Date().toISOString().slice(0, 10) },
    ];

    await executarResumoDiario();
    expect(fetchMock).toHaveBeenCalledTimes(1); // só o d2, que ainda não tinha enviado hoje
    expect(fetchMock.mock.calls[0][0]).toBe("https://wh.example.com/b");
  });
});
