import { config } from "../config.js";
import { log } from "../logger.js";
import { promptTriagemGemini } from "./prompts.js";
import type { ItemBruto, ResumoGemini } from "../types.js";

function extrairJson<T>(texto: string): T {
  const limpo = texto.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(limpo) as T;
  } catch {
    const match = limpo.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`Resposta vazia ou sem JSON reconhecível: "${limpo.slice(0, 200)}"`);
    return JSON.parse(match[0]) as T;
  }
}

/**
 * Triagem via IA PRÓPRIA/LOCAL (Ollama), rodando no próprio computador —
 * item novo da Regra de Ouro: o "serviço pesado" da triagem (que é a etapa
 * que mais volume de chamadas faz, uma por notícia candidata) passa a ser
 * feito por um modelo local, sem cota diária e sem custo nenhum, aliviando
 * o consumo das APIs de nuvem (Gemini/Groq) que têm teto gratuito baixo.
 *
 * Totalmente opcional e seguro: se o Ollama não estiver instalado ou não
 * estiver rodando nesse computador, essa função devolve null rapidinho (sem
 * travar nada) e o pipeline cai sozinho pra cascata de nuvem já existente
 * (Gemini -> Claude -> Groq) — exatamente como já acontecia antes desse
 * recurso existir. Pra ativar: instalar o Ollama (ollama.com) e rodar
 * "ollama pull <modelo>" uma vez — nenhuma outra configuração é necessária.
 */
export async function triarComOllama(item: ItemBruto): Promise<ResumoGemini | null> {
  try {
    const prompt = promptTriagemGemini({
      tituloOriginal: item.tituloOriginal,
      conteudoBruto: item.conteudoBruto,
      editoriaPadrao: item.editoriaPadrao,
    });

    const resposta = await fetch(`${config.ia.ollamaUrl}/api/generate`, {
      method: "POST",
      signal: AbortSignal.timeout(45_000), // inferência local em CPU pode ser mais lenta que a nuvem
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.ia.ollamaModel,
        prompt,
        format: "json",
        stream: false,
        options: { temperature: 0.2 },
      }),
    });

    if (!resposta.ok) {
      // Ollama rodando mas sem o modelo baixado, por exemplo — isso sim é
      // um problema real de configuração local, vale logar como aviso.
      const corpo = await resposta.text().catch(() => "");
      await log("warning", "ollama", "IA local respondeu com erro HTTP (modelo não baixado?)", {
        status: resposta.status,
        corpo: corpo.slice(0, 300),
        modelo: config.ia.ollamaModel,
      });
      return null;
    }

    const dados = (await resposta.json()) as { response?: string };
    const texto = dados.response ?? "";
    if (!texto.trim()) return null;

    const json = extrairJson<ResumoGemini>(texto);
    if (!json.topicos || json.topicos.length === 0) return null;
    return json;
  } catch (err: any) {
    // ECONNREFUSED / timeout = Ollama não está instalado ou não está rodando
    // nesse computador agora. Isso é esperado enquanto o usuário não tiver
    // configurado a IA local ainda — não é erro do sistema, por isso fica
    // em "info", bem discreto, e nunca bloqueia a cascata.
    const motivo = String(err?.cause?.code ?? err?.message ?? err);
    await log("info", "ollama", "IA local indisponível neste ciclo (seguindo pra cascata de nuvem)", { motivo });
    return null;
  }
}
