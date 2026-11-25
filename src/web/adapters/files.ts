import { saveViaHost } from './hostDownloads';
import type { FilePickerAdapter, FileSaverAdapter, PickedFile, ShareAdapter } from '@core/adapters';

export function toPickedFile(file: File): PickedFile {
  return { name: file.name, size: file.size, type: file.type, text: () => file.text() };
}

export const browserFilePicker: FilePickerAdapter = {
  pickFile({ accept }) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept.join(',');
      input.style.display = 'none';
      input.addEventListener('change', () => {
        const file = input.files?.[0];
        resolve(file ? toPickedFile(file) : null);
        input.remove();
      });
      input.addEventListener('cancel', () => { resolve(null); input.remove(); });
      document.body.appendChild(input);
      input.click();
    });
  },
};

export const browserFileSaver: FileSaverAdapter = {
  async saveText(fileName, content, mimeType) {
    if (await saveViaHost(fileName, (mimeType === 'text/csv' ? '\uFEFF' : '') + content)) return;
    // BOM so spreadsheet apps open UTF-8 CSV files correctly.
    const blob = new Blob([mimeType === 'text/csv' ? '﻿' : '', content], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};

export const browserShare: ShareAdapter = {
  async copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API can be blocked; fall back to a hidden textarea.
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
  },
  async email(subject, body) {
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  },
};
