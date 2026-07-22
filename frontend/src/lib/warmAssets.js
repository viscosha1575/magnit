const warmedImages = []

const getConnection = () => navigator.connection || navigator.mozConnection || navigator.webkitConnection

const shouldSkipWarmup = () => {
  const connection = getConnection()
  return Boolean(connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || ''))
}

const warmImage = (source) => {
  const image = new Image()
  image.fetchPriority = 'low'
  image.decoding = 'async'
  image.onload = image.onerror = () => {
    const index = warmedImages.indexOf(image)
    if (index >= 0) warmedImages.splice(index, 1)
  }
  warmedImages.push(image)
  image.src = source
}

export function warmSecondaryArtwork() {
  if (shouldSkipWarmup()) return () => {}

  let timer = null
  let idleCallback = null
  let cancelled = false
  const run = () => {
    if (cancelled) return
    const isDesktop = window.matchMedia('(min-width: 900px)').matches
    const sources = isDesktop
      ? ['/svg/circles2-desktop.svg?v=20260722', '/svg/do2.svg?v=20260722']
      : ['/svg/circles2.svg?v=20260722', '/svg/do.svg?v=20260722-2']
    sources.forEach(warmImage)
  }
  const schedule = () => {
    timer = window.setTimeout(() => {
      if ('requestIdleCallback' in window) idleCallback = window.requestIdleCallback(run, { timeout: 4000 })
      else run()
    }, 1200)
  }

  if (document.readyState === 'complete') schedule()
  else window.addEventListener('load', schedule, { once: true })

  return () => {
    cancelled = true
    window.removeEventListener('load', schedule)
    window.clearTimeout(timer)
    if (idleCallback !== null && 'cancelIdleCallback' in window) window.cancelIdleCallback(idleCallback)
  }
}
