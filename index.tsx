import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Safe Service Worker Registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    try {
      // Bump to v6 to force clean slate
      navigator.serviceWorker.register('sw.js?v=6').then(
        (registration) => {
          console.log('SW registered with scope: ', registration.scope);
          registration.update();
        },
        (err) => {
          console.warn('SW registration failed: ', err);
        }
      );
    } catch (e) {
      console.warn('Service Worker not supported in this context');
    }
  });
}