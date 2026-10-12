// Polyfill for simple-peer in Vite
if (typeof global === 'undefined') {
  window.global = window;
}
if (typeof process === 'undefined') {
  window.process = { env: {} };
}

import { Component, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('Unhandled Application Error:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#09090b', color: '#ffffff', padding: 24, textAlign: 'center'
        }}>
          <div style={{ maxWidth: 480, padding: 32, background: '#121217', borderRadius: 14, border: '1px solid rgba(255,255,255,0.1)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px', color: '#ef4444' }}>Application Error</h2>
            <p style={{ fontSize: 13, color: '#a1a1aa', margin: '0 0 16px' }}>
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
            <button
              onClick={() => { window.location.href = '/'; }}
              className="btn btn-primary"
              style={{ width: '100%' }}
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

