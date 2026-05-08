import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { TaxonomyProvider } from './lib/taxonomy.jsx';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <TaxonomyProvider>
      <App />
    </TaxonomyProvider>
  </React.StrictMode>
);
