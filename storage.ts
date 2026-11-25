import type { StorageAdapter } from '@core/adapters';

/** localStorage behind the async StorageAdapter interface. Every call is wrapped so private-mode failures never crash the app. */
export const localStorageAdapter: StorageAdapter = {
  async getItem(key) {
    try { return window.localStorage.getItem(key); } catch { return null; }
  },
  async setItem(key, value) {
    try { window.localStorage.setItem(key, value); } catch { /* quota or blocked storage */ }
  },
  async removeItem(key) {
    try { window.localStorage.removeItem(key); } catch { /* ignore */ }
  },
};
