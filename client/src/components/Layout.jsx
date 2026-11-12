import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

const Wave = () => (
  <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="#17414d" /><path d="M5 19c4-5 7 5 11 0s7 5 11 0" stroke="#56c2e0" strokeWidth="3" fill="none" strokeLinecap="round" /></svg>
);

export default function Layout() {
  const { user, logout, isStaff, can } = useAuth();
  const nav = useNavigate();
  const link = ({ isActive }) => (isActive ? 'active' : undefined);
  return (
    <div className="shell">
      <a className="skip" href="#main">Skip to content</a>
      <aside className="rail">
        <div className="brand"><Wave /><span>ClimateGuide</span></div>
        <nav aria-label="Main">
          <NavLink to="/" end className={link}>Risk dashboard</NavLink>
          <NavLink to="/report" className={link}>Report an incident</NavLink>
          {user && <>
            <p className="rail-group">Response</p>
            <NavLink to="/plans" className={link}>Response plans</NavLink>
            {isStaff && <NavLink to="/suppliers" className={link}>Suppliers and stock</NavLink>}
            <NavLink to="/roads" className={link}>Road network</NavLink>
            <NavLink to="/reports" className={link}>Incident reports</NavLink>
            {can('admin', 'coordinator') && <NavLink to="/settings" className={link}>Assumptions and audit</NavLink>}
          </>}
        </nav>
        <div className="rail-foot">
          {user ? (
            <>
              <p className="who"><strong>{user.name}</strong><br /><span>{user.role}</span></p>
              <button className="btn ghost-light" onClick={() => { logout(); nav('/'); }}>Sign out</button>
            </>
          ) : (
            <NavLink to="/login" className="btn light">Staff sign in</NavLink>
          )}
        </div>
      </aside>
      <main id="main" className="main"><Outlet /></main>
    </div>
  );
}
