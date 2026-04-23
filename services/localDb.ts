
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

const setupStores = (event: any) => {
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

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onblocked = () => {
        console.warn('IndexedDB is blocked. Please close other tabs of this app.');
      };
      request.onupgradeneeded = setupStores;
      request.onsuccess = (event: any) => resolve(event.target.result);
      request.onerror = (event: any) => reject(event.target.error);
    } catch (e) {
      reject(e);
    }
  });
};

const deleteDB = (): Promise<void> => {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve(); // resolve even on failure — best effort
      req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
};

const getDB = (): Promise<IDBDatabase> => {
  if (dbPromise) return dbPromise;

  dbPromise = openDB().catch(async (firstErr) => {
    // Chrome/Edge can fail to open IndexedDB immediately after "Clear site data" because
    // the backing-store files are in a half-deleted state.  Deleting the database and
    // retrying gives the browser a chance to recreate clean backing files.
    console.warn('IndexedDB open failed — attempting recovery (delete + reopen):', firstErr);
    await deleteDB();
    return openDB(); // second attempt; let this one propagate if it also fails
  });

  // If both attempts fail, clear dbPromise so callers can retry on the next operation.
  dbPromise.catch(() => { dbPromise = null; });

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
  },

  async clearAll(): Promise<void> {
    const storeNames = Object.values(STORES);
    for (const storeName of storeNames) {
      try {
        const db = await getDB();
        await new Promise<void>((resolve) => {
          const transaction = db.transaction(storeName, 'readwrite');
          transaction.objectStore(storeName).clear();
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => resolve(); // best-effort
        });
      } catch (e) {
        console.warn(`clearAll: could not clear store ${storeName}:`, e);
      }
    }
  }
};
