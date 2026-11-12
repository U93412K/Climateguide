import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { useAuth } from './auth.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Login from './pages/Login.jsx';
import ReportIncident from './pages/ReportIncident.jsx';
import Plans from './pages/Plans.jsx';
import PlanDetail from './pages/PlanDetail.jsx';
import Suppliers from './pages/Suppliers.jsx';
import Roads from './pages/Roads.jsx';
import Reports from './pages/Reports.jsx';
import Settings from './pages/Settings.jsx';

function Protected({ roles, children }) {
  const { user, ready } = useAuth();
  if (!ready) return <p className="loading">Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) {
    return <div className="empty"><h2>Access restricted</h2><p>Your role ({user.role}) cannot open this page. Ask an administrator if you need access.</p></div>;
  }
  return children;
}

const STAFF = ['admin', 'coordinator', 'logistics'];
const OPS = ['admin', 'coordinator'];

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="report" element={<ReportIncident />} />
        <Route path="login" element={<Login />} />
        <Route path="plans" element={<Protected><Plans /></Protected>} />
        <Route path="plans/:id" element={<Protected><PlanDetail /></Protected>} />
        <Route path="suppliers" element={<Protected roles={STAFF}><Suppliers /></Protected>} />
        <Route path="roads" element={<Protected><Roads /></Protected>} />
        <Route path="reports" element={<Protected><Reports /></Protected>} />
        <Route path="settings" element={<Protected roles={OPS}><Settings /></Protected>} />
        <Route path="*" element={<div className="empty"><h2>Page not found</h2><p>Use the menu to go back to the dashboard.</p></div>} />
      </Route>
    </Routes>
  );
}
