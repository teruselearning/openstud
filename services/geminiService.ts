import { GoogleGenAI, Type } from "@google/genai";
import { Species, SpeciesType } from "../types";
import { checkAndIncrementAiUsage, generatePattern } from "./storage";

/**
 * OpenStudbook AI Model Configuration
 * ----------------------------------
 * Text/Data: gemini-3-flash-preview (High RPM, Reliable)
 * Images: gemini-2.5-flash-image (High speed)
 */
const TEXT_MODEL = 'gemini-3-flash-preview';
const IMAGE_MODEL = 'gemini-2.5-flash-image';

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

const translationSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      k: { type: Type.STRING, description: "The original translation key." },
      v: { type: Type.STRING, description: "The translated text value for this key." }
    },
    required: ["k", "v"]
  }
};

/**
 * Checks if the user has selected a paid API key for high-quality Pro models.
 */
export const ensureApiKeySelection = async () => {
  if (typeof window.aistudio !== 'undefined') {
    const hasKey = await window.aistudio.hasSelectedApiKey();
    if (!hasKey) {
      await window.aistudio.openSelectKey();
    }
  }
};

const getAiClient = (): GoogleGenAI => {
  const apiKey = process.env.API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    throw new Error("Gemini API Key not configured. Please select an API key via the key selection dialog.");
  }
  return new GoogleGenAI({ apiKey });
};

const handleAiError = async (error: any) => {
  console.error("AI Service Error Detail:", error);
  let message = error.message || "An unknown AI error occurred.";
  
  if (message.includes("503") || message.toLowerCase().includes("overloaded") || message.toLowerCase().includes("unavailable")) {
    throw new Error("The AI model is temporarily overloaded by Google. Please wait about 15 seconds and try again.");
  }

  if (message.includes("Requested entity was not found.")) {
    throw new Error("API Key issue detected. Pro models require an API key from a paid GCP project.");
  }
  
  if (message.toLowerCase().includes("quota") || message.toLowerCase().includes("rate limit")) {
    throw new Error("Gemini API Quota reached. Try using Wikimedia Search or wait a few minutes.");
  }

  throw error;
};

const sanitizeJsonResponse = (text: string): string => {
  if (!text) return "";
  let clean = text.trim();
  if (clean.startsWith("```")) {
    clean = clean.replace(/^```[a-z]*\n/i, "").replace(/\n```$/i, "");
  }
  const firstBrace = clean.indexOf('{');
  const firstBracket = clean.indexOf('[');
  let start = -1;
  let end = -1;
  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    start = firstBrace;
    end = clean.lastIndexOf('}');
  } else if (firstBracket !== -1) {
    start = firstBracket;
    end = clean.lastIndexOf(']');
  }
  if (start !== -1 && end !== -1 && end > start) {
    return clean.substring(start, end + 1);
  }
  return clean;
};

export const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
  try {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: `Identify the location at coordinates Latitude: ${lat}, Longitude: ${lng}. 
      Return a string in the format: "City, State/Region, Country". 
      Be precise. Return ONLY the location string, no other text.`,
    });
    return response.text?.trim() || "Unknown Location";
  } catch (error) {
    return handleAiError(error);
  }
};

export const urlToBase64 = async (url: string): Promise<string | null> => {
  if (!url) return null;
  let targetUrl = url.trim();
  try {
    const isGoogleDrive = /drive\.google\.com|drive\.usercontent\.google\.com/.test(targetUrl);
    if (isGoogleDrive) {
       const idMatch = targetUrl.match(/[-\w]{25,}/);
       const id = idMatch ? idMatch[0] : null;
       if (id) return `https://drive.google.com/thumbnail?id=${id}&sz=w1000`;
    }
    if (targetUrl.startsWith('data:')) return targetUrl;
    const response = await fetch(targetUrl);
    if (response.ok) {
      const blob = await response.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }
    return targetUrl;
  } catch (e) {
    return url;
  }
};

/**
 * Enhanced Wikimedia Search
 * Uses a generator search to handle redirects and fuzzy titles.
 */
export const fetchWikimediaImage = async (query: string): Promise<string | null> => {
  if (!query || query.trim().length < 2) return null;
  try {
    // Use generator=search to find the best match for the query (common or scientific name)
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=1&pithumbsize=1000&origin=*`;
    const response = await fetch(searchUrl);
    const data = await response.json();
    const pages = data?.query?.pages;
    if (!pages) return null;
    
    const pageId = Object.keys(pages)[0];
    const imageUrl = pages[pageId]?.thumbnail?.source;
    if (imageUrl) return await urlToBase64(imageUrl);
    return null;
  } catch (e) {
    console.warn(`Wikimedia search failed for ${query}:`, e);
    return null;
  }
};

export const fetchSpeciesData = async (commonName: string, type: SpeciesType = 'Animal', locationContext: string = ''): Promise<Partial<Species> | null> => {
  try {
    if (!checkAndIncrementAiUsage()) {
      throw new Error("INTERNAL_LIMIT: Organization AI usage limit reached.");
    }
    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: `Provide biological data for "${commonName}" (Kingdom: ${type === 'Animal' ? 'Fauna' : 'Flora'}). Org location: ${locationContext}. Return ONLY JSON.`,
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
    return handleAiError(error);
  }
};

export const generateSpeciesImage = async (commonName: string, scientificName: string, type: SpeciesType): Promise<string | null> => {
  try {
    if (!checkAndIncrementAiUsage()) {
      throw new Error("INTERNAL_LIMIT: Organization AI usage limit reached.");
    }
    
    const ai = getAiClient();
    const prompt = `Highly detailed scientific illustration of a ${commonName} (${scientificName}), ${type.toLowerCase()} species, textbook style, white background, professional biological drawing quality.`;
    const response = await ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: { parts: [{ text: prompt }] }
    });

    if (response.candidates && response.candidates[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    return null;
  } catch (error: any) {
    console.warn("AI Image generation failed. Likely Quota. Falling back to pattern.", error.message);
    // Silent fail to pattern to keep the app usable
    return generatePattern(commonName);
  }
};

export const translateDictionary = async (sourceData: Record<string, string>, targetLanguage: string): Promise<{k: string, v: string}[]> => {
  try {
    if (!checkAndIncrementAiUsage()) {
      throw new Error("INTERNAL_LIMIT: Organization AI usage limit reached.");
    }
    const payload = Object.entries(sourceData).map(([k, v]) => ({ k, v }));
    if (payload.length === 0) return [];
    const ai = getAiClient();
    const prompt = `Translate interface strings into "${targetLanguage}": ${JSON.stringify(payload)}`;
    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: prompt,
      config: { 
        responseMimeType: "application/json",
        responseSchema: translationSchema
      }
    });
    if (response.text) {
      const sanitized = sanitizeJsonResponse(response.text);
      const parsed = JSON.parse(sanitized) as {k: string, v: string}[];
      return parsed.map(item => ({
        ...item,
        v: typeof item.v === 'string' ? item.v.replace(/\\n/g, ' ').replace(/\n/g, ' ').trim() : item.v
      }));
    }
    return [];
  } catch (e) { 
    return handleAiError(e);
  }
};