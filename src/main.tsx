import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './utils/monacoConfig';

// Prevent Linux Chromium primary selection middle-click paste globally
if (typeof window !== 'undefined') {
  let lastMiddleClickTime = 0;

  window.addEventListener(
    'auxclick',
    (e) => {
      if (e.button === 1) {
        lastMiddleClickTime = Date.now();
        e.preventDefault();
      }
    },
    { capture: true }
  );

  window.addEventListener(
    'mousedown',
    (e) => {
      if (e.button === 1) {
        lastMiddleClickTime = Date.now();
      }
    },
    { capture: true }
  );

  window.addEventListener(
    'mouseup',
    (e) => {
      if (e.button === 1) {
        lastMiddleClickTime = Date.now();
      }
    },
    { capture: true }
  );

  window.addEventListener(
    'paste',
    (e) => {
      // If a paste event was triggered within 400ms of a middle-click, block it
      if (Date.now() - lastMiddleClickTime < 400) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    { capture: true }
  );
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
