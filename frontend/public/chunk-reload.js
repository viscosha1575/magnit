const reloadKey = 'magnit_chunk_reload_at'
const lastReloadAt = Number(sessionStorage.getItem(reloadKey) || 0)

if (Date.now() - lastReloadAt >= 10_000) {
  sessionStorage.setItem(reloadKey, String(Date.now()))
  window.location.reload()
}

export default function StaleChunkFallback() {
  return null
}

export async function createResultImage() {
  throw new Error('Application version changed')
}
