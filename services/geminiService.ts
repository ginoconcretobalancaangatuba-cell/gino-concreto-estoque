
import { GoogleGenAI, Type } from "@google/genai";

export interface ScaleReportExtraction {
  brita0: number;
  brita1: number;
  areiaMedia: number;
  areiaBrita: number;
  areiaFina: number;
}

/**
 * Limpa a string de resposta da IA para garantir que seja um JSON válido
 */
function cleanJsonResponse(text: string): string {
  // Remove blocos de código markdown se existirem
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```json/i, "").replace(/```$/i, "").trim();
  }
  return cleaned;
}

export async function parseScaleReport(mimeType: string, base64Data: string): Promise<ScaleReportExtraction> {
  const apiKey = process.env.API_KEY;
  
  if (!apiKey) {
    console.error("API_KEY não configurada no ambiente.");
    throw new Error("CHAVE_AUSENTE: A chave da API do Google não foi configurada no servidor.");
  }

  // Gemini 3 Flash com Thinking é ideal para extração rápida e precisa de documentos
  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data,
            },
          },
          {
            text: `Você é um leitor especializado em tickets de pesagem de usinas de concreto.
            Sua tarefa é encontrar o PESO LÍQUIDO (Kg) carregado para cada material.

            INSTRUÇÕES TÉCNICAS:
            - Procure por colunas como: 'REAL', 'LÍQUIDO', 'QTD', 'CARREGADO' ou 'ACTUAL'.
            - Se o valor estiver em Toneladas (ex: 2.30), multiplique por 1000 para converter em Kg (ex: 2300).
            - Ignore valores de 'Alvo' ou 'Target'. Queremos apenas o que foi REALMENTE carregado.

            MAPEAMENTO DE MATERIAIS:
            1. 'brita0': Brita 0, B0, Pedrisco ou Brita 9.5mm.
            2. 'brita1': Brita 1, B1 ou Brita 19mm.
            3. 'areiaMedia': Areia Média, Areia Rio, Areia Lavada ou Areia Natural.
            4. 'areiaBrita': Areia de Brita, Pó de Pedra, Areia Industrial ou Areia Brit.
            5. 'areiaFina': Areia Fina.

            REGRAS DE RESPOSTA:
            - Responda estritamente em JSON.
            - Use 0 para materiais não encontrados.
            - Não inclua explicações ou markdown fora do JSON.`,
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 4096 }, // Habilita o raciocínio para melhorar o OCR do PDF
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            brita0: { type: Type.NUMBER },
            brita1: { type: Type.NUMBER },
            areiaMedia: { type: Type.NUMBER },
            areiaBrita: { type: Type.NUMBER },
            areiaFina: { type: Type.NUMBER },
          },
          required: ["brita0", "brita1", "areiaMedia", "areiaBrita", "areiaFina"],
        },
      },
    });

    const rawText = response.text || '{"brita0":0,"brita1":0,"areiaMedia":0,"areiaBrita":0,"areiaFina":0}';
    const cleanedText = cleanJsonResponse(rawText);
    
    return JSON.parse(cleanedText) as ScaleReportExtraction;
  } catch (e: any) {
    console.error("Erro na leitura do PDF pelo Gemini:", e);
    // Repassa o erro para o App tratar
    throw e;
  }
}
