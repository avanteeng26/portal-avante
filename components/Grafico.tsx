'use client';
import { useEffect, useRef } from 'react';
import { Chart, BarController, BarElement, CategoryScale, LinearScale, Legend, Tooltip, type ChartConfiguration } from 'chart.js';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Legend, Tooltip);

const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
export const paleta = () => ['--c1', '--c2', '--c3', '--c4', '--c5', '--c6', '--muted'].map(css);

export function Grafico({ config }: { config: (pal: string[]) => ChartConfiguration }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    Chart.defaults.color = css('--muted');
    Chart.defaults.borderColor = css('--border');
    Chart.defaults.font.family = 'system-ui, sans-serif';
    Chart.defaults.plugins.legend.labels.boxWidth = 12;
    const cfg = config(paleta());
    cfg.options = { responsive: true, maintainAspectRatio: false, ...(cfg.options || {}) };
    const ch = new Chart(ref.current, cfg);
    return () => ch.destroy();
  }, [config]);
  return <div className="chartbox"><canvas ref={ref} /></div>;
}
