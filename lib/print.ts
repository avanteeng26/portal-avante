'use client';
// Impressão e downloads (mesmo mecanismo do protótipo: área #printArea + window.print).

export const DOC_CSS =
  'body{font-family:Arial,Helvetica,sans-serif;font-size:11pt;line-height:1.5;color:#000}h1{font-size:13pt;text-align:center;margin:0 0 18pt}h2{font-size:11pt;margin:14pt 0 4pt}p{margin:0 0 6pt;text-align:justify}.miss{background:#ffe08a}.sig{width:100%;margin:34pt 0 6pt;border-collapse:collapse}.sig td{width:50%;padding:0 18pt;text-align:center;vertical-align:top;font-size:10pt}.sl{border-top:1px solid #000;margin-bottom:4pt}';

const scoped = (css: string) =>
  css.replace(/(^|\})([^{}@]+)\{/g, (_m, a: string, b: string) => a + b.split(',').map((s) => '#printArea ' + s.trim().replace(/^body$/, '')).join(',') + '{');

export function printHTML(html: string) {
  let p = document.getElementById('printArea');
  if (!p) { p = document.createElement('div'); p.id = 'printArea'; document.body.appendChild(p); }
  p.innerHTML = `<style>${scoped(DOC_CSS)}</style>` + html;
  document.body.classList.add('pdoc');
  const fim = () => { document.body.classList.remove('pdoc'); window.removeEventListener('afterprint', fim); };
  window.addEventListener('afterprint', fim);
  setTimeout(() => window.print(), 50);
}

export function downloadWord(nome: string, html: string) {
  const full = `<html><head><meta charset="utf-8"><title>${nome}</title><style>@page{margin:2.5cm 2cm}${DOC_CSS}</style></head><body>${html}</body></html>`;
  baixar(new Blob(['\ufeff' + full], { type: 'application/msword' }), nomeArquivo(nome) + '.doc');
}

export function downloadCSV(nome: string, rows: (string | number | null | undefined)[][]) {
  const t = rows.map((r) => r.map((v) => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(';')).join('\n');
  baixar(new Blob(['\ufeff' + t], { type: 'text/csv' }), nomeArquivo(nome));
}

/** Nome de arquivo sem acentos nem símbolos (alguns navegadores descartam nomes com acento) */
export const nomeArquivo = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\-. ]/g, '').trim().replace(/\s+/g, '_');

function baixar(blob: Blob, nome: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/** Converte a logo para data URL (para Word e impressão independentes de rede). */
let _logo: string | null = null;
export async function logoDataURL(): Promise<string> {
  if (_logo) return _logo;
  try {
    const b = await fetch('/logo.png').then((r) => r.blob());
    _logo = await new Promise<string>((ok) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.readAsDataURL(b); });
  } catch { _logo = '/logo.png'; }
  return _logo;
}
