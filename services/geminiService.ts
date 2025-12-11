

import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Species, SpeciesType } from "../types";
import { getSystemSettings } from "./storage";

// Separate Schemas for stricter typing guidance
const speciesSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    scientificName: { type: Type.STRING, description: "The scientific (Latin) name of the species." },
    conservationStatus: { type: Type.STRING, description: "IUCN conservation status (e.g., Endangered, Vulnerable)." },
    sexualMaturityAgeYears: { type: Type.NUMBER, description: "Average age of sexual maturity (or first flowering for plants) in years." },
    averageAdultWeightKg: { type: Type.NUMBER, description: "Average weight of an adult in Kilograms. Use 0 if not applicable (e.g. plants)." },
    lifeExpectancyYears: { type: Type.NUMBER, description: "Average life expectancy in years in captivity. Use 0 if not applicable (e.g. plants)." },
    breedingSeasonStart: { type: Type.INTEGER, description: "Start month of breeding/flowering season (1 for Jan, 12 for Dec). Use 0 if year-round or unknown." },
    breedingSeasonEnd: { type: Type.INTEGER, description: "End month of breeding/flowering season (1 for Jan, 12 for Dec). Use 0 if year-round or unknown." },
    plantClassification: { type: Type.STRING, description: "If a plant, is it 'Dioecious' or 'Monoecious'? Leave null if animal.", enum: ['Dioecious', 'Monoecious'] },
    nativeStatusCountry: { type: Type.STRING, description: "Is this species native to the country of the provided location? Return 'Native', 'Introduced', 'Invasive' or 'Unknown'.", enum: ['Native', 'Introduced', 'Invasive', 'Unknown'] },
    nativeStatusLocal: { type: Type.STRING, description: "Is this species native to the specific region/state of the provided location? Return 'Native', 'Introduced', 'Invasive' or 'Unknown'.", enum: ['Native', 'Introduced', 'Invasive', 'Unknown'] },
    description: { type: Type.STRING, description: "A brief 1-sentence description of the species." }
  },
  required: ["scientificName", "conservationStatus", "sexualMaturityAgeYears", "nativeStatusCountry", "nativeStatusLocal"]
};

// Helper to get client with correct key
const getAiClient = (): GoogleGenAI | null => {
  const settings = getSystemSettings();
  const apiKey = settings.geminiApiKey || process.env.API_KEY;
  
  if (!apiKey) {
    console.warn("No Gemini API key found in settings or environment.");
    return null;
  }
  
  return new GoogleGenAI({ apiKey });
};

// 1. GBIF API Service (Open Data)
const searchGBIF = async (query: string, type: SpeciesType): Promise<Partial<Species> | null> => {
  try {
    // GBIF Species Match API
    const response = await fetch(`https://api.gbif.org/v1/species/match?name=${encodeURIComponent(query)}&verbose=true`);
    const data = await response.json();

    if (data.matchType !== 'NONE') {
      const kingdom = data.kingdom?.toLowerCase();
      if (type === 'Plant' && kingdom !== 'plantae') {
        console.warn('GBIF: Name found but Kingdom mismatch for Plant');
      }
      return {
        scientificName: data.scientificName,
      };
    }
    return null;
  } catch (error) {
    console.error("GBIF API Error:", error);
    return null;
  }
};

// 2. Wikipedia Image Fetcher
const fetchWikipediaImage = async (query: string): Promise<string | null> => {
  try {
    // First, try standard summary endpoint
    const response = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`);
    if (response.ok) {
      const data = await response.json();
      if (data.thumbnail?.source) return data.thumbnail.source;
      if (data.originalimage?.source) return data.originalimage.source;
    }

    // Fallback: OpenSearch to find proper title if redirects exist
    const searchResp = await fetch(`https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=1&namespace=0&format=json&origin=*`);
    const searchData = await searchResp.json();
    if (searchData[1] && searchData[1].length > 0) {
      const correctTitle = searchData[1][0];
      const summaryResp = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(correctTitle)}`);
      if (summaryResp.ok) {
         const data = await summaryResp.json();
         if (data.thumbnail?.source) return data.thumbnail.source;
         if (data.originalimage?.source) return data.originalimage.source;
      }
    }

    return null;
  } catch (e) {
    console.error("Wiki Image Fetch Error", e);
    return null;
  }
};

export const fetchSpeciesData = async (commonName: string, type: SpeciesType = 'Animal', locationContext: string = ''): Promise<Partial<Species> | null> => {
  let result: Partial<Species> = {};

  // Step 1: Query GBIF for accurate taxonomy
  const gbifData = await searchGBIF(commonName, type);
  if (gbifData) {
    result = { ...gbifData };
  }

  // Step 1.5: Try to get an image from Wikipedia using Scientific Name first, then Common Name
  if (result.scientificName) {
     const wikiImage = await fetchWikipediaImage(result.scientificName);
     if (wikiImage) result.imageUrl = wikiImage;
  }
  
  if (!result.imageUrl) {
     const wikiImage = await fetchWikipediaImage(commonName);
     if (wikiImage) result.imageUrl = wikiImage;
  }

  // Step 2: Use Gemini to fill in biological traits (fallback or enrichment)
  try {
    const ai = getAiClient();
    if (!ai) return result.scientificName ? result : null;

    const locationPrompt = locationContext 
      ? `The organization tracking this species is located in "${locationContext}". 
         Determine if the species is Native, Introduced, or Invasive to this specific country and this specific region/state.`
      : `No location context provided, set nativeStatusCountry and nativeStatusLocal to 'Unknown'.`;

    const contextPrompt = type === 'Plant' 
      ? `Provide botanical data for the plant species known commonly as "${commonName}". 
         For 'sexualMaturityAgeYears', provide the time to first flowering/maturity. 
         For 'averageAdultWeightKg' and 'lifeExpectancyYears', return 0 (not needed).
         For 'breedingSeasonStart' and 'breedingSeasonEnd', provide the start/end months (1-12) of the flowering season.
         For 'plantClassification', determine if it is Dioecious (distinct male/female plants) or Monoecious.
         ${locationPrompt}`
      : `Provide biological data for the animal species known commonly as "${commonName}". 
         Ensure data is accurate for captive breeding contexts.
         For 'breedingSeasonStart' and 'breedingSeasonEnd', provide the start/end months (1-12) of the typical mating season.
         ${locationPrompt}`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `${contextPrompt} ${result.scientificName ? `Use the scientific name "${result.scientificName}" for lookup.` : ''}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: speciesSchema,
      },
    });

    if (response.text) {
      const aiData = JSON.parse(response.text) as Partial<Species>;
      return {
        ...aiData,
        ...result, 
        scientificName: result.scientificName || aiData.scientificName,
        imageUrl: result.imageUrl || undefined
      };
    }
    return result.scientificName ? result : null;
  } catch (error) {
    console.error("Failed to fetch species data from Gemini:", error);
    return result.scientificName ? result : null;
  }
};

export const translateDictionary = async (sourceData: Record<string, string>, targetLanguage: string): Promise<Record<string, string>> => {
  try {
    const ai = getAiClient();
    if (!ai) throw new Error("AI Client not configured");

    const prompt = `Translate the values of the following JSON object into ${targetLanguage}. 
    Do not change the keys. Return only valid JSON.
    Context: This is for a zoo/aquarium management software called OpenStudbook.
    
    JSON to translate:
    ${JSON.stringify(sourceData)}`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    if (response.text) {
      return JSON.parse(response.text);
    }
    return {};
  } catch (e) {
    console.error("Translation failed", e);
    throw e;
  }
};
