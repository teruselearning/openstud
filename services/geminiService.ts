
import { GoogleGenAI, Type } from "@google/genai";
import { Species, SpeciesType } from "../types";
import { checkAndIncrementAiUsage } from "./storage";

// Schema guided by prompt instructions
const speciesSchema = {
  type: Type.OBJECT,
  properties: {
    scientificName: { type: Type.STRING, description: "The scientific (Latin) name of the species." },
    conservationStatus: { type: Type.STRING, description: "IUCN conservation status (e.g., Endangered, Vulnerable)." },
    sexualMaturityAgeYears: { type: Type.NUMBER, description: "Average age of sexual maturity in years." },
    averageAdultWeightKg: { type: Type.NUMBER, description: "Average weight of an adult in Kilograms." },
    lifeExpectancyYears: { type: Type.NUMBER, description: "Average life expectancy in years in captivity." },
    breedingSeasonStart: { type: Type.INTEGER, description: "Start month of breeding season (1-12)." },
    breedingSeasonEnd: { type: Type.INTEGER, description: "End month of breeding season (1-12)." },
    plantClassification: { type: Type.STRING, description: "If plant, 'Dioecious' or 'Monoecious'. Else 'N/A'." },
    nativeStatusCountry: { type: Type.STRING, description: "Status in the organization's country." },
    nativeStatusLocal: { type: Type.STRING, description: "Status in the local region." },
    description: { type: Type.STRING, description: "Brief description." }
  },
  required: ["scientificName", "conservationStatus"],
};

const getAiClient = (): GoogleGenAI => {
  const apiKey = (typeof process !== 'undefined' && process.env?.API_KEY) || '';
  return new GoogleGenAI({ apiKey });
};

/**
 * Strips markdown code blocks (e.g. ```json ... ```) if the model returns them.
 */
const sanitizeJsonResponse = (text: string): string => {
  if (!text) return "";
  let clean = text.replace(/```json/g, "").replace(/```/g, "").trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
     clean = clean.substring(start, end + 1);
  }
  return clean;
};

export const fetchSpeciesData = async (commonName: string, type: SpeciesType = 'Animal', locationContext: string = ''): Promise<Partial<Species> | null> => {
  try {
    const apiKey = (typeof process !== 'undefined' && process.env?.API_KEY) || '';
    if (!apiKey) {
      throw new Error("Gemini API Key is not configured in the host environment. Please check your .env file or hosting provider secrets.");
    }

    // Check Usage Limits
    if (!checkAndIncrementAiUsage()) {
       throw new Error("Organization AI usage limit reached for this month. Please contact an administrator to increase your quota.");
    }

    const ai = getAiClient();
    const locationPrompt = locationContext 
      ? `The organization tracking this species is located in "${locationContext}".`
      : `No location context provided.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Provide biological data for the ${type.toLowerCase()} "${commonName}". ${locationPrompt}. Return as JSON matching the schema.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: speciesSchema,
      },
    });

    if (response.text) {
      const sanitized = sanitizeJsonResponse(response.text);
      return JSON.parse(sanitized) as Partial<Species>;
    }
    return null;
  } catch (error: any) {
    console.error("AI Error:", error);
    throw error;
  }
};

export const translateDictionary = async (sourceData: Record<string, string>, targetLanguage: string): Promise<Record<string, string>> => {
  try {
    // Check Usage Limits
    if (!checkAndIncrementAiUsage()) {
       throw new Error("AI usage limit reached.");
    }

    const ai = getAiClient();
    const prompt = `Translate values to ${targetLanguage}. Keep JSON keys intact: ${JSON.stringify(sourceData)}. Return ONLY the JSON object.`;
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });
    if (response.text) {
      const sanitized = sanitizeJsonResponse(response.text);
      return JSON.parse(sanitized);
    }
    return {};
  } catch (e) { throw e; }
};
