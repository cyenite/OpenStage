import type { OperatorSnapshot, OutputStatus } from '@openstage/shared'

export function Header({ snapshot }: { snapshot: OperatorSnapshot }) {
  return (
    <header className="header">
      <div className="brand">OpenStage</div>
      <div className="service-title">
        <span className="service-name">{snapshot.service.name}</span>
        <span className="muted">Phase 0 demo service</span>
      </div>
      <div className="output-status" aria-label="Outputs">
        {snapshot.outputs.map((output) => (
          <OutputChip key={output.id} output={output} />
        ))}
      </div>
    </header>
  )
}

function OutputChip({ output }: { output: OutputStatus }) {
  const isInSync = output.isConnected && output.ackedSeq === output.sentSeq
  const status = !output.isConnected ? 'offline' : isInSync ? 'in sync' : 'updating'
  return (
    <span className={`chip chip-${status.replace(' ', '-')}`} title={`${output.name}: ${status}, frame ${output.ackedSeq}/${output.sentSeq}`}>
      <span className="dot" aria-hidden="true" />
      {output.name}
      <span className="visually-hidden">: {status}</span>
    </span>
  )
}
