import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Global fix for "Uncaught (in promise) AbortError: The play() request was interrupted by a call to pause()"
// This commonly happens in some browsers with rapid UI updates or 3rd party scripts.
// Monkey-patching HTMLMediaElement.prototype.play to handle the promise rejection silently.
if (typeof window !== 'undefined' && typeof HTMLMediaElement !== 'undefined' && HTMLMediaElement.prototype.play) {
  const originalPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    const promise = originalPlay.apply(this, arguments);
    if (promise !== undefined) {
      promise.catch(error => {
        if (error.name === 'AbortError' || error.message?.includes('interrupted by a call to pause()')) {
          // Ignore interruption errors
          return;
        }
        // Re-throw or log other legitimate playback errors if needed
        console.warn('[Media] Playback error:', error.message);
      });
    }
    return promise;
  };
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
