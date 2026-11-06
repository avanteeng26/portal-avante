'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Ico, Modal } from '@/components/ui';

// Login pelo Supabase Auth (e-mail e senha). Não há cadastro público:
// usuários são criados pelo administrador em Authentication › Users e em public.usuarios.
export default function Login() {
  const router = useRouter();
  const [em, setEm] = useState('');
  const [pw, setPw] = useState('');
  const [ver, setVer] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [rec, setRec] = useState<null | { email: string; msg: string }>(null);

  const ok = em.trim() && pw.length >= 6 && !busy;

  async function entrar() {
    if (!ok) return;
    setBusy(true); setErr('');
    const sb = supabase();
    const email = em.trim().toLowerCase();
    const { data: auth, error } = await sb.auth.signInWithPassword({ email, password: pw });
    if (error) {
      await sb.rpc('registrar_evento', { p_acao: 'Falha de login', p_detalhe: email + ' · ' + error.message });
      setErr('Não foi possível entrar: e-mail ou senha incorretos. A tentativa foi registrada.');
      setBusy(false);
      return;
    }
    const { data: u } = await sb.from('usuarios').select('ativo').eq('id', auth.user.id).maybeSingle();
    if (!u || !u.ativo) {
      await sb.rpc('registrar_evento', { p_acao: 'Falha de login', p_detalhe: email + ' · ' + (!u ? 'sem cadastro no portal' : 'usuário desativado') });
      await sb.auth.signOut();
      setErr(!u ? 'Não foi possível entrar: seu e-mail não está liberado no portal. Procure o RH.' : 'Não foi possível entrar: usuário desativado. A tentativa foi registrada.');
      setBusy(false);
      return;
    }
    await sb.rpc('registrar_evento', { p_acao: 'Login', p_detalhe: null });
    router.replace('/');
    router.refresh();
  }

  async function enviarLink() {
    if (!rec) return;
    const email = rec.email.trim().toLowerCase();
    if (!email.includes('@')) { setRec({ ...rec, msg: 'Informe um e-mail válido.' }); return; }
    await supabase().auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/redefinir-senha' });
    await supabase().rpc('registrar_evento', { p_acao: 'Solicitou redefinição de senha', p_detalhe: email });
    setRec({ ...rec, msg: 'Se o e-mail estiver cadastrado, o link chega em alguns minutos.' });
  }

  return (
    <div className="lp">
      <aside className="lp-l">
        <div className="lp-shade" />
        <img className="lp-mk" src="/logo-mark.png" alt="" aria-hidden="true" />
        <div className="lp-in">
          <span className="lp-pill">NOSSA CULTURA</span>
          <h1 className="lp-h">FAZER<br /><span>ACONTECER!</span></h1>
          <p className="lp-p">Soluções que fazem acontecer em obras civis, infraestrutura e montagem pesada para energia, logística, mineração e indústria.</p>
          <p className="lp-foot2">Portal de gestão interno · Recursos Humanos, Logística e Engenharia</p>
        </div>
      </aside>
      <main className="lp-r">
        <div className="lp-mban"><b>FAZER <span>ACONTECER!</span></b></div>
        <form className="lp-form" onSubmit={(e) => { e.preventDefault(); entrar(); }}>
          <div className="lp-flogo"><img src="/logo.png" alt="Avante Engenharia" className="logo-img logo-lg" /></div>
          <h2 className="lp-t">Entre na <b>sua conta</b></h2>
          <p className="small muted" style={{ margin: '4px 0 26px' }}>Acesso restrito a colaboradores autorizados da Avante Engenharia.</p>
          <label htmlFor="em">E-mail</label>
          <input id="em" type="email" placeholder="digite seu e-mail cadastrado" autoComplete="username" value={em} onChange={(e) => setEm(e.target.value)} />
          <label htmlFor="pw">Senha</label>
          <div className="pwbox">
            <input id="pw" type={ver ? 'text' : 'password'} placeholder="6 dígitos ou mais" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
            <button type="button" className="eye" aria-label={ver ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setVer(!ver)}><Ico k="eye" /></button>
          </div>
          <a className="lp-link" onClick={() => setRec({ email: em, msg: '' })}>Esqueci a senha</a>
          <div className="err">{err}</div>
          <button className="lp-btn" type="submit" disabled={!ok}>{busy ? 'ENTRANDO…' : 'ENTRAR'}</button>
        </form>
        <div className="lp-foot">
          <div><span className="muted">Primeiro acesso?</span><br /><a className="lp-link" onClick={() => setRec({ email: em, msg: '' })}>Solicite ao RH</a></div>
          <div><span className="muted">Não consegue entrar na sua conta?</span><br /><a className="lp-link" onClick={() => setRec({ email: em, msg: '' })}>Fale com o suporte interno</a></div>
        </div>
      </main>
      {rec && (
        <Modal onClose={() => setRec(null)}>
          <h2>Recuperar acesso</h2>
          <p>Informe seu e-mail cadastrado. Enviaremos um link para criar uma nova senha.</p>
          <label>E-mail</label>
          <input type="email" value={rec.email} onChange={(e) => setRec({ email: e.target.value, msg: '' })} />
          <p className="small muted">{rec.msg || 'Se não tiver acesso ao e-mail, procure o RH ou o administrador do sistema. O primeiro acesso é liberado pelo RH.'}</p>
          <div className="modal-actions">
            <button className="btn" onClick={() => setRec(null)}>Fechar</button>
            <button className="btn primary" onClick={enviarLink}>Enviar link</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
