import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

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
