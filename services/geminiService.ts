
import { GoogleGenAI, Type } from "@google/genai";
import { Species, SpeciesType } from "../types";

// Schema guided by prompt instructions (No SchemaType, no enum keys directly in Type)
const speciesSchema = {
  type: Type.OBJECT,
  properties: {
    scientificName: { type: Type.STRING, description: "The scientific (Latin) name of the species." },
    conservationStatus: { type: Type.STRING, description: "IUCN conservation status (e.g., Endangered, Vulnerable)." },
    sexualMaturityAgeYears: { type: Type.NUMBER, description: "Average age of sexual maturity (or first flowering for plants) in years." },
    averageAdultWeightKg: { type: Type.NUMBER, description: "Average weight of an adult in Kilograms. Use 0 for plants." },
    lifeExpectancyYears: { type: Type.NUMBER, description: "Average life expectancy in years in captivity. Use 0 for plants." },
    breedingSeasonStart: { type: Type.INTEGER, description: "Start month of breeding/flowering season (1 for Jan, 12 for Dec). Use 0 if year-round." },
    breedingSeasonEnd: { type: Type.INTEGER, description: "End month of breeding/flowering season (1 for Jan, 12 for Dec). Use 0 if year-round." },
    plantClassification: { type: Type.STRING, description: "If a plant, return 'Dioecious' or 'Monoecious'. Otherwise return 'N/A'." },
    nativeStatusCountry: { type: Type.STRING, description: "Return 'Native', 'Introduced', 'Invasive' or 'Unknown' based on the country context." },
    nativeStatusLocal: { type: Type.STRING, description: "Return 'Native', 'Introduced', 'Invasive' or 'Unknown' based on the region context." },
    description: { type: Type.STRING, description: "A brief 1-sentence description of the species." }
  },
  required: ["scientificName", "conservationStatus", "sexualMaturityAgeYears", "nativeStatusCountry", "nativeStatusLocal"],
  propertyOrdering: [
    "scientificName", 
    "conservationStatus", 
    "sexualMaturityAgeYears", 
    "averageAdultWeightKg", 
    "lifeExpectancyYears", 
    "breedingSeasonStart", 
    "breedingSeasonEnd", 
    "plantClassification", 
    "nativeStatusCountry", 
    "nativeStatusLocal", 
    "description"
  ]
};

const getAiClient = (): GoogleGenAI => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

const searchGBIF = async (query: string, type: SpeciesType): Promise<Partial<Species> | null> => {
  try {
    const response = await fetch(`https://api.gbif.org/v1/species/match?name=${encodeURIComponent(query)}&verbose=true`);
    const data = await response.json();
    if (data.matchType !== 'NONE' && data.scientificName) {
      return { scientificName: data.scientificName };
    }
    return null;
  } catch (error) {
    console.warn("GBIF API Error:", error);
    return null;
  }
};

const fetchWikipediaImage = async (query: string): Promise<string | null> => {
  try {
    const response = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`);
    if (response.ok) {
      const data = await response.json();
      if (data.thumbnail?.source) return data.thumbnail.source;
    }
    return null;
  } catch (e) { return null; }
};

export const fetchSpeciesData = async (commonName: string, type: SpeciesType = 'Animal', locationContext: string = ''): Promise<Partial<Species> | null> => {
  let result: Partial<Species> = {};

  const gbifData = await searchGBIF(commonName, type);
  if (gbifData) result = { ...gbifData };

  if (result.scientificName) {
     const wikiImage = await fetchWikipediaImage(result.scientificName);
     if (wikiImage) result.imageUrl = wikiImage;
  }
  
  if (!result.imageUrl) {
     const wikiImage = await fetchWikipediaImage(commonName);
     if (wikiImage) result.imageUrl = wikiImage;
  }

  try {
    const ai = getAiClient();
    const locationPrompt = locationContext 
      ? `The organization tracking this species is located in "${locationContext}".`
      : `No location context provided, set native statuses to 'Unknown'.`;

    const contextPrompt = type === 'Plant' 
      ? `Provide botanical data for the plant "${commonName}". ${locationPrompt}`
      : `Provide biological data for the animal "${commonName}". ${locationPrompt}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `${contextPrompt} ${result.scientificName ? `Use scientific name "${result.scientificName}".` : ''}`,
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
    console.error("AI Error:", error);
    return result.scientificName ? result : null;
  }
};

export const translateDictionary = async (sourceData: Record<string, string>, targetLanguage: string): Promise<Record<string, string>> => {
  try {
    const ai = getAiClient();
    const prompt = `Translate values to ${targetLanguage}. Keep JSON keys intact: ${JSON.stringify(sourceData)}`;
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });
    return response.text ? JSON.parse(response.text) : {};
  } catch (e) { throw e; }
};
