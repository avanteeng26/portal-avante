'use client';
import { supabase } from './supabase/client';
import { addD, dk, hoje } from './format';
import { deBanco, type LinhaPonto } from './ponto';
import type { Funcionario, Ponto, Remuneracao } from './types';

/** Supabase devolve no máximo 1000 linhas por consulta: pagina até o fim. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function todas<T>(q: (de: number, ate: number) => PromiseLike<{ data: any[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await q(de, de + 999);
    if (error) throw new Error(error.message);
    out.push(...((data || []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function carregarFuncionarios() {
  return todas<Funcionario>((a, b) => supabase().from('funcionarios').select('*').order('nome').range(a, b));
}

/** Remuneração só volta para quem tem o módulo "salarios" (RLS). Sem permissão = mapa vazio. */
export async function carregarRemuneracoes(): Promise<Record<string, Remuneracao>> {
  try {
    const L = await todas<Remuneracao>((a, b) => supabase().from('funcionarios_remuneracao').select('*').range(a, b));
    return Object.fromEntries(L.map((r) => [r.funcionario_id, r]));
  } catch { return {}; }
}

/** Pontos de um intervalo: funcionario_id -> data -> linha */
export async function carregarPontos(ini: Date, fim: Date, funcionarioId?: string) {
  const L = await todas<Ponto>((a, b) => {
    let q = supabase().from('ponto').select('*').gte('data', dk(ini)).lte('data', dk(fim));
    if (funcionarioId) q = q.eq('funcionario_id', funcionarioId);
    return q.order('data').range(a, b);
  });
  const m: Record<string, Record<string, LinhaPonto>> = {};
  L.forEach((p) => { (m[p.funcionario_id] = m[p.funcionario_id] || {})[p.data] = deBanco(p); });
  return { mapa: m, linhas: L };
}

/** Última obra em que cada funcionário trabalhou (últimos 31 dias) */
export async function ultimasObras(): Promise<Record<string, string>> {
  const t = hoje();
  const L = await todas<Pick<Ponto, 'funcionario_id' | 'obra_id' | 'data'>>((a, b) =>
    supabase().from('ponto').select('funcionario_id, obra_id, data').eq('ocorrencia', 'TRABALHADO').gte('data', dk(addD(t, -31))).lt('data', dk(t)).order('data', { ascending: false }).range(a, b));
  const m: Record<string, string> = {};
  L.forEach((p) => { if (p.obra_id && !m[p.funcionario_id]) m[p.funcionario_id] = p.obra_id; });
  return m;
}

export function proximaMatricula(funcs: Pick<Funcionario, 'matricula'>[]) {
  const n = funcs.map((f) => parseInt(f.matricula, 10)).filter((x) => !isNaN(x));
  return String((n.length ? Math.max(...n) : 100) + 1);
}

export function erroAmigavel(msg: string) {
  if (/row-level security|permission denied|violates row-level/i.test(msg)) return 'Seu perfil não tem permissão para gravar isso (regra de segurança do banco).';
  // UPDATE/DELETE barrado pelo RLS não dá erro: volta 0 linhas e o .single() reclama
  if (/coerce the result to a single JSON object|JSON object requested|0 rows/i.test(msg)) return 'Seu perfil não tem permissão para alterar este registro (regra de segurança do banco).';
  if (/competência .* está fechada/i.test(msg)) return msg;
  if (/duplicate key|unique/i.test(msg)) return 'Já existe um registro com esses dados (valor duplicado).';
  return msg;
}
