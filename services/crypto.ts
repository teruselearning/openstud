
// A static "pepper" to add slightly more complexity to the client-side hash.
// In a real production system, unique salts per user should be used on the server.
const STATIC_PEPPER = "openstudbook-v1-client-secure-";

export const hashPassword = async (password: string): Promise<string> => {
  const passwordWithPepper = STATIC_PEPPER + password;

  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const msgBuffer = new TextEncoder().encode(passwordWithPepper);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  } else {
    // Fallback for insecure contexts where Web Crypto API is restricted
    // This allows the app to function in dev/demo environments without HTTPS
    console.warn("Secure context required for Web Crypto API. Using insecure fallback hash.");
    let hash = 0;
    if (password.length === 0) return '0'.repeat(64);
    for (let i = 0; i < passwordWithPepper.length; i++) {
      const char = passwordWithPepper.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    // Return a hex representation padding to mimic a hash-like string
    return (hash >>> 0).toString(16).padStart(64, '0');
  }
};
