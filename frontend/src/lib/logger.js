const USER_ID_KEY = 'magnit_user_id'
const UTM_KEY = 'magnit_utm_attribution'
const API_URL = import.meta.env.VITE_API_URL || ''
const pendingLogs = []
let flushTimer = null

function flushLogs() {
  window.clearTimeout(flushTimer)
  flushTimer = null
  pendingLogs.splice(0).forEach((payload) => {
    fetch(`${API_URL}/api/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {})
  })
}

function scheduleLog(payload) {
  pendingLogs.push(payload)
  if (flushTimer !== null) return
  flushTimer = window.setTimeout(flushLogs, document.readyState === 'complete' ? 2500 : 4000)
}

function getUtmAttribution() {
  const parameters = new URLSearchParams(window.location.search)
  const incoming = {
    source: parameters.get('utm_source') || '',
    medium: parameters.get('utm_medium') || '',
    campaign: parameters.get('utm_campaign') || '',
    content: parameters.get('utm_content') || '',
    term: parameters.get('utm_term') || '',
  }

  if (Object.values(incoming).some(Boolean)) {
    localStorage.setItem(UTM_KEY, JSON.stringify(incoming))
    return incoming
  }

  try {
    return JSON.parse(localStorage.getItem(UTM_KEY) || '{}')
  } catch {
    return {}
  }
}

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
  const utm = getUtmAttribution()
  const payload = JSON.stringify({
    userId: getUserId(),
    eventType,
    page,
    metadata: {
      ...metadata,
      ...(Object.values(utm).some(Boolean) ? { utm } : {}),
    },
  })

  scheduleLog(payload)
}

export function startAutomaticLogging(getPage) {
  logEvent('session_start', getPage(), {
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    language: navigator.language,
    landingPath: `${window.location.pathname}${window.location.search}`,
    referrer: document.referrer,
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
    flushLogs()
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
