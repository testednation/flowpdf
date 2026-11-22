import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

// Register offline-capable PWA service worker for local caching
try {
  registerSW({ immediate: true });
} catch {
  // Gracefully ignore in environments where service workers are restricted
}

createRoot(document.getElementById('root')!).render(<App />);
