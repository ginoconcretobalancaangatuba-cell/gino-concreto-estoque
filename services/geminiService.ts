
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export interface ScaleReportExtraction {
  brita0: number;
  brita1: number;
  areiaMedia: number;
  areiaBrita: number;
  areiaFina: number;
}

export async function parseScaleReport(mimeType: string, base64Data: string): Promise<ScaleReportExtraction> {
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
          text: `Você é um especialista em leitura de relatórios de balança de usinas de concreto.
          Extraia os valores da coluna 'Real (Kg)' ou 'Peso Líquido' para os seguintes materiais deste relatório. 
          
          Mapeamento necessário:
          - 'BRITA 0' ou similar -> 'brita0'
          - 'BRITA 1' ou similar -> 'brita1'
          - 'AREIA MEDIA' ou 'AREIA MEDI' -> 'areiaMedia'
          - 'AREIA BRITA' ou 'AREIA BRIT' -> 'areiaBrita'
          - 'AREIA FINA' -> 'areiaFina'

          Regras:
          1. Ignore outros materiais como AGUA, ADITIVO ou SILO.
          2. Retorne um objeto JSON puro com as chaves: 'brita0', 'brita1', 'areiaMedia', 'areiaBrita', 'areiaFina'.
          3. Use 0 para materiais não encontrados no relatório.
          4. Certifique-se de que os números sejam float (ex: 2000.50).`,
        },
      ],
    },
    config: {
      responseMimeType: "application/json",
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

  const text = response.text || '{}';
  return JSON.parse(text) as ScaleReportExtraction;
}
