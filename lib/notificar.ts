'use client';
import { supabase } from './supabase/client';

/** Aviso no portal (sino) para um perfil ou um usuário. */
export async function notificar(o: { perfil?: string | null; usuario?: string | null; titulo: string; texto?: string; link?: string; email?: boolean }) {
  try {
    await supabase().from('notificacoes').insert({
      perfil_id: o.perfil ?? null, usuario_id: o.usuario ?? null, titulo: o.titulo, texto: o.texto ?? null, link: o.link ?? null, enviar_email: !!o.email,
    });
  } catch { /* aviso não pode travar o fluxo */ }
}
