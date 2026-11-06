'use client';
import { supabase } from './supabase/client';
import { MODELOS_PADRAO } from './modelos';
import type { ModeloDocumento } from './types';

/**
 * Modelos cadastrados em public.modelos_documento. Para cada tipo (contrato/ficha) sem nenhum
 * modelo no banco, usa os textos-base do protótipo, para a admissão nunca ficar sem modelo.
 */
export async function carregarModelos(): Promise<ModeloDocumento[]> {
  const { data } = await supabase().from('modelos_documento').select('*').order('nome');
  const db = (data || []) as ModeloDocumento[];
  const faltam = MODELOS_PADRAO.filter((p) => !db.some((m) => m.tipo === p.tipo));
  return [...db, ...faltam];
}
