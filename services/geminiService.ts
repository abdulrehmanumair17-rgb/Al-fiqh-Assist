import { GoogleGenAI, GenerateContentResponse, Modality } from "@google/genai";
import { Message, Source } from "../types";

export const SYSTEM_INSTRUCTION = `You are the "Darul Ifta Multi-Source Assistant". Your core purpose is to provide 100% accurate Islamic Fiqh information sourced EXCLUSIVELY from the provided search results of these sites:
1. Jamia Binoria (banuri.edu.pk)
2. Darul Uloom Karachi (darululoomkarachi.edu.pk)
3. Darul Ifta Deoband (darulifta-deoband.com)
4. Suffah PK (suffahpk.com)
5. Darul Ifta (darulifta.info)

CRITICAL ACCURACY & VERIFICATION PROTOCOLS:
1. PRE-RESPONSE VERIFICATION: Before generating any sentence, verify it against the search grounding. If a fact is not explicitly in the search result from the domains above, EXCLUDE IT.
2. VERIFIED FATWA REQUIREMENT: If the search results do NOT contain a relevant fatwa from the authorized domains, you MUST state: "I cannot find a verified ruling on this specific topic from the approved archives."
3. FATWA ID ACCURACY: Extract and display the correct Fatwa ID/Number. Double-check that the ID belongs to the specific fatwa you are citing. If an ID is missing, say: "Reference Number: Not provided in source."
4. VERBATIM RECORDS: The "OFFICIAL VERBATIM RECORD" must be a bit-for-bit exact copy of the text found in the search result. No paraphrasing in this section.
5. DOMAIN MATCHING: Ensure the Institution Name in your record matches the domain of the source.

OUTPUT FORMAT:
[Scholarly answer in requested language]

OFFICIAL VERBATIM RECORD:
[Institution Name]
Fatwa ID: [ID]
[Exact Verbatim Text]`;

function isQuotaError(error: any): boolean {
  const errorStr = JSON.stringify(error).toLowerCase();
  return (
    errorStr.includes("429") || 
    errorStr.includes("resource_exhausted") || 
    errorStr.includes("quota")
  );
}

function isKeyError(error: any): boolean {
  const errorStr = JSON.stringify(error).toLowerCase();
  return (
    errorStr.includes("401") || 
    errorStr.includes("400") || 
    errorStr.includes("unauthorized") || 
    errorStr.includes("invalid_api_key") || 
    errorStr.includes("api key not found") || 
    errorStr.includes("expired") || 
    errorStr.includes("api_key_invalid")
  );
}

export interface StreamOutput {
  text?: string;
  sources?: Source[];
}

export class GeminiService {
  // Re-initialize for every call to ensure we use the most recent key from process.env.API_KEY
  private getAI() {
    return new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  }

  async *sendMessageStream(
    prompt: string, 
    history: Message[], 
    isThinkingMode: boolean = false
  ): AsyncGenerator<StreamOutput> {
    const ai = this.getAI();
    const modelName = isThinkingMode ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview';
    
    const recentHistory = history.filter(m => m.id !== 'welcome').slice(-4);

    try {
      const searchSites = 'site:banuri.edu.pk OR site:darululoomkarachi.edu.pk OR site:darulifta-deoband.com OR site:suffahpk.com OR site:darulifta.info';
      const enhancedPrompt = `SEARCH_RESTRICTION: ${searchSites} | USER_QUERY: ${prompt}`;
      
      const config: any = {
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: [{ googleSearch: {} }],
      };

      if (isThinkingMode) {
        config.thinkingConfig = { thinkingBudget: 8000 };
      }

      const contents = [
        ...recentHistory.map(msg => ({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }]
        })),
        { role: 'user', parts: [{ text: enhancedPrompt }] }
      ];

      const responseStream = await ai.models.generateContentStream({
        model: modelName,
        contents: contents,
        config: config,
      });

      const seenUris = new Set<string>();

      for await (const chunk of responseStream) {
        const text = chunk.text;
        const groundingMetadata = chunk.candidates?.[0]?.groundingMetadata;
        const sources: Source[] = [];

        if (groundingMetadata?.groundingChunks) {
          for (const gChunk of groundingMetadata.groundingChunks) {
            if (gChunk.web?.uri && !seenUris.has(gChunk.web.uri)) {
              seenUris.add(gChunk.web.uri);
              sources.push({
                title: gChunk.web.title || "Scholarly Archive Link",
                uri: gChunk.web.uri
              });
            }
          }
        }

        if (text || sources.length > 0) {
          yield { text, sources: sources.length > 0 ? sources : undefined };
        }
      }
    } catch (error: any) {
      if (isKeyError(error)) {
        throw new Error("INVALID_KEY");
      }
      if (isQuotaError(error)) {
        throw new Error("QUOTA_EXHAUSTED");
      }
      console.error("Gemini API stream error:", error);
      throw error;
    }
  }

  async generateSpeech(text: string, voiceName: string = 'Kore'): Promise<string> {
    const ai = this.getAI();
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName } },
          },
        },
      });
      return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || "";
    } catch (error) {
      if (isKeyError(error)) throw new Error("INVALID_KEY");
      console.error("TTS error:", error);
      return "";
    }
  }
}

export const geminiService = new GeminiService();

export function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}