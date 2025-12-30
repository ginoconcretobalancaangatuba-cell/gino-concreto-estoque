
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
  // Remove possible markdown code block wrappers
  cleaned = cleaned.replace(/^```json\n?/i, "").replace(/\n?```$/i, "").trim();
  return cleaned;
}

export async function parseScaleReport(mimeType: string, base64Data: string): Promise<ScaleReportExtraction> {
  const apiKey = process.env.API_KEY;
  
  if (!apiKey || apiKey === 'undefined' || apiKey === '') {
    throw new Error("CHAVE_AUSENTE: A chave da API não foi detectada. Por favor, use o botão 'CONFIGURAR ACESSO' para selecionar sua chave do projeto Google Cloud (com faturamento ativo).");
  }

  // Create instance right before use with the current key
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
            text: `Aja como um especialista em tickets de pesagem de concreto.
            Analise a imagem/PDF e extraia os valores de PESO LÍQUIDO (Kg) carregado.
            
            REGRAS:
            1. Busque o peso efetivamente carregado (REAL, LÍQUIDO ou CARREGADO).
            2. Se o ticket estiver em Toneladas (T), multiplique por 1000 para converter para Kg.
            3. Ignore o peso "Alvo" (Target).
            4. Se não encontrar o material, retorne 0.

            MAPEAMENTO JSON:
            - 'brita0': Brita 0, B0, Pedrisco ou similar.
            - 'brita1': Brita 1, B1 ou similar.
            - 'areiaMedia': Areia Média, Rio, Lavada ou Natural.
            - 'areiaBrita': Areia de Brita, Pó de Pedra ou Areia Industrial.
            - 'areiaFina': Areia Fina.

            IMPORTANTE: Retorne APENAS o objeto JSON.`,
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
    const cleanedText = cleanJsonResponse(rawText);
    
    try {
      return JSON.parse(cleanedText) as ScaleReportExtraction;
    } catch (parseError) {
      console.error("JSON inválido retornado pela IA:", cleanedText);
      throw new Error("FORMATO_INVALIDO: Não foi possível processar a resposta da balança.");
    }
  } catch (e: any) {
    console.error("Erro Gemini:", e);
    
    if (e.message?.includes("Requested entity was not found")) {
      throw new Error("CHAVE_INVALIDA: A chave API selecionada não é válida para este modelo. Certifique-se de usar um projeto pago.");
    }
    
    throw e;
  }
}
