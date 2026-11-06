'use client';
import { useState } from 'react';
import { useSessao } from './Sessao';
import { Modal, Pill, toast } from './ui';
import { enviarDocumento, mudarSituacao, porTipo, removerArquivo, situacao, validaArquivo, verDocumento } from '@/lib/docs';
import { erroAmigavel } from '@/lib/dados';
import { fD, N } from '@/lib/format';
import type { Documento, SituacaoDoc } from '@/lib/types';

const OPC: [SituacaoDoc, string][] = [['pendente', 'Pendente'], ['recebido', 'Recebido'], ['naoaplica', 'Não se aplica']];

/** Tabela de documentos com situação, anexo (bucket privado), ver e remover. */
export function DocChecklist(p: {
  titulo?: string; itens: [string, string, boolean][]; docs: Documento[];
  funcionarioId?: string | null; admissaoId?: string | null; contexto: string;
  podeEditar: boolean; podeIncluir: boolean; podeExcluir: boolean;
  onChange: (d: Documento) => void; semTabelaCard?: boolean;
}) {
  const S = useSessao();
  const m = porTipo(p.docs);
  const [busy, setBusy] = useState<string>('');
  const [confirma, setConfirma] = useState<Documento | null>(null);

  async function anexar(tipo: string, f: File | undefined) {
    if (!f) return;
    const v = validaArquivo(f); if (v) return toast(v);
    setBusy(tipo);
    try {
      const d = await enviarDocumento({ tipo, arquivo: f, usuarioId: S.usuario.id, funcionarioId: p.funcionarioId, admissaoId: p.admissaoId, existente: m[tipo] });
      p.onChange(d); toast('Documento anexado');
    } catch (e) { toast(erroAmigavel(String((e as Error).message))); }
    setBusy('');
  }
  async function mudar(tipo: string, st: SituacaoDoc) {
    try { p.onChange(await mudarSituacao({ tipo, situacao: st, funcionarioId: p.funcionarioId, admissaoId: p.admissaoId, existente: m[tipo] })); }
    catch (e) { toast(erroAmigavel(String((e as Error).message))); }
  }
  async function remover(d: Documento) {
    setConfirma(null);
    try { p.onChange(await removerArquivo(d)); toast('Arquivo removido'); } catch (e) { toast(erroAmigavel(String((e as Error).message))); }
  }

  const tabela = (
    <table>
      <thead><tr><th>Documento</th><th>Situação</th><th>Arquivo</th><th></th></tr></thead>
      <tbody>
        {p.itens.map(([id, nome, obr]) => {
          const d = m[id];
          const st = situacao(m, id, obr);
          return (
            <tr key={id}>
              <td>{nome} {obr ? <span className="tag">obrigatório</span> : <span className="tag">se aplicável</span>}</td>
              <td>
                <select style={{ width: 'auto' }} value={st} disabled={!p.podeEditar} onChange={(e) => mudar(id, e.target.value as SituacaoDoc)}>
                  {OPC.map((o) => <option key={o[0]} value={o[0]}>{o[1]}</option>)}
                </select>
              </td>
              <td className="small">
                {d?.arquivo_path ? <><b>{d.arquivo_nome}</b><br /><span className="muted">{N((d.tamanho_bytes || 0) / 1024)} KB · {fD(d.enviado_em)}</span></>
                  : st === 'pendente' ? <Pill t="Aguardando" c="warn" /> : <span className="muted">—</span>}
              </td>
              <td style={{ whiteSpace: 'nowrap' }}>
                {p.podeIncluir && (
                  <label className="btn sm" style={{ margin: 0, display: 'inline-flex', color: 'var(--text)', fontSize: 13 }}>
                    {busy === id ? 'Enviando…' : d?.arquivo_path ? 'Substituir' : 'Anexar'}
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} disabled={!!busy} onChange={(e) => { anexar(id, e.target.files?.[0]); e.target.value = ''; }} />
                  </label>
                )}{' '}
                {d?.arquivo_path && <button className="btn sm" onClick={() => verDocumento(d, p.contexto).catch((e) => toast(e.message))}>Ver</button>}{' '}
                {d?.arquivo_path && p.podeExcluir && <button className="btn sm" onClick={() => setConfirma(d)}>Remover</button>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <>
      {p.semTabelaCard ? <div className="tablewrap">{tabela}</div> : <div className="card mt tablewrap">{p.titulo && <h3>{p.titulo}</h3>}{tabela}</div>}
      {confirma && (
        <Modal onClose={() => setConfirma(null)}>
          <h2>Remover arquivo?</h2>
          <p>{confirma.arquivo_nome}. O arquivo é apagado do armazenamento e o documento volta para pendente. A remoção fica na auditoria.</p>
          <div className="modal-actions"><button className="btn" onClick={() => setConfirma(null)}>Cancelar</button><button className="btn primary" onClick={() => remover(confirma)}>Remover</button></div>
        </Modal>
      )}
    </>
  );
}
