import { useEffect, useState, type FormEvent } from 'react'
import { partiesApi, type PartyDetail, type PartyMember, type PartyResult, type PublicUser } from '../api'
import { t } from '../i18n'
import { buildInviteLink } from './inviteLink'

interface PartyDetailViewProps {
  partyId: string
  user: PublicUser
  // The party's name/member count changed — refresh the list behind this view.
  onChanged: () => void
  // I left, or the party was deleted — go back to the list, reload the map.
  onLeftOrDeleted: () => void
}

// RII-45: one party inside the "Porukat" panel. Admin-only controls are only
// rendered for admins (the server enforces the same rules anyway).
export function PartyDetailView({ partyId, user, onChanged, onLeftOrDeleted }: PartyDetailViewProps) {
  const [party, setParty] = useState<PartyDetail | null>(null)
  const [nameDraft, setNameDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    partiesApi.get(partyId).then((result) => {
      if (cancelled) return
      if (result.ok) {
        setParty(result.value)
        setNameDraft(result.value.name)
      } else {
        setError(result.message)
      }
    })
    return () => {
      cancelled = true
    }
  }, [partyId])

  // Runs one API action; shows its Finnish error if it fails.
  async function run<T>(action: () => Promise<PartyResult<T>>): Promise<T | null> {
    setBusy(true)
    setError(null)
    const result = await action()
    setBusy(false)
    if (!result.ok) {
      setError(result.message)
      return null
    }
    return result.value
  }

  async function reload() {
    const detail = await run(() => partiesApi.get(partyId))
    if (detail) setParty(detail)
  }

  if (!party) return error ? null : <p>{t.parties.loading}</p>

  const isAdmin = party.myRole === 'admin'
  const inviteLink = party.inviteCode ? buildInviteLink(party.inviteCode) : null

  async function handleRename(event: FormEvent) {
    event.preventDefault()
    const updated = await run(() => partiesApi.rename(partyId, nameDraft))
    if (updated) {
      setParty(updated)
      onChanged()
    }
  }

  async function handleCopy() {
    if (!inviteLink) return
    try {
      await navigator.clipboard.writeText(inviteLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError(t.parties.errors.failed)
    }
  }

  async function handleShare() {
    if (!inviteLink || !party) return
    try {
      await navigator.share({ title: party.name, text: t.parties.shareText(party.name), url: inviteLink })
    } catch {
      // The user closed the share sheet — nothing to do.
    }
  }

  async function handleNewLink() {
    if (party?.inviteCode && !window.confirm(t.parties.confirmNewLink)) return
    const code = await run(() => partiesApi.regenerateInviteCode(partyId))
    if (code) setParty((current) => (current ? { ...current, inviteCode: code } : current))
  }

  async function handleDisableLink() {
    const done = await run(() => partiesApi.disableInviteCode(partyId))
    if (done !== null) setParty((current) => (current ? { ...current, inviteCode: null } : current))
  }

  async function handleRole(member: PartyMember) {
    const updated = await run(() =>
      partiesApi.setMemberRole(partyId, member.userId, member.role === 'admin' ? 'member' : 'admin'),
    )
    if (updated) setParty(updated)
  }

  async function handleRemove(member: PartyMember) {
    if (!window.confirm(t.parties.confirmRemove(member.displayName))) return
    const done = await run(() => partiesApi.removeMember(partyId, member.userId))
    if (done !== null) {
      await reload()
      onChanged()
    }
  }

  async function handleLeave() {
    if (!party || !window.confirm(t.parties.confirmLeave(party.name))) return
    const done = await run(() => partiesApi.removeMember(partyId, user.id))
    if (done !== null) onLeftOrDeleted()
  }

  async function handleDelete() {
    if (!party || !window.confirm(t.parties.confirmDelete(party.name))) return
    const done = await run(() => partiesApi.remove(partyId))
    if (done !== null) onLeftOrDeleted()
  }

  return (
    <div className="party-detail">
      {isAdmin ? (
        <form className="parties-row" onSubmit={handleRename}>
          <input
            type="text"
            aria-label={t.parties.name}
            value={nameDraft}
            maxLength={100}
            onChange={(event) => setNameDraft(event.target.value)}
          />
          <button type="submit" disabled={busy || !nameDraft.trim() || nameDraft.trim() === party.name}>
            {t.common.save}
          </button>
        </form>
      ) : (
        <p className="parties-name">{party.name}</p>
      )}

      <h3>{t.parties.members}</h3>
      <ul className="parties-members">
        {party.members.map((member) => (
          <li key={member.userId}>
            <span>
              {member.displayName} {member.userId === user.id && t.parties.you}
              <span className="parties-muted">
                {' '}
                · {member.role === 'admin' ? t.parties.roleAdmin : t.parties.roleMember}
              </span>
            </span>
            {isAdmin && member.userId !== user.id && (
              <span className="parties-row">
                <button type="button" className="link-button" disabled={busy} onClick={() => handleRole(member)}>
                  {member.role === 'admin' ? t.parties.makeMember : t.parties.makeAdmin}
                </button>
                <button type="button" className="link-button" disabled={busy} onClick={() => handleRemove(member)}>
                  {t.parties.remove}
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>

      {isAdmin && (
        <>
          <h3>{t.parties.inviteLink}</h3>
          {inviteLink ? (
            <>
              <p className="parties-muted">{t.parties.inviteHelp}</p>
              <input type="text" readOnly value={inviteLink} aria-label={t.parties.inviteLink} onFocus={(e) => e.target.select()} />
              <div className="parties-row">
                <button type="button" onClick={handleCopy}>
                  {copied ? t.parties.copied : t.parties.copy}
                </button>
                {'share' in navigator && (
                  <button type="button" onClick={handleShare}>
                    {t.parties.share}
                  </button>
                )}
                <button type="button" disabled={busy} onClick={handleNewLink}>
                  {t.parties.newLink}
                </button>
              </div>
              <button type="button" className="link-button" disabled={busy} onClick={handleDisableLink}>
                {t.parties.disableLink}
              </button>
            </>
          ) : (
            <>
              <p className="parties-muted">{t.parties.inviteDisabled}</p>
              <button type="button" disabled={busy} onClick={handleNewLink}>
                {t.parties.createLink}
              </button>
            </>
          )}
        </>
      )}

      {error && <p className="form-error">{error}</p>}

      <div className="parties-footer">
        <button type="button" disabled={busy} onClick={handleLeave}>
          {t.parties.leave}
        </button>
        {isAdmin && (
          <button type="button" className="danger-button" disabled={busy} onClick={handleDelete}>
            {t.parties.deleteParty}
          </button>
        )}
      </div>
    </div>
  )
}
