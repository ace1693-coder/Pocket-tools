import { StrictMode } from 'react';
import { installModernBuiltins } from './lib/compat';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

installModernBuiltins();

const container = document.getElementById('root');
if (!container) throw new Error('root element not found');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
