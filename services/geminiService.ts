
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
  cleaned = cleaned.replace(/^```json\n?/i, "").replace(/\n?```$/i, "").trim();
  return cleaned;
}

export async function parseScaleReport(mimeType: string, base64Data: string): Promise<ScaleReportExtraction> {
  // Conforme diretrizes, instanciamos a cada chamada para garantir que pegamos a chave mais atual do ambiente.
  // Não fazemos validação manual de string aqui para não bloquear o fluxo injetado pela Vercel/AI Studio.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

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
            text: `Aja como um especialista em tickets de pesagem de concreto.
            Analise o ticket e extraia os valores de PESO LÍQUIDO REAL (Kg) carregado.
            
            REGRAS CRÍTICAS:
            1. Procure por campos: 'REAL', 'LIQ', 'CARREGADO' ou 'PESO'.
            2. Ignore colunas de 'ALVO' ou 'PROGRAMADO'.
            3. Se o valor estiver em Toneladas (ex: 4.25), multiplique por 1000 para converter para Kg (4250).
            4. Se não encontrar o material no ticket, use o valor 0.

            MAPEAMENTO:
            - 'brita0': Brita 0, B0, Pedrisco, B.9,5mm.
            - 'brita1': Brita 1, B1, B.19mm.
            - 'areiaMedia': Areia Média, Areia Rio, Areia Natural.
            - 'areiaBrita': Areia de Brita, Pó de Pedra, Areia Industrial.
            - 'areiaFina': Areia Fina.

            Retorne estritamente um JSON.`,
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 4096 },
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
    return JSON.parse(cleanJsonResponse(rawText)) as ScaleReportExtraction;
  } catch (e: any) {
    console.error("Erro interno no Gemini:", e);
    // Se o erro for de entidade não encontrada, provavelmente é a chave inválida ou projeto sem faturamento.
    if (e.message?.includes("Requested entity was not found")) {
      throw new Error("ERRO_CHAVE: A chave selecionada não possui acesso a este modelo ou o faturamento não está ativo no Google Cloud.");
    }
    throw e;
  }
}
