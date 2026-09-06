import { useEffect, useState } from 'react'
import type { SteamUser } from '../../shared/steam'
import { HomeScreen } from './components/HomeScreen'
import { LoginScreen } from './components/LoginScreen'

type Status = 'loading' | 'guest' | 'ready'

export function App(): React.JSX.Element {
  const [status, setStatus] = useState<Status>('loading')
  const [user, setUser] = useState<SteamUser | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void window.steamAuth.getSession().then((session) => {
      setUser(session)
      setStatus(session ? 'ready' : 'guest')
    })
  }, [])

  async function handleLogin(): Promise<void> {
    setBusy(true)
    setError('')
    try {
      const next = await window.steamAuth.login()
      setUser(next)
      setStatus('ready')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo iniciar sesión'
      if (!/cancelad/i.test(message)) setError(message)
    } finally {
      setBusy(false)
    }
  }

  async function handleLogout(): Promise<void> {
    await window.steamAuth.logout()
    setUser(null)
    setStatus('guest')
    setError('')
  }

  if (status === 'loading') {
    return (
      <main className="shell">
        <p className="muted">Cargando sesión…</p>
      </main>
    )
  }

  if (status === 'ready' && user) {
    return <HomeScreen user={user} onLogout={() => void handleLogout()} />
  }

  return <LoginScreen busy={busy} error={error} onLogin={() => void handleLogin()} />
}
