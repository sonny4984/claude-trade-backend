import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/themes.css';
import './styles/base.css';
import './styles/table.css';
import './styles/tiles.css';
import './styles/screens.css';
import './styles/coda.css';
import './styles/picnic.css';
import './styles/online.css';
import './styles/gomoku.css';
import './styles/fireice.css';
import { App } from './ui/App';

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
