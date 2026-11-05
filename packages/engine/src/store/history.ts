/**
 * Undo for one open document as a log of commands over a base version, not a stack of snapshots:
 * undo replays the log minus its last command. Past the limit the oldest command folds into the base.
 */
export class DocumentHistory<D, C> {
  private base: D
  private current: D
  private done: C[] = []
  private undone: C[] = []

  constructor(
    document: D,
    private readonly apply: (document: D, command: C) => D,
    private readonly limit = 200,
  ) {
    this.base = document
    this.current = document
  }

  get document(): D {
    return this.current
  }

  get canUndo(): boolean {
    return this.done.length > 0
  }

  get canRedo(): boolean {
    return this.undone.length > 0
  }

  /** Returns false, and records nothing, when the command changes nothing. */
  execute(command: C): boolean {
    const next = this.apply(this.current, command)
    if (next === this.current) return false
    this.current = next
    this.done.push(command)
    this.undone = []
    if (this.done.length > this.limit) this.base = this.apply(this.base, this.done.shift()!)
    return true
  }

  undo(): boolean {
    const command = this.done.pop()
    if (command === undefined) return false
    this.undone.push(command)
    this.current = this.done.reduce((document, c) => this.apply(document, c), this.base)
    return true
  }

  redo(): boolean {
    const command = this.undone.pop()
    if (command === undefined) return false
    this.done.push(command)
    this.current = this.apply(this.current, command)
    return true
  }
}
