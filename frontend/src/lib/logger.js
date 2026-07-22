const USER_ID_KEY = 'magnit_user_id'
const API_URL = import.meta.env.VITE_API_URL || ''

function createUserId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }

  const bytes = new Uint8Array(16)
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes)
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256)
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const value = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`
}

export function getUserId() {
  let userId = localStorage.getItem(USER_ID_KEY)
  if (!userId) {
    userId = createUserId()
    localStorage.setItem(USER_ID_KEY, userId)
  }
  return userId
}

export function logEvent(eventType, page, metadata = {}) {
  const payload = JSON.stringify({
    userId: getUserId(),
    eventType,
    page,
    metadata,
  })

  fetch(`${API_URL}/api/logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true,
  }).catch(() => {})
}

export function startAutomaticLogging(getPage) {
  logEvent('session_start', getPage(), {
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    language: navigator.language,
  })

  const handleClick = (event) => {
    const target = event.target.closest('button, a, select')
    if (!target) return
    logEvent('click', getPage(), {
      element: target.tagName.toLowerCase(),
      label: (target.getAttribute('aria-label') || target.textContent || '').trim().slice(0, 120),
    })
  }

  const handlePageHide = () => {
    logEvent('session_end', getPage(), {
      visibility: document.visibilityState,
    })
  }

  const handleVisibilityChange = () => {
    logEvent('visibility_changed', getPage(), {
      visibility: document.visibilityState,
    })
  }

  document.addEventListener('click', handleClick)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  window.addEventListener('pagehide', handlePageHide)
  return () => {
    document.removeEventListener('click', handleClick)
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    window.removeEventListener('pagehide', handlePageHide)
  }
}
