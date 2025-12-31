/**
 * OpenStudbook Image Utility
 * Now a pass-through to preserve original quality since we are using IndexedDB.
 */
export const compressImage = async (base64Str: string): Promise<string> => {
  return Promise.resolve(base64Str);
};