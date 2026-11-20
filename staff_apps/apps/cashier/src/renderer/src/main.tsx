import '@pos/design/fonts.web';
import '@pos/design/tokens.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { startAppearance } from './lib/appearance';
import './styles.css';

// Mavzuni render'dan oldin qo'yamiz - birinchi kadrda "yaltirash" bo'lmasin.
startAppearance();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
