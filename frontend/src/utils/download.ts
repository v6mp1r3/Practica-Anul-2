/** Trigger a browser download for generated text content. */
export function downloadFile(filename: string, content: string, type = 'text/plain') {
  // BOM so Excel opens UTF-8 CSV files with diacritics intact
  const bom = type === 'text/csv' ? '﻿' : '';
  const url = URL.createObjectURL(new Blob([bom + content], { type: `${type};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
