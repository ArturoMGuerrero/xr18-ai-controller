import type { HistoryState } from '../../shared/types';

export interface Command {
  execute(): void;
  undo(): void;
  description: string;
  timestamp: Date;
}

/** Undo/redo for manual moves. Disabled (and cleared) while the AI is in control. */
export class CommandHistory {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private enabled = true;

  constructor(private readonly maxSize = 50) {}

  execute(command: Command): void {
    command.execute();
    if (!this.enabled) return;
    this.undoStack.push(command);
    if (this.undoStack.length > this.maxSize) this.undoStack.shift();
    this.redoStack = [];
  }

  undo(): HistoryState {
    const command = this.enabled ? this.undoStack.pop() : undefined;
    if (command) {
      command.undo();
      this.redoStack.push(command);
    }
    return this.state(command?.description ?? null);
  }

  redo(): HistoryState {
    const command = this.enabled ? this.redoStack.pop() : undefined;
    if (command) {
      command.execute();
      this.undoStack.push(command);
    }
    return this.state(command?.description ?? null);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.clear();
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  state(description: string | null = null): HistoryState {
    return {
      description,
      can_undo: this.enabled && this.undoStack.length > 0,
      can_redo: this.enabled && this.redoStack.length > 0,
    };
  }
}
