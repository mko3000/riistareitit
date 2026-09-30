import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { partiesApi, type PartySummary, type PublicUser } from '../api'
import { t } from '../i18n'
import { parseInviteInput } from './inviteLink'
import { PartyDetailView } from './PartyDetailView'

interface PartiesMenuProps {
  user: PublicUser
  // Called after joining/leaving/deleting — what the map may show changed.
  onMembershipChanged: () => void
  // Bumped by App when membership changes elsewhere (e.g. the join dialog),
  // so an open list refreshes.
  membershipVersion: number
}

// RII-45: the "Porukat" button in the top bar and its dropdown panel — my
// parties, creating one, and one party's details (PartyDetailView). See
// docs/SPEC.md §9 "UI".
export function PartiesMenu({ user, onMembershipChanged, membershipVersion }: PartiesMenuProps) {
  const [open, setOpen] = useState(false)
  const [parties, setParties] = useState<PartySummary[] | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [joinInput, setJoinInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const loadParties = useCallback(async () => {
    const result = await partiesApi.list()
    if (result.ok) {
      setParties(result.value)
      setError(null)
    } else {
      setError(result.message)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    partiesApi.list().then((result) => {
      if (cancelled) return
      if (result.ok) setParties(result.value)
      else setError(result.message)
    })
    return () => {
      cancelled = true
    }
  }, [open, membershipVersion])

  async function handleCreate(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    const result = await partiesApi.create(newName)
    setBusy(false)
    if (!result.ok) {
      setError(result.message)
      return
    }
    setNewName('')
    setError(null)
    await loadParties()
    setSelectedId(result.value.id)
  }

  // "Liity porukkaan": accepts the bare code or the whole invite link.
  async function handleJoin(event: FormEvent) {
    event.preventDefault()
    const code = parseInviteInput(joinInput)
    if (!code) {
      setError(t.parties.joinInvalidInput)
      return
    }
    setBusy(true)
    const result = await partiesApi.join(code)
    setBusy(false)
    if (!result.ok) {
      setError(result.message)
      return
    }
    setJoinInput('')
    setError(null)
    onMembershipChanged()
    await loadParties()
    setSelectedId(result.value.id)
  }

  function handleLeftOrDeleted() {
    setSelectedId(null)
    onMembershipChanged()
    loadParties()
  }

  return (
    <>
      <button type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open}>
        {t.parties.menuButton}
      </button>

      {open && (
        <div className="parties-panel">
          <div className="parties-panel-header">
            {selectedId ? (
              <button type="button" className="link-button" onClick={() => setSelectedId(null)}>
                ← {t.parties.back}
              </button>
            ) : (
              <strong>{t.parties.menuButton}</strong>
            )}
            <button
              type="button"
              className="icon-button"
              aria-label={t.parties.close}
              onClick={() => setOpen(false)}
            >
              ✕
            </button>
          </div>

          {error && <p className="form-error">{error}</p>}

          {selectedId ? (
            <PartyDetailView
              key={selectedId}
              partyId={selectedId}
              user={user}
              onChanged={loadParties}
              onLeftOrDeleted={handleLeftOrDeleted}
            />
          ) : (
            <>
              {parties === null ? (
                <p>{t.parties.loading}</p>
              ) : parties.length === 0 ? (
                <p className="parties-muted">{t.parties.noParties}</p>
              ) : (
                <ul className="parties-list">
                  {parties.map((party) => (
                    <li key={party.id}>
                      <button type="button" className="parties-list-item" onClick={() => setSelectedId(party.id)}>
                        <span className="parties-name">{party.name}</span>
                        <span className="parties-muted">
                          {party.myRole === 'admin' ? t.parties.roleAdmin : t.parties.roleMember} ·{' '}
                          {t.parties.memberCount(party.memberCount)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <form className="parties-create" onSubmit={handleJoin}>
                <label htmlFor="join-party-code">{t.parties.joinLabel}</label>
                <div className="parties-row">
                  <input
                    id="join-party-code"
                    type="text"
                    value={joinInput}
                    placeholder={t.parties.joinPlaceholder}
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    onChange={(event) => setJoinInput(event.target.value)}
                  />
                  <button type="submit" disabled={busy || !joinInput.trim()}>
                    {t.parties.join.joinButton}
                  </button>
                </div>
                <p className="parties-muted">{t.parties.joinHelp}</p>
              </form>

              <form className="parties-create" onSubmit={handleCreate}>
                <label htmlFor="new-party-name">{t.parties.newPartyLabel}</label>
                <div className="parties-row">
                  <input
                    id="new-party-name"
                    type="text"
                    value={newName}
                    maxLength={100}
                    placeholder={t.parties.newPartyPlaceholder}
                    onChange={(event) => setNewName(event.target.value)}
                  />
                  <button type="submit" disabled={busy || !newName.trim()}>
                    {t.parties.create}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      )}
    </>
  )
}
