import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';
import { ErrorBox, Field, Notice, useAction, useAsync } from '../components/ui.jsx';

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const cfg = useAsync(() => api.get('/public/config'), []);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { busy, error, run } = useAction();
  if (user) return <Navigate to="/plans" replace />;

  const submit = (e) => { e.preventDefault(); run(async () => { await login(email, password); nav('/plans'); }); };
  return (
    <div className="narrow">
      <h1>Staff sign in</h1>
      <p className="lede">Sign in to generate response plans, manage suppliers and approve dispatches. Public risk information needs no account.</p>
      <form className="panel form" onSubmit={submit}>
        <Field label="Email"><input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Password"><input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <ErrorBox error={error} />
        <button className="btn primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      {cfg.data?.demo && (
        <Notice>
          <strong>Demo accounts</strong> (password <code>{cfg.data.demoPassword}</code>):
          <ul className="plain">{cfg.data.demoAccounts.map((a) => <li key={a.email}><button type="button" className="link" onClick={() => { setEmail(a.email); setPassword(cfg.data.demoPassword); }}>{a.role}</button>: {a.email}</li>)}</ul>
          Coordinators and admins can approve plans; logistics staff manage stock and track deliveries; viewers have read-only access.
        </Notice>
      )}
    </div>
  );
}
