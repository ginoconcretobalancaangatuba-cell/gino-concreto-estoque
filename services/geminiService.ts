
import { GoogleGenAI, Type } from "@google/genai";

export interface ScaleReportExtraction {
  brita0: number;
  brita1: number;
  areiaMedia: number;
  areiaBrita: number;
  areiaFina: number;
}

function cleanJsonResponse(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```json/i, "").replace(/```$/i, "").trim();
  }
  return cleaned;
}

export async function parseScaleReport(mimeType: string, base64Data: string): Promise<ScaleReportExtraction> {
  // Always use a named parameter for the apiKey when initializing GoogleGenAI.
  // We create a new instance right before making an API call to ensure we use the current API_KEY.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

  try {
    const response = await ai.models.generateContent({
      // For simple text extraction tasks, gemini-3-flash-preview is the recommended model.
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
            text: `Aja como um leitor de tickets de pesagem de concreto.
            Extraia o PESO REAL/LÍQUIDO (Kg) carregado.
            
            MAPEAMENTO:
            - 'brita0': Brita 0, B0, Pedrisco.
            - 'brita1': Brita 1, B1.
            - 'areiaMedia': Areia Média, Rio, Lavada.
            - 'areiaBrita': Areia de Brita, Pó de Pedra, Areia Industrial.
            - 'areiaFina': Areia Fina.

            REGRAS:
            - Se o ticket estiver em Toneladas (ex: 5.40), converta para Kg (5400).
            - Ignore Alvos/Target. Use apenas o REAL CARREGADO.
            - Retorne apenas JSON puro.`,
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        // Setting responseSchema to ensure structured output.
        // We omit thinkingConfig here to prioritize speed and tokens for this simple task.
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

    // The .text property directly returns the generated string.
    const rawText = response.text || '{"brita0":0,"brita1":0,"areiaMedia":0,"areiaBrita":0,"areiaFina":0}';
    return JSON.parse(cleanJsonResponse(rawText)) as ScaleReportExtraction;
  } catch (e: any) {
    console.error("Erro Gemini:", e);
    throw e;
  }
}
