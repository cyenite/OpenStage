import { useEffect, useRef, useState } from 'react'
import { ask, dispatch } from '../engine'

const isPin = (pin: string) => /^\d{4,8}$/.test(pin)

function PinInput({ label, value, onChange, autoFocus = false }: { label: string; value: string; onChange: (pin: string) => void; autoFocus?: boolean }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        className="pin-input"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        autoFocus={autoFocus}
        maxLength={8}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
      />
    </label>
  )
}

/** Locks to volunteer mode; the first time it sets the PIN, later it can change it. */
export function VolunteerDialog({ hasPin, onClose }: { hasPin: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [isChanging, setChanging] = useState(!hasPin)
  const [pin, setPin] = useState('')
  const [again, setAgain] = useState('')
  useEffect(() => dialog.current?.showModal(), [])
  const isValid = isPin(pin) && pin === again
  const submit = () => {
    if (hasPin && !isChanging) dispatch({ type: 'volunteer.lock' })
    else if (hasPin) dispatch({ type: 'volunteer.setPin', pin })
    else dispatch({ type: 'volunteer.lock', pin })
    dialog.current?.close()
  }
  return (
    <dialog ref={dialog} className="dialog pin-dialog" aria-labelledby="volunteer-title" onClose={onClose}>
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <h2 id="volunteer-title">Volunteer mode</h2>
        <p className="muted">
          A simple screen with the service, what is on screen, and big Next, Previous and Clear buttons. Nothing can be edited or deleted until someone unlocks it with the PIN.
        </p>
        {isChanging && (
          <>
            <PinInput label={hasPin ? 'New PIN, 4 to 8 digits' : 'Choose a PIN, 4 to 8 digits'} value={pin} onChange={setPin} autoFocus />
            <PinInput label="The same PIN again" value={again} onChange={setAgain} />
            {again && pin !== again && <small className="import-reason is-error">The two PINs are different.</small>}
          </>
        )}
        <div className="dialog-actions">
          {hasPin && !isChanging && (
            <button type="button" className="button-quiet" onClick={() => setChanging(true)}>
              Change PIN
            </button>
          )}
          <button type="button" className="button-quiet" onClick={() => dialog.current?.close()}>
            Cancel
          </button>
          <button type="submit" className="button-primary" disabled={isChanging && !isValid}>
            {!hasPin ? 'Set PIN and lock' : isChanging ? 'Save new PIN' : 'Lock now'}
          </button>
        </div>
      </form>
    </dialog>
  )
}

export function UnlockDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  useEffect(() => dialog.current?.showModal(), [])
  const unlock = async () => {
    const result = await ask({ type: 'volunteer.unlock', pin })
    if (result.type !== 'unlock') return
    if (result.isUnlocked) return dialog.current?.close()
    setPin('')
    setError(result.waitSeconds > 0 ? `Too many wrong PINs. Try again in ${result.waitSeconds} seconds.` : 'That PIN is not right.')
  }
  return (
    <dialog ref={dialog} className="dialog pin-dialog" aria-labelledby="unlock-title" onClose={onClose}>
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault()
          void unlock()
        }}
      >
        <h2 id="unlock-title">Unlock the full app</h2>
        <PinInput label="PIN" value={pin} onChange={setPin} autoFocus />
        {error && <small className="import-reason is-error">{error}</small>}
        <div className="dialog-actions">
          <button type="button" className="button-quiet" onClick={() => dialog.current?.close()}>
            Cancel
          </button>
          <button type="submit" className="button-primary" disabled={!isPin(pin)}>
            Unlock
          </button>
        </div>
      </form>
    </dialog>
  )
}
