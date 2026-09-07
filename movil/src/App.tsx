import { useEffect, useState } from 'react'
import { HomeScreen } from './components/HomeScreen'
import { LoginScreen } from './components/LoginScreen'
import { getSession, login, logout, type SteamUser } from './steam-client'

type Status = 'loading' | 'guest' | 'ready'

export function App(): React.JSX.Element {
  const [status, setStatus] = useState<Status>('loading')
  const [user, setUser] = useState<SteamUser | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void getSession()
      .then((session) => {
        setUser(session)
        setStatus(session ? 'ready' : 'guest')
      })
      .catch((err: unknown) => {
        setUser(null)
        setStatus('guest')
        setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión')
      })
  }, [])

  async function handleLogin(): Promise<void> {
    setBusy(true)
    setError('')
    try {
      const next = await login()
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
    await logout()
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
