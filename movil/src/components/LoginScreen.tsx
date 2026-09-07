type Props = {
  busy: boolean
  error: string
  onLogin: () => void
}

export function LoginScreen({ busy, error, onLogin }: Props): React.JSX.Element {
  return (
    <main className="shell login">
      <div className="glow glow-a" />
      <div className="glow glow-b" />

      <section className="card">
        <p className="eyebrow">WhatToPlayTogether</p>
        <h1>Encuentra a qué jugar juntos</h1>
        <p className="lede">
          Conecta tu cuenta de Steam para entrar. Se abrirá la página oficial de Steam en el
          navegador; esta app nunca pide tu contraseña.
        </p>

        <button className="steam-btn" disabled={busy} onClick={onLogin} type="button">
          <SteamMark />
          {busy ? 'Esperando a Steam…' : 'Iniciar sesión con Steam'}
        </button>

        {error ? <p className="error">{error}</p> : null}
      </section>
    </main>
  )
}

function SteamMark(): React.JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20">
      <circle cx="12" cy="12" r="11" fill="#1b2838" stroke="#66c0f4" strokeWidth="1.4" />
      <circle cx="15.2" cy="8.6" r="2.4" fill="#66c0f4" />
      <path
        d="M6.8 14.8 13.1 11.6a2.55 2.55 0 0 0 2.3 2.15l-5.2 2.7a2.35 2.35 0 0 1-3.4-1.65Z"
        fill="#c7d5e0"
      />
    </svg>
  )
}
