import { Species, SpeciesType } from "../types";
import { checkAndIncrementAiUsage, generatePattern } from "./storage";

/**
 * OpenStudbook AI Proxy Interface
 * ------------------------------
 * All AI logic is now handled by the backend to secure the API key.
 */

const getAuthHeaders = () => {
  const token = localStorage.getItem('os_token');
  return {
    'Content-Type': 'application/json',
    'Authorization': token ? `Bearer ${token.replace(/"/g, '')}` : ''
  };
};

export const ensureApiKeySelection = async () => {
  // Key selection is now handled on the server deployment,
  // so we just check if the session is active.
};

const handleAiError = async (error: any) => {
  console.error("AI Service Error Detail:", error);
  let message = error.message || "An unknown AI error occurred.";
  throw new Error(message);
};

export const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
  try {
    const response = await fetch('/api/ai/reverse-geocode', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ lat, lng })
    });
    const data = await response.json();
    return data.location || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  } catch (error) {
    console.warn("Proxy geocode failed, returning coordinates.");
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
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

export const fetchWikimediaImage = async (query: string): Promise<string | null> => {
  if (!query || query.trim().length < 2) return null;
  try {
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
      throw new Error("INTERNAL_LIMIT: AI usage limit reached.");
    }
    const response = await fetch('/api/ai/species-data', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ commonName, type, locationContext })
    });
    if (!response.ok) throw new Error("AI Proxy Request Failed");
    return await response.json();
  } catch (error: any) {
    return handleAiError(error);
  }
};

export const generateSpeciesImage = async (commonName: string, scientificName: string, type: SpeciesType): Promise<string | null> => {
  try {
    if (!checkAndIncrementAiUsage()) {
      throw new Error("INTERNAL_LIMIT: AI usage limit reached.");
    }
    const prompt = `A clean, centered professional scientific illustration of a ${commonName} (Species scientific name: ${scientificName}) on a solid white background. High resolution, detailed biology textbook botanical or zoological illustration style. No text.`;

    const response = await fetch('/api/ai/generate-image', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ prompt })
    });
    if (!response.ok) throw new Error("AI Image Proxy Request Failed");
    const data = await response.json();
    return data.imageUrl || null;
  } catch (error: any) {
    console.error("AI Image generation failed:", error.message);
    return generatePattern(commonName);
  }
};

export const translateDictionary = async (sourceData: Record<string, string>, targetLanguage: string): Promise<{k: string, v: string}[]> => {
  try {
    if (!checkAndIncrementAiUsage()) {
      throw new Error("INTERNAL_LIMIT: AI usage limit reached.");
    }
    const response = await fetch('/api/ai/translate', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ sourceData, targetLanguage })
    });
    if (!response.ok) throw new Error("AI Translation Proxy Request Failed");
    return await response.json();
  } catch (e) {
    return handleAiError(e);
  }
};
