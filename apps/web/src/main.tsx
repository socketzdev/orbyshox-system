import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initBrandTheme } from './lib/brand-theme';
import './index.css';

// Reaplica a cor de marca antes do primeiro render — evita o "pisca" da cor
// padrão quando o Copiloto já trocou o tema em uma sessão anterior.
initBrandTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);