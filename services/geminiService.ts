
import { GoogleGenAI, Type } from "@google/genai";
import { Species, SpeciesType } from "../types";
import { checkAndIncrementAiUsage } from "./storage";

// Schema for species data
const speciesSchema = {
  type: Type.OBJECT,
  properties: {
    scientificName: { type: Type.STRING, description: "The scientific (Latin) name of the species." },
    type: { type: Type.STRING, description: "Whether this is an 'Animal' or a 'Plant'.", enum: ["Animal", "Plant"] },
    conservationStatus: { type: Type.STRING, description: "IUCN conservation status (e.g., Endangered, Vulnerable)." },
    sexualMaturityAgeYears: { type: Type.NUMBER, description: "Average age of sexual maturity in years." },
    averageAdultWeightKg: { type: Type.NUMBER, description: "Average weight of an adult in Kilograms (if Animal)." },
    lifeExpectancyYears: { type: Type.NUMBER, description: "Average life expectancy in years in captivity." },
    breedingSeasonStart: { type: Type.INTEGER, description: "Start month of breeding season or flowering season (1-12)." },
    breedingSeasonEnd: { type: Type.INTEGER, description: "End month of breeding season or flowering season (1-12)." },
    plantClassification: { type: Type.STRING, description: "If plant, 'Dioecious' or 'Monoecious'. Else 'N/A'." },
    nativeStatusCountry: { type: Type.STRING, description: "Is this species Native, Introduced, or Invasive to the organization's country?" },
    nativeStatusLocal: { type: Type.STRING, description: "Is this species Native, Introduced, or Invasive to the specific local city/region/area?" },
    description: { type: Type.STRING, description: "Brief biological description." }
  },
  required: ["scientificName", "conservationStatus", "type"],
};

// Fixed initialization of GoogleGenAI to use process.env.API_KEY directly
const getAiClient = (): GoogleGenAI => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

/**
 * Strips markdown code blocks and trims response
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

/**
 * Reverse Geocode coordinates to a human-readable address
 */
export const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
  try {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Identify the location at coordinates Latitude: ${lat}, Longitude: ${lng}. 
      Return a string in the format: "City, State/Region, Country". 
      Be precise. If it's a remote area, use the nearest known town and region.
      Return ONLY the location string, no other text.`,
    });
    return response.text?.trim() || "Unknown Location";
  } catch (error) {
    console.error("Reverse Geocode Error:", error);
    return "Unknown Location";
  }
};

export const urlToBase64 = async (url: string): Promise<string | null> => {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.error("Base64 conversion failed:", e);
    return null;
  }
};

export const fetchWikimediaImage = async (query: string): Promise<string | null> => {
  try {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(query)}&prop=pageimages&format=json&pithumbsize=1000&origin=*`;
    const response = await fetch(searchUrl);
    const data = await response.json();
    const pages = data?.query?.pages;
    if (!pages) return null;
    const pageId = Object.keys(pages)[0];
    const imageUrl = pages[pageId]?.thumbnail?.source;
    if (imageUrl) return await urlToBase64(imageUrl);
    return null;
  } catch (e) {
    console.error("Wikimedia fetch failed:", e);
    return null;
  }
};

export const fetchSpeciesData = async (commonName: string, type: SpeciesType = 'Animal', locationContext: string = ''): Promise<Partial<Species> | null> => {
  try {
    const apiKey = process.env.API_KEY;
    if (!apiKey) throw new Error("Gemini API Key missing.");
    if (!checkAndIncrementAiUsage()) throw new Error("AI usage limit reached.");

    const ai = getAiClient();
    const locationPrompt = locationContext 
      ? `The organization tracking this species is located in "${locationContext}". Determine if this species is Native, Invasive, or Introduced to that specific country AND that specific local area/region.`
      : `No organization location context provided. Use general native range information.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Provide biological data for "${commonName}". Determine if it is an Animal or a Plant. ${locationPrompt}. Return as JSON matching the schema.`,
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

export const generateSpeciesImage = async (commonName: string, scientificName: string, type: SpeciesType): Promise<string | null> => {
  try {
    if (!checkAndIncrementAiUsage()) throw new Error("AI usage limit reached.");
    const ai = getAiClient();
    const prompt = `Highly detailed scientific illustration of a ${commonName} (${scientificName}), ${type.toLowerCase()} species, isolated on white background, textbook style, 4k.`;
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts: [{ text: prompt }] }
    });
    for (const candidate of response.candidates) {
      for (const part of candidate.content.parts) {
        if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    return null;
  } catch (error) {
    console.error("Image Generation Error:", error);
    throw error;
  }
};

export const translateDictionary = async (sourceData: Record<string, string>, targetLanguage: string): Promise<Record<string, string>> => {
  try {
    if (!checkAndIncrementAiUsage()) throw new Error("AI usage limit reached.");
    const ai = getAiClient();
    const prompt = `Translate values to ${targetLanguage}. Keep JSON keys intact: ${JSON.stringify(sourceData)}. Return ONLY JSON.`;
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
