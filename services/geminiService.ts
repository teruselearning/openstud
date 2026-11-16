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
    if (!response.ok) {
      const errBody = await response.json().catch(() => null);
      throw new Error(errBody?.error || `AI proxy request failed (HTTP ${response.status})`);
    }
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
    if (!response.ok) {
      const errBody = await response.json().catch(() => null);
      throw new Error(errBody?.error || `AI translation request failed (HTTP ${response.status})`);
    }
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return handleAiError(e);
  }
};

/** Test an AI provider configuration. */
export const testAiConfig = async (params: {
  provider: string;
  model: string;
  apiKey?: string;
  purpose: 'text' | 'image';
}): Promise<{ success: boolean; result?: string; error?: string }> => {
  try {
    const response = await fetch('/api/ai/test', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(params),
    });
    const data = await response.json();
    return data;
  } catch (e: any) {
    return { success: false, error: e.message };
  }
};

/** Iterate all species missing category/description and enrich them via AI.
 *  Returns the updated species array. Calls onProgress with (completed, total, currentName, failures) after each. */
export const autofillMissingSpeciesData = async (
  species: import('../types').Species[],
  onProgress?: (completed: number, total: number, currentName: string, failures: number) => void,
): Promise<import('../types').Species[]> => {
  console.log('[autofill] autofillMissingSpeciesData called with', species.length, 'species');
  const needsFill = species.filter(s => !s.category || !s.description);
  const total = needsFill.length;
  console.log('[autofill] needsFill count:', total);
  if (total === 0) return species;

  const result = [...species];
  let failures = 0;
  let loggedMissingCategory = false;
  for (let i = 0; i < total; i++) {
    const sp = needsFill[i];
    onProgress?.(i, total, sp.commonName, failures);
    try {
      const lookupName = sp.commonName || sp.scientificName;
      if (!lookupName) {
        console.warn(`[autofill] Species "${sp.id}" has no common name or scientific name — cannot look up data`);
        failures++;
        continue;
      }
      const data = await fetchSpeciesData(lookupName, sp.type);
      if (data) {
        const hasCategory = !!(data as any).category;
        const hasDescription = !!data.description;
        if (!hasCategory || !hasDescription) {
          if (!loggedMissingCategory) {
            console.log('[autofill] First response missing fields. hasCategory:', hasCategory, 'hasDescription:', hasDescription, 'Response:', JSON.stringify(data));
            loggedMissingCategory = true;
          }
        }
        const idx = result.findIndex(s => s.id === sp.id);
        if (idx !== -1) {
          result[idx] = {
            ...result[idx],
            category: (data as any).category || result[idx].category,
            description: data.description || result[idx].description,
            conservationStatus: data.conservationStatus || result[idx].conservationStatus,
          };
        }
      } else {
        console.log('[autofill] fetchSpeciesData returned null for', sp.commonName);
        failures++;
      }
    } catch (e: any) {
      if (String(e.message).startsWith('INTERNAL_LIMIT')) throw e;
      console.warn(`[autofill] AI call failed for "${sp.commonName}":`, e);
      failures++;
    }
    await new Promise(r => setTimeout(r, 300));
  }
  console.log('[autofill] Done. failures:', failures);
  onProgress?.(total, total, 'Done', failures);
  return result;
};
