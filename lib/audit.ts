'use client';
import { supabase } from './supabase/client';

/**
 * Eventos que não são alteração de tabela (login, exportação, impressão, consulta de documento).
 * As alterações de tabela já são registradas pelos gatilhos t_auditoria do banco.
 */
export async function registrarEvento(acao: string, detalhe?: string) {
  try {
    await supabase().rpc('registrar_evento', { p_acao: acao, p_detalhe: detalhe ?? null });
  } catch {
    /* auditoria nunca deve travar a tela */
  }
}
