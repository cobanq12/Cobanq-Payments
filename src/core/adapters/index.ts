/**
 * Platform adapters — interfaces only. The web app provides browser
 * implementations (src/web/adapters); the mobile app will provide native ones
 * (AsyncStorage/SecureStore, document picker, share sheet, native PDF).
 */
import { createContext, useContext } from 'react';

export interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface PickedFile {
  name: string;
  /** Size in bytes. */
  size: number;
  /** MIME type, may be empty. */
  type: string;
  text(): Promise<string>;
}

export interface FilePickerAdapter {
  /** Opens the platform file picker. Resolves null when cancelled. */
  pickFile(options: { accept: string[] }): Promise<PickedFile | null>;
}

export interface FileSaverAdapter {
  saveText(fileName: string, content: string, mimeType: string): Promise<void>;
}

export interface PdfRow {
  label: string;
  value: string;
}

export interface PdfSection {
  title: string;
  rows: PdfRow[];
}

/** A platform-neutral description of a confirmation document. */
export interface PdfDocument {
  fileName: string;
  title: string;
  subtitle: string;
  headline: { label: string; value: string };
  sections: PdfSection[];
  footer: string[];
}

export interface PdfAdapter {
  save(doc: PdfDocument): Promise<void>;
}

export interface ShareAdapter {
  copyText(text: string): Promise<void>;
  /** Opens the platform mail composer / share sheet. */
  email(subject: string, body: string): Promise<void>;
}

export interface PlatformAdapters {
  storage: StorageAdapter;
  filePicker: FilePickerAdapter;
  fileSaver: FileSaverAdapter;
  pdf: PdfAdapter;
  share: ShareAdapter;
}

const AdaptersContext = createContext<PlatformAdapters | null>(null);

export const AdaptersProvider = AdaptersContext.Provider;

export function useAdapters(): PlatformAdapters {
  const ctx = useContext(AdaptersContext);
  if (!ctx) throw new Error('AdaptersProvider is missing');
  return ctx;
}

/** In-memory storage for tests and server-side use. */
export function createMemoryStorage(): StorageAdapter {
  const map = new Map<string, string>();
  return {
    getItem: async (k) => map.get(k) ?? null,
    setItem: async (k, v) => { map.set(k, v); },
    removeItem: async (k) => { map.delete(k); },
  };
}
