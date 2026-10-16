/** Trigger a browser download for generated content (text, or a binary file such as .xlsx). */
export function downloadFile(filename: string, content: string | ArrayBuffer, type = 'text/plain') {
  // BOM so Excel opens UTF-8 CSV files with diacritics intact
  const bom = type === 'text/csv' ? '﻿' : '';
  const url = URL.createObjectURL(
    new Blob(typeof content === 'string' ? [bom + content] : [content], {
      type: typeof content === 'string' ? `${type};charset=utf-8` : type,
    }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
