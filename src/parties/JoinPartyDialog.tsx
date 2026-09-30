import { useEffect, useState } from 'react'
import { partiesApi, type PartyInvite, type PublicUser } from '../api'
import { t } from '../i18n'
import { readInviteCode, removeInviteCodeFromUrl } from './inviteLink'

interface JoinPartyDialogProps {
  user: PublicUser | null
  checkingSession: boolean
  onJoined: () => void
}

type InviteState =
  | { status: 'loading' }
  | { status: 'ready'; invite: PartyInvite }
  | { status: 'invalid' }
  | { status: 'joined'; partyName: string }

// RII-45: opened by an invite link (?liity=<code>). Logged out, it asks the
// user to log in or sign up via the top bar, then continues by itself once
// they have. See docs/SPEC.md §9 "UI".
export function JoinPartyDialog({ user, checkingSession, onJoined }: JoinPartyDialogProps) {
  // Read once: the code is removed from the address bar when the dialog closes.
  const [code, setCode] = useState(() => readInviteCode())
  const [state, setState] = useState<InviteState>({ status: 'loading' })
  const [error, setError] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)

  const userId = user?.id
  useEffect(() => {
    if (!code || !userId) return
    let cancelled = false
    partiesApi.getInvite(code).then((result) => {
      if (cancelled) return
      setState(result.ok ? { status: 'ready', invite: result.value } : { status: 'invalid' })
    })
    return () => {
      cancelled = true
    }
  }, [code, userId])

  if (!code || checkingSession) return null

  function close() {
    removeInviteCodeFromUrl()
    setCode(null)
  }

  async function handleJoin() {
    if (!code) return
    setJoining(true)
    setError(null)
    const result = await partiesApi.join(code)
    setJoining(false)
    if (!result.ok) {
      setError(result.message)
      return
    }
    removeInviteCodeFromUrl()
    setState({ status: 'joined', partyName: result.value.name })
    onJoined()
  }

  let content
  if (!user) {
    content = <p>{t.parties.join.loginFirst}</p>
  } else if (state.status === 'loading') {
    content = <p>{t.parties.loading}</p>
  } else if (state.status === 'invalid') {
    content = <p className="form-error">{t.parties.join.invalid}</p>
  } else if (state.status === 'joined') {
    content = <p>{t.parties.join.joined(state.partyName)}</p>
  } else if (state.invite.alreadyMember) {
    content = <p>{t.parties.join.alreadyMember(state.invite.partyName)}</p>
  } else {
    content = (
      <>
        <p>{t.parties.join.invitedTo(state.invite.partyName)}</p>
        <p className="parties-muted">{t.parties.memberCount(state.invite.memberCount)}</p>
        {error && <p className="form-error">{error}</p>}
        <button type="button" className="track-save-button" disabled={joining} onClick={handleJoin}>
          {joining ? t.parties.join.joining : t.parties.join.joinButton}
        </button>
      </>
    )
  }

  return (
    <div className="join-dialog" role="dialog" aria-label={t.parties.join.title}>
      <div className="parties-panel-header">
        <strong>{t.parties.join.title}</strong>
        <button type="button" className="icon-button" aria-label={t.parties.close} onClick={close}>
          ✕
        </button>
      </div>
      {content}
    </div>
  )
}
