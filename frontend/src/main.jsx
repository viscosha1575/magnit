import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const privacyScreen = document.createElement('div')
privacyScreen.className = 'privacy-screen'
privacyScreen.setAttribute('aria-hidden', 'true')
document.body.appendChild(privacyScreen)

const updatePrivacyScreen = () => {
  privacyScreen.classList.toggle('is-visible', document.hidden || !document.hasFocus())
}

document.addEventListener('visibilitychange', updatePrivacyScreen)
window.addEventListener('blur', updatePrivacyScreen)
window.addEventListener('focus', () => requestAnimationFrame(updatePrivacyScreen))
window.addEventListener('pagehide', () => privacyScreen.classList.add('is-visible'))
window.addEventListener('pageshow', () => requestAnimationFrame(updatePrivacyScreen))

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
