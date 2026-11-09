import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import './styles/index.css';

// Entry point: mounts the app into the #root div in index.html.
// StrictMode runs effects twice in development to expose missing cleanups; production is unaffected.
createRoot(document.getElementById('root')).render(
    <StrictMode>
        <App />
    </StrictMode>
);
