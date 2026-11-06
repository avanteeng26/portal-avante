'use client';
import type { ReactNode } from 'react';
import { Modal } from './ui';
import { nomeCampo } from '@/lib/modelos';

/** Pré-visualização de documento gerado, com campos faltantes destacados. */
export function DocPreview({ titulo, html, falt = [], acoes, onClose }: { titulo: string; html: string; falt?: string[]; acoes?: ReactNode; onClose: () => void }) {
  return (
    <Modal wide onClose={onClose}>
      <h2>{titulo}</h2>
      {falt.length > 0 && (
        <div className="note">
          <b>{falt.length} campo(s) sem informação</b>, destacados em amarelo: {falt.map(nomeCampo).join(', ')}. Complete os dados
          {falt.some((k) => k.startsWith('empresa_')) ? ' (os da empresa ficam em Administração › Modelos de documentos)' : ''} e gere de novo, ou preencha direto no Word.
        </div>
      )}
      <div className="docprev" dangerouslySetInnerHTML={{ __html: html }} />
      <div className="modal-actions">{acoes}<button className="btn" onClick={onClose}>Fechar</button></div>
    </Modal>
  );
}
