import Home from './pages/home';
import { extensionVersion } from '../../platform/side-panel';

export default function App() {
  return (
    <div className="app app-sidepanel">
      <header className="app-header">
        <h1>广交会推广助手</h1>
        <span className="version">v{extensionVersion()}</span>
      </header>
      <Home />
    </div>
  );
}
