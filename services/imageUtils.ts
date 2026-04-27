/**
 * Compress an image File to a JPEG data URL.
 * @param file     Source file
 * @param maxWidth Maximum pixel width (height scales proportionally)
 * @param quality  JPEG quality 0–1
 */
export const compressImageFile = (file: File, maxWidth: number, quality: number): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let { width, height } = img;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });

/**
 * Compress an image File into two sizes:
 *  - imageUrl:     max 1200px wide, 80% quality  (full-res for detail view)
 *  - thumbnailUrl: max 320px  wide, 72% quality  (fast-loading for cards / list / map)
 */
export const compressImageFileDual = async (
  file: File
): Promise<{ imageUrl: string; thumbnailUrl: string }> => {
  const [imageUrl, thumbnailUrl] = await Promise.all([
    compressImageFile(file, 1200, 0.8),
    compressImageFile(file, 320, 0.72),
  ]);
  return { imageUrl, thumbnailUrl };
};

/**
 * Compress an already-fetched base64 / data-URL string (e.g. from CSV import proxy).
 */
export const compressDataUrl = (
  dataUrl: string,
  maxWidth: number,
  quality: number
): Promise<string> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = reject;
    img.onload = () => {
      let { width, height } = img;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.src = dataUrl;
  });

export const compressDataUrlDual = async (
  dataUrl: string
): Promise<{ imageUrl: string; thumbnailUrl: string }> => {
  const [imageUrl, thumbnailUrl] = await Promise.all([
    compressDataUrl(dataUrl, 1200, 0.8),
    compressDataUrl(dataUrl, 320, 0.72),
  ]);
  return { imageUrl, thumbnailUrl };
};

/** Legacy pass-through kept for any existing callers */
export const compressImage = async (base64Str: string): Promise<string> =>
  Promise.resolve(base64Str);
