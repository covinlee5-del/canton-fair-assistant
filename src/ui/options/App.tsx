import { useState } from 'react';
import { NAV_ITEMS } from './nav';
import type { NavKey } from './nav';
import Dashboard from './pages/dashboard';
import Tasks from './pages/tasks';
import Notes from './pages/notes';
import CopyPage from './pages/copy';
import ActivityPage from './pages/activity';
import StatsPlaceholder from './pages/stats';
import SettingsPlaceholder from './pages/settings';
import { extensionVersion } from '../../platform/side-panel';

export default function App() {
  const [nav, setNav] = useState<NavKey>('dashboard');

  return (
    <div className="app app-options">
      <header className="app-header">
        <h1>广交会推广助手</h1>
        <span className="version">v{extensionVersion()} · 管理页</span>
      </header>
      <nav className="nav" aria-label="页面导航">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`nav-item${nav === item.key ? ' active' : ''}`}
            onClick={() => setNav(item.key)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <main className="page">
        {nav === 'dashboard' ? <Dashboard onNavigate={setNav} /> : null}
        {nav === 'tasks' ? <Tasks /> : null}
        {nav === 'notes' ? <Notes /> : null}
        {nav === 'copy' ? <CopyPage /> : null}
        {nav === 'activity' ? <ActivityPage /> : null}
        {nav === 'stats' ? <StatsPlaceholder /> : null}
        {nav === 'settings' ? <SettingsPlaceholder /> : null}
      </main>
    </div>
  );
}
