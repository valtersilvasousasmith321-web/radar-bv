import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/logger.js", () => ({ log: vi.fn().mockResolvedValue(undefined) }));

const triarComGemini = vi.fn();
const redigirComGeminiFallback = vi.fn();
const redigirComClaude = vi.fn();
const redigirComGroqFallback = vi.fn();

vi.mock("../src/ai/gemini.js", () => ({ triarComGemini, redigirComGeminiFallback }));
vi.mock("../src/ai/claude.js", () => ({ redigirComClaude }));
vi.mock("../src/ai/groq.js", () => ({ redigirComGroqFallback }));

const { processarItem } = await import("../src/ai/pipeline.js");

const itemBase = {
  fonteId: "fonte-1",
  fonteNome: "Prefeitura de Boa Vista",
  url: "https://exemplo.gov.br/noticia",
  tituloOriginal: "Título bruto",
  conteudoBruto: "<html>...</html>",
  editoriaPadrao: "boa_vista" as const,
};

const resumoOk = {
  assuntoJaCoberto: false,
  topicos: ["Fato 1", "Fato 2", "Fato 3"],
  palavraChaveImagem: "prefeitura",
  editoriaSugerida: "boa_vista" as const,
};

const materiaOk = {
  titulo: "Prefeitura anuncia obra",
  subtitulo: "Obra vai durar 3 meses",
  conteudo: "Parágrafo 1.\n\nParágrafo 2.",
  editoria: "boa_vista" as const,
  tags: ["prefeitura", "obra"],
  urgente: false,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Pipeline Gemini -> Claude com Fallback automático", () => {
  it("usa o Claude normalmente quando ele responde bem (caminho feliz)", async () => {
    triarComGemini.mockResolvedValue(resumoOk);
    redigirComClaude.mockResolvedValue(materiaOk);

    const resultado = await processarItem(itemBase);

    expect(resultado?.origemIA).toBe("claude");
    expect(resultado?.materia.titulo).toBe("Prefeitura anuncia obra");
    expect(redigirComGeminiFallback).not.toHaveBeenCalled();
    expect(redigirComGroqFallback).not.toHaveBeenCalled();
  });

  it("cai para o Gemini quando o Claude estoura cota/falha (try/catch)", async () => {
    triarComGemini.mockResolvedValue(resumoOk);
    redigirComClaude.mockRejectedValue(new Error("429 rate_limit_exceeded"));
    redigirComGeminiFallback.mockResolvedValue(materiaOk);

    const resultado = await processarItem(itemBase);

    expect(resultado?.origemIA).toBe("gemini");
    expect(resultado?.materia.titulo).toBe("Prefeitura anuncia obra");
    expect(redigirComGroqFallback).not.toHaveBeenCalled();
  });

  it("cai para o Groq (último fallback) quando Claude E Gemini falham", async () => {
    triarComGemini.mockResolvedValue(resumoOk);
    redigirComClaude.mockRejectedValue(new Error("fora do ar"));
    redigirComGeminiFallback.mockResolvedValue(null); // insuficiente
    redigirComGroqFallback.mockResolvedValue(materiaOk);

    const resultado = await processarItem(itemBase);

    expect(resultado?.origemIA).toBe("groq");
    expect(resultado?.materia.titulo).toBe("Prefeitura anuncia obra");
  });

  it("o jornal não quebra: se as 3 IAs falharem, descarta o item sem lançar exceção", async () => {
    triarComGemini.mockResolvedValue(resumoOk);
    redigirComClaude.mockRejectedValue(new Error("fora do ar"));
    redigirComGeminiFallback.mockResolvedValue(null);
    redigirComGroqFallback.mockResolvedValue(null);

    const resultado = await processarItem(itemBase);
    expect(resultado).toBeNull();
  });

  it("descarta sem gastar Claude quando o Gemini já diz que o assunto foi coberto nas últimas 24h", async () => {
    triarComGemini.mockResolvedValue({ ...resumoOk, assuntoJaCoberto: true });

    const resultado = await processarItem(itemBase);

    expect(resultado).toBeNull();
    expect(redigirComClaude).not.toHaveBeenCalled();
  });

  it("descarta sujeira de página (Gemini sem tópicos) sem chamar o Claude", async () => {
    triarComGemini.mockResolvedValue(null);

    const resultado = await processarItem(itemBase);

    expect(resultado).toBeNull();
    expect(redigirComClaude).not.toHaveBeenCalled();
  });
});
