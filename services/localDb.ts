
/**
 * OpenStudbook High-Capacity Local Database
 * Uses IndexedDB to store large records (images, DNA, histories, translations) 
 * that exceed the 5MB localStorage limit.
 */

const DB_NAME = 'OpenStudbookDB';
const DB_VERSION = 3; 
const STORES = {
  INDIVIDUALS: 'individuals',
  SPECIES: 'species',
  LANGUAGES: 'languages',
  ENCLOSURES: 'enclosures'
};

let dbPromise: Promise<IDBDatabase> | null = null;

const getDB = (): Promise<IDBDatabase> => {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      // Handle version collisions/multiple tabs
      request.onblocked = () => {
        console.warn('IndexedDB is blocked. Please close other tabs of this app.');
        // Resolve with a mock or let it time out to avoid complete hang
      };

      request.onupgradeneeded = (event: any) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORES.INDIVIDUALS)) {
          db.createObjectStore(STORES.INDIVIDUALS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORES.SPECIES)) {
          db.createObjectStore(STORES.SPECIES, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORES.LANGUAGES)) {
          db.createObjectStore(STORES.LANGUAGES, { keyPath: 'code' });
        }
        if (!db.objectStoreNames.contains(STORES.ENCLOSURES)) {
          db.createObjectStore(STORES.ENCLOSURES, { keyPath: 'id' });
        }
      };

      request.onsuccess = (event: any) => resolve(event.target.result);
      request.onerror = (event: any) => {
        console.error('IndexedDB error:', event.target.error);
        reject(event.target.error);
      };
    } catch (e) {
      reject(e);
    }
  });

  return dbPromise;
};

export const localDb = {
  async getAll<T>(storeName: string): Promise<T[]> {
    try {
      const db = await getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.warn(`LocalDB fallback: could not get all from ${storeName}`);
      return [];
    }
  },

  async saveAll<T extends { id?: string; code?: string }>(storeName: string, items: T[]): Promise<void> {
    try {
      const db = await getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        
        store.clear();
        items.forEach(item => {
          try { store.put(item); } catch (e) { console.error('Error putting item into store:', e); }
        });

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    } catch (e) {
      console.error(`LocalDB save failed for ${storeName}:`, e);
    }
  }
};
