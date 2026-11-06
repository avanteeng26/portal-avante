'use client';
// Checklist de documentos (protótipo) + Storage no bucket privado "documentos".
import { supabase } from './supabase/client';
import { registrarEvento } from './audit';
import type { Documento, SituacaoDoc } from './types';

export const BUCKET = 'documentos';
export const MAX_BYTES = 10 * 1024 * 1024;
export const ACEITOS = /\.(pdf|jpe?g|png)$/i;

export const DOC_GRUPOS: { g: string; itens: [string, string, boolean][] }[] = [
  { g: 'Documentos pessoais', itens: [['rg', 'RG ou CNH', true], ['cpf', 'CPF', true], ['titulo', 'Título de eleitor', true], ['reserv', 'Certificado de reservista (homens de 18 a 45 anos)', false], ['resid', 'Comprovante de residência', true], ['civil', 'Certidão de nascimento ou casamento', true], ['pis', 'Comprovante do PIS/NIS', true], ['ctps', 'CTPS digital (tela com os dados)', true], ['foto', 'Foto 3x4', true], ['escol', 'Comprovante de escolaridade', false], ['bancario', 'Comprovante de conta bancária ou chave PIX', true], ['depcert', 'Certidão de nascimento e CPF dos dependentes', false], ['vacina', 'Cartão de vacinação de filhos até 6 anos (salário-família)', false], ['freq', 'Frequência escolar de filhos de 7 a 14 anos (salário-família)', false]] },
  { g: 'Saúde e segurança', itens: [['aso', 'ASO admissional', true], ['os', 'Ordem de serviço de segurança (NR-01)', true], ['epi', 'Ficha de entrega de EPI assinada', true], ['integ', 'Registro da integração de segurança', true], ['nrcert', 'Certificados de treinamentos NR', false]] },
  { g: 'Documentos da admissão', itens: [['contrato', 'Contrato de trabalho', true], ['fichareg', 'Ficha de registro do empregado', true], ['vt', 'Declaração de opção pelo vale-transporte', true], ['depir', 'Declaração de dependentes para IR', false], ['salfam', 'Termo de responsabilidade do salário-família', false], ['bh', 'Acordo de compensação / banco de horas', true], ['lgpd', 'Ciência sobre tratamento de dados pessoais (LGPD)', true], ['regint', 'Ciência do regulamento interno', true], ['esocial', 'Recibo do eSocial (S-2200)', true]] },
];
export const DOC_ITENS = DOC_GRUPOS.flatMap((g) => g.itens);
export const docNome = (tipo: string) => (DOC_ITENS.find((i) => i[0] === tipo) || [tipo, tipo])[1];
export const DOCS_CAND = DOC_GRUPOS[0].itens;

/** Mapa tipo -> documento mais recente */
export function porTipo(docs: Documento[]) {
  const m: Record<string, Documento> = {};
  docs.slice().sort((a, b) => String(a.enviado_em || '').localeCompare(String(b.enviado_em || ''))).forEach((d) => (m[d.tipo] = d));
  return m;
}

/** Situação efetiva: sem registro = pendente (obrigatório) ou não se aplica (opcional) */
export function situacao(m: Record<string, Documento>, tipo: string, obr: boolean): SituacaoDoc {
  return m[tipo]?.situacao || (obr ? 'pendente' : 'naoaplica');
}

export function docResumo(docs: Documento[], itens = DOC_ITENS) {
  const m = porTipo(docs);
  let tot = 0, ok = 0, obrPend = 0;
  itens.forEach(([id, , obr]) => {
    const st = situacao(m, id, obr);
    if (st === 'naoaplica') return;
    tot++;
    if (st === 'recebido') ok++; else if (obr) obrPend++;
  });
  return { tot, ok, pend: tot - ok, obrPend };
}

export function validaArquivo(f: File): string | null {
  if (f.size > MAX_BYTES) return 'Arquivo maior que 10 MB';
  if (!ACEITOS.test(f.name)) return 'Formato não aceito. Use PDF, JPG ou PNG.';
  return null;
}

/**
 * Envia o arquivo ao bucket e grava/atualiza a linha em public.documentos.
 * Como o Storage não tem política de UPDATE, cada envio vai para um caminho novo e o anterior é removido.
 */
export async function enviarDocumento(o: {
  tipo: string; arquivo: File; usuarioId: string;
  funcionarioId?: string | null; admissaoId?: string | null; existente?: Documento | null;
}) {
  const sb = supabase();
  const pasta = o.funcionarioId ? 'funcionarios/' + o.funcionarioId : 'admissoes/' + o.admissaoId;
  const ext = (o.arquivo.name.match(/\.[a-z0-9]+$/i)?.[0] || '').toLowerCase();
  const path = `${pasta}/${o.tipo}_${Date.now()}${ext}`;
  const up = await sb.storage.from(BUCKET).upload(path, o.arquivo, { contentType: o.arquivo.type || undefined, upsert: false });
  if (up.error) throw new Error('Falha no envio do arquivo: ' + up.error.message);
  const linha = {
    funcionario_id: o.funcionarioId ?? o.existente?.funcionario_id ?? null,
    admissao_id: o.admissaoId ?? o.existente?.admissao_id ?? null,
    tipo: o.tipo, situacao: 'recebido' as SituacaoDoc,
    arquivo_path: path, arquivo_nome: o.arquivo.name, tamanho_bytes: o.arquivo.size,
    enviado_por: o.usuarioId, enviado_em: new Date().toISOString(),
  };
  const res = o.existente
    ? await sb.from('documentos').update(linha).eq('id', o.existente.id).select().single()
    : await sb.from('documentos').insert(linha).select().single();
  if (res.error) {
    await sb.storage.from(BUCKET).remove([path]);
    throw new Error('Falha ao registrar o documento: ' + res.error.message);
  }
  if (o.existente?.arquivo_path && o.existente.arquivo_path !== path) await sb.storage.from(BUCKET).remove([o.existente.arquivo_path]);
  return res.data as Documento;
}

export async function mudarSituacao(o: { tipo: string; situacao: SituacaoDoc; funcionarioId?: string | null; admissaoId?: string | null; existente?: Documento | null }) {
  const sb = supabase();
  const res = o.existente
    ? await sb.from('documentos').update({ situacao: o.situacao }).eq('id', o.existente.id).select().single()
    : await sb.from('documentos').insert({ funcionario_id: o.funcionarioId ?? null, admissao_id: o.admissaoId ?? null, tipo: o.tipo, situacao: o.situacao }).select().single();
  if (res.error) throw new Error(res.error.message);
  return res.data as Documento;
}

export async function removerArquivo(d: Documento) {
  const sb = supabase();
  if (d.arquivo_path) {
    const r = await sb.storage.from(BUCKET).remove([d.arquivo_path]);
    if (r.error) throw new Error(r.error.message);
  }
  const res = await sb.from('documentos').update({ arquivo_path: null, arquivo_nome: null, tamanho_bytes: null, situacao: 'pendente' }).eq('id', d.id).select().single();
  if (res.error) throw new Error(res.error.message);
  return res.data as Documento;
}

/** Abre o arquivo com link temporário e registra a consulta na auditoria */
export async function verDocumento(d: Documento, contexto: string) {
  if (!d.arquivo_path) return;
  const w = window.open('', '_blank');
  const { data, error } = await supabase().storage.from(BUCKET).createSignedUrl(d.arquivo_path, 120);
  if (error || !data) { w?.close(); throw new Error(error?.message || 'Não foi possível abrir o arquivo'); }
  registrarEvento('Consultou documento', contexto + ' · ' + docNome(d.tipo) + ' · ' + (d.arquivo_nome || ''));
  if (w) w.location.href = data.signedUrl; else window.location.href = data.signedUrl;
}

/** Links temporários (7 dias) para mandar à contabilidade */
export async function linksTemporarios(docs: Documento[]) {
  const sb = supabase();
  const out: { nome: string; url: string }[] = [];
  for (const d of docs) {
    if (!d.arquivo_path) continue;
    const { data } = await sb.storage.from(BUCKET).createSignedUrl(d.arquivo_path, 7 * 24 * 3600);
    if (data) out.push({ nome: docNome(d.tipo) + ' (' + (d.arquivo_nome || '') + ')', url: data.signedUrl });
  }
  return out;
}
