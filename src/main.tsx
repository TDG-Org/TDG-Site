import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Globals first so they land ahead of component CSS in the bundle. Component
// overrides are written as compound selectors too, so order is belt-and-braces.
import './styles/tokens.css'
import './styles/base.css'
import App from './App'
import { ThemeProvider } from './theme/ThemeProvider'
import { AuthProvider } from './auth/AuthProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
)
