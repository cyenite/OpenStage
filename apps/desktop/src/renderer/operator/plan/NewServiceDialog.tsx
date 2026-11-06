import { useEffect, useRef, useState } from 'react'
import { newId, type Id, type ServiceTemplate } from '@openstage/shared'
import { dispatch } from '../engine'

interface NewServiceDialogProps {
  day: string
  templates: ServiceTemplate[]
  templateId: Id | null
  onClose: () => void
  onCreated: (serviceId: Id, day: string) => void
}

export function NewServiceDialog({ day, templates, templateId, onClose, onCreated }: NewServiceDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const initial = templates.find((t) => t.id === templateId) ?? templates[0]
  const [template, setTemplate] = useState<Id>(initial?.id ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [date, setDate] = useState(day)
  const [time, setTime] = useState(initial?.time ?? '09:00')

  useEffect(() => dialog.current?.showModal(), [])

  const pickTemplate = (id: Id) => {
    const next = templates.find((t) => t.id === id)
    if (next && (name === '' || templates.some((t) => t.name === name))) setName(next.name)
    if (next?.time) setTime(next.time)
    setTemplate(id)
  }

  return (
    <dialog ref={dialog} className="dialog new-service" aria-labelledby="new-service-title" onClose={onClose}>
      <form
        method="dialog"
        onSubmit={(event) => {
          event.preventDefault()
          const serviceId = newId(`${name} ${date}`)
          dispatch({ type: 'service.create', serviceId, name, date, time, ...(template && { templateId: template }) })
          onCreated(serviceId, date)
        }}
      >
        <h2 id="new-service-title">New service</h2>
        <label className="field">
          <span>Template</span>
          <select value={template} onChange={(e) => pickTemplate(e.target.value)}>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · {t.slots.length} items
              </option>
            ))}
            <option value="">Blank service</option>
          </select>
        </label>
        <label className="field">
          <span>Name</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="dialog-row">
          <label className="field">
            <span>Date</span>
            <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field">
            <span>Start time</span>
            <input type="time" required value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
        </div>
        <div className="dialog-actions">
          <button type="button" className="button-quiet" onClick={() => dialog.current?.close()}>
            Cancel
          </button>
          <button type="submit" className="button-primary" disabled={!name.trim() || !date || !time}>
            Create service
          </button>
        </div>
      </form>
    </dialog>
  )
}
