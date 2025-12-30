
import { GoogleGenAI, Type } from "@google/genai";

export interface ScaleReportExtraction {
  brita0: number;
  brita1: number;
  areiaMedia: number;
  areiaBrita: number;
  areiaFina: number;
}

export async function parseScaleReport(mimeType: string, base64Data: string): Promise<ScaleReportExtraction> {
  // Inicializamos a API apenas no momento da chamada para garantir que process.env.API_KEY esteja disponível
  // e não travar o carregamento inicial do app.
  if (!process.env.API_KEY) {
    console.error("API_KEY não configurada no ambiente.");
    throw new Error("Erro de configuração: Chave de API ausente.");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

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

    const text = response.text || '{"brita0":0,"brita1":0,"areiaMedia":0,"areiaBrita":0,"areiaFina":0}';
    return JSON.parse(text) as ScaleReportExtraction;
  } catch (e) {
    console.error("Erro na extração Gemini:", e);
    return { brita0: 0, brita1: 0, areiaMedia: 0, areiaBrita: 0, areiaFina: 0 };
  }
}
