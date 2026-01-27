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

const getAiClient = (): GoogleGenAI => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
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
      model: 'gemini-3-flash-preview',
      contents: `Identify the location at coordinates Latitude: ${lat}, Longitude: ${lng}. 
      Return a string in the format: "City, State/Region, Country". 
      Be precise. Return ONLY the location string, no other text.`,
    });
    return response.text?.trim() || "Unknown Location";
  } catch (error) {
    console.error("Reverse Geocode Error:", error);
    return "Unknown Location";
  }
};

export const urlToBase64 = async (url: string): Promise<string | null> => {
  if (!url) return null;
  
  let targetUrl = url.trim();
  console.group(`[MEDIA PROCESSING] URL: ${targetUrl.substring(0, 100)}${targetUrl.length > 100 ? '...' : ''}`);
  
  try {
    // 1. Check for Google Drive links
    if (targetUrl.includes('drive.google.com') || targetUrl.includes('docs.google.com/file/d/')) {
       console.log("Detected Google Drive link. Extracting ID...");
       // This regex handles various GDrive share link formats
       const idMatch = targetUrl.match(/[-\w]{25,}/);
       const id = idMatch ? idMatch[0] : null;
       
       if (id) {
          console.log(`Extracted GDrive ID: ${id}`);
          // Construction of the thumbnail URL is the most reliable way to display GDrive images in a browser without custom proxying
          targetUrl = `https://drive.google.com/thumbnail?id=${id}&sz=w1000`;
          console.log(`Constructed Thumbnail URL: ${targetUrl}`);
          
          // Return early for GDrive to avoid CORS issues with fetch attempts. 
          // Browser will handle the direct <img> request.
          console.groupEnd();
          return targetUrl;
       } else {
          console.warn("Could not extract file ID from GDrive URL.");
       }
    }

    // 2. Fallback for other URLs: try to encode as Base64 for local database persistence
    // If it's already a Data URL, return it
    if (targetUrl.startsWith('data:')) {
       console.log("Input is already a Data URL.");
       console.groupEnd();
       return targetUrl;
    }

    // For standard web images, attempt a fetch to convert to base64
    // This allows the app to work offline once sync is complete
    try {
      console.log("Attempting to fetch and convert to Base64...");
      const response = await fetch(targetUrl);
      if (response.ok) {
        const blob = await response.blob();
        const base64: string = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        console.log("Successfully converted to Base64.");
        console.groupEnd();
        return base64;
      } else {
        console.warn(`Fetch failed with status ${response.status}. Using direct URL.`);
      }
    } catch (fetchErr) {
      console.warn("CORS/Network error during fetch. Using direct URL fallback.");
    }
    
    console.groupEnd();
    return targetUrl;
  } catch (e) {
    console.error("Critical failure processing media URL:", e);
    console.groupEnd();
    return url;
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
    if (!checkAndIncrementAiUsage()) throw new Error("AI usage limit reached.");
    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Provide biological data for "${commonName}" (Type: ${type}). Org location: ${locationContext}. Return ONLY JSON.`,
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

export const translateDictionary = async (sourceData: Record<string, string>, targetLanguage: string): Promise<{k: string, v: string}[]> => {
  try {
    if (!checkAndIncrementAiUsage()) throw new Error("AI usage limit reached.");
    const payload = Object.entries(sourceData).map(([k, v]) => ({ k, v }));
    if (payload.length === 0) return [];
    const ai = getAiClient();
    const prompt = `Translate interface strings into "${targetLanguage}": ${JSON.stringify(payload)}`;
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: { 
        responseMimeType: "application/json",
        responseSchema: translationSchema
      }
    });
    if (response.text) {
      const sanitized = sanitizeJsonResponse(response.text);
      try {
        const parsed = JSON.parse(sanitized) as {k: string, v: string}[];
        return parsed.map(item => ({
          ...item,
          v: typeof item.v === 'string' ? item.v.replace(/\\n/g, ' ').replace(/\n/g, ' ').trim() : item.v
        }));
      } catch (parseErr) {
        console.error("Failed to parse AI translation JSON:", sanitized);
        throw new Error("Invalid response format from translation service.");
      }
    }
    return [];
  } catch (e) { 
    console.error("Dictionary Translation Error:", e);
    throw e; 
  }
};