import { useEffect, useMemo, useState } from 'react'
import { intersectGames, type SteamFriend, type SteamGame, type SteamUser } from '../../../shared/steam'

type Props = {
  user: SteamUser
  onLogout: () => void
}

type Tab = 'friends' | 'library'

function isOnline(friend: SteamFriend): boolean {
  return /online|in-game/i.test(friend.onlineState ?? '')
}

function statusRank(friend: SteamFriend): number {
  if (friend.onlineState === 'in-game') return 0
  if (friend.onlineState === 'online') return 1
  return 2
}

function sortFriends(list: SteamFriend[]): SteamFriend[] {
  return [...list].sort((a, b) => {
    const byStatus = statusRank(a) - statusRank(b)
    return byStatus !== 0 ? byStatus : a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
  })
}

function FriendRow({
  friend,
  checked,
  onToggle
}: {
  friend: SteamFriend
  checked: boolean
  onToggle: (steamId: string) => void
}): React.JSX.Element {
  const online = isOnline(friend)
  return (
    <li>
      <button
        className={checked ? 'friend-row on' : 'friend-row'}
        onClick={() => onToggle(friend.steamId)}
        type="button"
      >
        {friend.avatar ? (
          <img alt="" className="avatar sm" src={friend.avatar} />
        ) : (
          <div className="avatar sm fallback">{friend.name.slice(0, 1)}</div>
        )}
        <span className="friend-meta">
          <strong>{friend.name}</strong>
          <span className="status">
            <span className={online ? 'dot on' : 'dot'} />
            {friend.onlineState === 'in-game'
              ? 'En juego'
              : friend.onlineState === 'online'
                ? 'En línea'
                : 'Desconectado'}
          </span>
        </span>
        <span className={checked ? 'tick on' : 'tick'} aria-hidden="true" />
      </button>
    </li>
  )
}

export function HomeScreen({ user, onLogout }: Props): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('library')
  const [friends, setFriends] = useState<SteamFriend[]>([])
  const [friendsError, setFriendsError] = useState('')
  const [friendsLoading, setFriendsLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [friendLibraries, setFriendLibraries] = useState<SteamGame[][]>([])
  const [gamesLoading, setGamesLoading] = useState(false)
  const [gamesError, setGamesError] = useState('')
  const [gamesHint, setGamesHint] = useState('')
  const [gameQuery, setGameQuery] = useState('')
  const [reloadToken, setReloadToken] = useState(0)
  const [myGames, setMyGames] = useState<SteamGame[]>([])
  const [myGamesLoading, setMyGamesLoading] = useState(true)
  const [myGamesError, setMyGamesError] = useState('')
  const [myQuery, setMyQuery] = useState('')

  const selectedKey = selectedIds.join(',')

  function loadFriends(): void {
    setFriendsLoading(true)
    setFriendsError('')
    void window.steamAuth
      .getFriends()
      .then((list) => setFriends(list))
      .catch((err: unknown) => {
        setFriends([])
        setFriendsError(err instanceof Error ? err.message : 'No se pudieron cargar los amigos')
      })
      .finally(() => setFriendsLoading(false))
  }

  function loadMyGames(force = false): void {
    setMyGamesLoading(true)
    setMyGamesError('')
    void window.steamAuth
      .getMyGames(force)
      .then((result) => {
        setMyGames(result.games)
        if (result.games.length === 0 && result.hint) setMyGamesError(result.hint)
      })
      .catch((err: unknown) => {
        setMyGames([])
        setMyGamesError(err instanceof Error ? err.message : 'No se pudo leer tu biblioteca')
      })
      .finally(() => setMyGamesLoading(false))
  }

  function toggleFriend(steamId: string): void {
    setSelectedIds((current) =>
      current.includes(steamId) ? current.filter((id) => id !== steamId) : [...current, steamId]
    )
  }

  useEffect(() => {
    loadFriends()
    loadMyGames()
  }, [])

  useEffect(() => {
    if (selectedIds.length === 0) {
      setFriendLibraries([])
      setGamesError('')
      setGamesHint('')
      setGamesLoading(false)
      return
    }

    if (myGamesLoading) return

    if (myGames.length === 0) {
      setFriendLibraries([])
      setGamesError('Carga primero tu biblioteca en la pestaña Mi biblioteca.')
      setGamesLoading(false)
      return
    }

    let cancelled = false
    setGamesLoading(true)
    setGamesError('')
    setGamesHint('')

    void (async () => {
      const loaded: SteamGame[][] = []
      const failed: string[] = []
      const force = reloadToken > 0

      for (const steamId of selectedIds) {
        if (cancelled) return
        const friend = friends.find((item) => item.steamId === steamId)
        try {
          const result = await window.steamAuth.getFriendGames(steamId, force, friend?.profileUrl)
          if (result.games.length === 0) failed.push(friend?.name ?? steamId)
          else loaded.push(result.games)
        } catch (err) {
          failed.push(friend?.name ?? (err instanceof Error ? err.message : steamId))
        }
      }

      if (cancelled) return
      if (failed.length > 0) {
        setFriendLibraries([])
        setGamesHint(`No se pudo leer la biblioteca de: ${failed.join(', ')}.`)
      } else {
        setFriendLibraries(loaded)
      }
      setGamesLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [selectedKey, reloadToken, myGamesLoading, myGames.length])

  const { selectedVisible, otherVisible } = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const matches = (friend: SteamFriend) =>
      !needle || friend.name.toLowerCase().includes(needle)
    const selected = friends.filter((friend) => selectedIds.includes(friend.steamId) && matches(friend))
    const others = friends.filter((friend) => !selectedIds.includes(friend.steamId) && matches(friend))
    return {
      selectedVisible: sortFriends(selected),
      otherVisible: sortFriends(others)
    }
  }, [friends, query, selectedIds])

  const commonGames = useMemo(() => {
    if (myGames.length === 0 || friendLibraries.length === 0) return []
    if (friendLibraries.length !== selectedIds.length) return []
    return intersectGames([myGames, ...friendLibraries])
  }, [myGames, friendLibraries, selectedIds.length])

  const visibleGames = useMemo(() => {
    const needle = gameQuery.trim().toLowerCase()
    if (!needle) return commonGames
    return commonGames.filter((game) => game.name.toLowerCase().includes(needle))
  }, [commonGames, gameQuery])

  const visibleMyGames = useMemo(() => {
    const needle = myQuery.trim().toLowerCase()
    if (!needle) return myGames
    return myGames.filter((game) => game.name.toLowerCase().includes(needle))
  }, [myGames, myQuery])

  const selectedFriends = friends.filter((friend) => selectedIds.includes(friend.steamId))
  const commonTitle =
    selectedFriends.length === 0
      ? 'Juegos en común'
      : selectedFriends.length === 1
        ? `En común con ${selectedFriends[0].name}`
        : `En común con ${selectedFriends.length} amigos`

  return (
    <main className="shell home">
      <header className="topbar compact">
        <div className="whoami">
          {user.avatar ? <img alt="" className="avatar sm" src={user.avatar} /> : null}
          <div>
            <p className="eyebrow">WhatToPlayTogether</p>
            <p className="whoami-name">{user.name}</p>
          </div>
        </div>
        <button className="ghost-btn" onClick={onLogout} type="button">
          Cerrar sesión
        </button>
      </header>

      <nav className="tabs">
        <button className={tab === 'library' ? 'tab on' : 'tab'} onClick={() => setTab('library')} type="button">
          Mi biblioteca
        </button>
        <button className={tab === 'friends' ? 'tab on' : 'tab'} onClick={() => setTab('friends')} type="button">
          Amigos
        </button>
      </nav>

      {tab === 'library' ? (
        <section className="pane library-pane">
          <div className="pane-head">
            <h2>Mis juegos</h2>
            <div className="pane-actions">
              <span className="count">
                {myGamesLoading
                  ? 'Cargando…'
                  : `${visibleMyGames.length} juego${visibleMyGames.length === 1 ? '' : 's'}`}
              </span>
              <button className="link-btn" onClick={() => loadMyGames(true)} type="button">
                Reintentar
              </button>
            </div>
          </div>
          <input
            className="search"
            onChange={(event) => setMyQuery(event.target.value)}
            placeholder="Buscar juego…"
            type="search"
            value={myQuery}
          />
          <div className="pane-body">
            {myGamesLoading ? <p className="muted pad">Leyendo tu biblioteca con la API de Steam…</p> : null}
            {myGamesError ? <p className="error pad">{myGamesError}</p> : null}
            {!myGamesLoading && !myGamesError && visibleMyGames.length === 0 ? (
              <p className="muted pad">No hay juegos para mostrar.</p>
            ) : null}
            <ul className="name-list">
              {visibleMyGames.map((game) => (
                <li key={game.appId}>
                  <span className="name-row">{game.name}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : (
        <section className="home-layout">
          <aside className="pane">
            <div className="pane-head">
              <h2>Amigos</h2>
              <span className="count">{selectedIds.length} seleccionados</span>
            </div>
            <input
              className="search"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar amigo…"
              type="search"
              value={query}
            />
            <div className="pane-body">
              {friendsLoading ? <p className="muted pad">Cargando amigos…</p> : null}
              {friendsError ? <p className="error pad">{friendsError}</p> : null}
              {!friendsLoading && !friendsError && selectedVisible.length === 0 && otherVisible.length === 0 ? (
                <p className="muted pad">No hay amigos para mostrar.</p>
              ) : null}
              {selectedVisible.length > 0 ? (
                <>
                  <p className="list-label">Seleccionados</p>
                  <ul className="friend-list">
                    {selectedVisible.map((friend) => (
                      <FriendRow
                        key={friend.steamId}
                        checked
                        friend={friend}
                        onToggle={toggleFriend}
                      />
                    ))}
                  </ul>
                </>
              ) : null}
              {otherVisible.length > 0 ? (
                <>
                  <p className="list-label">Amigos</p>
                  <ul className="friend-list">
                    {otherVisible.map((friend) => (
                      <FriendRow
                        key={friend.steamId}
                        checked={false}
                        friend={friend}
                        onToggle={toggleFriend}
                      />
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          </aside>

          <section className="pane">
            <div className="pane-head">
              <h2>{commonTitle}</h2>
              {selectedIds.length > 0 ? (
                <div className="pane-actions">
                  <span className="count">
                    {gamesLoading
                      ? 'Comparando…'
                      : `${visibleGames.length} juego${visibleGames.length === 1 ? '' : 's'}`}
                  </span>
                  <button className="link-btn" onClick={() => setReloadToken((value) => value + 1)} type="button">
                    Reintentar
                  </button>
                </div>
              ) : (
                <span className="count">Elige amigos</span>
              )}
            </div>
            {selectedIds.length > 0 ? (
              <input
                className="search"
                onChange={(event) => setGameQuery(event.target.value)}
                placeholder="Buscar juego…"
                type="search"
                value={gameQuery}
              />
            ) : null}
            <div className="pane-body">
              {selectedIds.length === 0 ? (
                <p className="muted pad">
                  Marca uno o más amigos. Verás solo los juegos que tengas tú y todos los
                  seleccionados. Si A tiene A y B, y B solo tiene A, aparecerá únicamente A.
                </p>
              ) : null}
              {gamesLoading ? <p className="muted pad">Comparando bibliotecas con la API de Steam…</p> : null}
              {gamesError ? <p className="error pad">{gamesError}</p> : null}
              {gamesHint ? <p className="error pad">{gamesHint}</p> : null}
              {!gamesLoading &&
              selectedIds.length > 0 &&
              !gamesError &&
              !gamesHint &&
              friendLibraries.length > 0 &&
              visibleGames.length === 0 ? (
                <p className="muted pad">No hay juegos que tengan todos en común.</p>
              ) : null}
              <ul className="name-list">
                {visibleGames.map((game) => (
                  <li key={game.appId}>
                    <span className="name-row">{game.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </section>
      )}
    </main>
  )
}
