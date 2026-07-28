import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const CHUNK_RELOAD_KEY = 'magnit_chunk_reload_at'

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  const lastReloadAt = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0)
  if (Date.now() - lastReloadAt < 10_000) return

  sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()))
  window.location.reload()
})

const mountApp = () => {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

const prepareFonts = async () => {
  if (!document.fonts) return

  await Promise.all([
    document.fonts.load('400 1em "Arha Magnit"'),
    document.fonts.load('500 1em "Arha Magnit"'),
    document.fonts.load('600 1em "Arha Magnit"'),
    document.fonts.load('700 1em "Arha Magnit"'),
  ])
  await document.fonts.ready
}

prepareFonts().catch(() => {}).finally(mountApp)
