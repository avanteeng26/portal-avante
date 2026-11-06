'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

// Destino do link "Esqueci a senha" (e do convite de primeiro acesso enviado pelo Supabase).
export default function RedefinirSenha() {
  const router = useRouter();
  const [pronto, setPronto] = useState(false);
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const sb = supabase();
    const code = new URLSearchParams(window.location.search).get('code');
    (async () => {
      if (code) await sb.auth.exchangeCodeForSession(code);
      const { data } = await sb.auth.getSession();
      if (data.session) setPronto(true);
    })();
    const { data: sub } = sb.auth.onAuthStateChange((ev, s) => { if (s && (ev === 'PASSWORD_RECOVERY' || ev === 'SIGNED_IN')) setPronto(true); });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function salvar() {
    if (a.length < 6) return setMsg('A senha precisa ter 6 caracteres ou mais.');
    if (a !== b) return setMsg('As senhas não conferem.');
    const sb = supabase();
    const { error } = await sb.auth.updateUser({ password: a });
    if (error) return setMsg('Não foi possível salvar: ' + error.message);
    await sb.rpc('registrar_evento', { p_acao: 'Redefiniu a senha', p_detalhe: null });
    router.replace('/');
  }

  return (
    <div className="login">
      <div className="login-card">
        <img src="/logo.png" alt="Avante Engenharia" className="logo-img logo-md" />
        <h2 style={{ marginTop: 18 }}>Criar nova senha</h2>
        {!pronto ? (
          <p className="muted">Validando o link… Se nada acontecer, peça um novo link na tela de login.</p>
        ) : (
          <>
            <label>Nova senha</label><input type="password" value={a} onChange={(e) => setA(e.target.value)} />
            <label>Repita a nova senha</label><input type="password" value={b} onChange={(e) => setB(e.target.value)} />
            <div className="err">{msg}</div>
            <div className="modal-actions"><button className="btn primary" onClick={salvar}>Salvar e entrar</button></div>
          </>
        )}
      </div>
    </div>
  );
}
