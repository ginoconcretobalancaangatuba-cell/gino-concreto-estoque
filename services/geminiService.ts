
import { GoogleGenAI, Type } from "@google/genai";

export interface ScaleReportExtraction {
  brita0: number;
  brita1: number;
  areiaMedia: number;
  areiaBrita: number;
  areiaFina: number;
}

export async function parseScaleReport(mimeType: string, base64Data: string): Promise<ScaleReportExtraction> {
  if (!process.env.API_KEY) {
    console.error("API_KEY não configurada.");
    throw new Error("Configuração pendente: Chave de API ausente.");
  }

  // Usamos o modelo Pro para maior precisão em extração de dados de documentos/PDFs
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data,
            },
          },
          {
            text: `Aja como um especialista em tickets de pesagem de usinas de concreto (Betonmix, Sany, Command Alkon). 
            Analise este documento e extraia os valores de peso REAL (em KG) para os materiais abaixo.
            
            Procure na coluna que indica o que foi efetivamente carregado (geralmente chamada de 'Real', 'Peso Líquido', 'Qtd', 'Actual').

            Mapeie para estas chaves JSON:
            1. 'brita0': Procure por Brita 0, B0, Pedrisco ou Brita 9.5mm.
            2. 'brita1': Procure por Brita 1, B1 ou Brita 19mm.
            3. 'areiaMedia': Procure por Areia Média, Areia Rio, Areia Lavada ou Areia Natural.
            4. 'areiaBrita': Procure por Areia de Brita, Pó de Pedra, Areia Industrial ou Areia Brit.
            5. 'areiaFina': Procure por Areia Fina ou similar.

            Regras importantes:
            - Se o valor estiver em Toneladas (ex: 2.50), converta para KG (2500).
            - Se o material não existir no ticket, o valor deve ser 0.
            - Ignore Cimento, Água e Aditivos.
            - Responda APENAS o JSON puro.`,
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            brita0: { type: Type.NUMBER, description: "Peso em kg de Brita 0" },
            brita1: { type: Type.NUMBER, description: "Peso em kg de Brita 1" },
            areiaMedia: { type: Type.NUMBER, description: "Peso em kg de Areia Média" },
            areiaBrita: { type: Type.NUMBER, description: "Peso em kg de Areia de Brita" },
            areiaFina: { type: Type.NUMBER, description: "Peso em kg de Areia Fina" },
          },
          required: ["brita0", "brita1", "areiaMedia", "areiaBrita", "areiaFina"],
        },
      },
    });

    const text = response.text || '{"brita0":0,"brita1":0,"areiaMedia":0,"areiaBrita":0,"areiaFina":0}';
    const data = JSON.parse(text) as ScaleReportExtraction;
    
    console.debug("Dados extraídos da balança:", data);
    return data;
  } catch (e) {
    console.error("Falha na leitura da IA:", e);
    return { brita0: 0, brita1: 0, areiaMedia: 0, areiaBrita: 0, areiaFina: 0 };
  }
}
