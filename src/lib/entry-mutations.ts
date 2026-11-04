// Reserve at the time of an optimistic action, before its undo timer expires.
// A dependent action commits the predecessor and waits for its acknowledgement.
export type EntryMutation<T> = {
  completion: Promise<T>;
  run: () => Promise<T>;
  cancel: () => boolean;
};

export class EntryMutations {
  private tails = new Map<number, EntryMutation<unknown>>();
  private aliases = new Map<number, number>();
  private pending = new Set<EntryMutation<unknown>>();

  private key(id: number): number {
    return this.aliases.get(id) ?? id;
  }

  identify(tempId: number, realId: number): void {
    // Keep queued and newly issued commands attached to the same identity.
    this.aliases.set(realId, this.key(tempId));
  }

  reserve<T>(ids: number[], execute: () => Promise<T>, onStart?: () => void): EntryMutation<T> {
    const keys = [...new Set(ids.map(id => this.key(id)))];
    const predecessors = new Map(keys.map(id => [id, this.tails.get(id)]));
    const previous = [...new Set(predecessors.values())].filter(Boolean) as EntryMutation<unknown>[];
    let resolveCompletion!: (value: T | PromiseLike<T>) => void;
    let rejectCompletion!: (error: unknown) => void;
    const completion = new Promise<T>((resolve, reject) => {
      resolveCompletion = resolve;
      rejectCompletion = reject;
    });
    void completion.catch(() => {});
    let started = false;
    let cancelled = false;
    let promise: Promise<T> | undefined;
    const cleanup = () => {
      this.pending.delete(operation);
      for (const id of keys) if (this.tails.get(id) === operation) this.tails.delete(id);
    };
    const operation: EntryMutation<T> = {
      completion,
      run: () => {
        if (!promise) {
          started = true;
          onStart?.();
          promise = Promise.all(previous.map(op => op.run())).then(() => {
            if (cancelled) throw new Error("Earlier entry change was undone");
            return execute();
          }).finally(cleanup);
          // Deferred operations can fail before their caller awaits them.
          void promise.then(resolveCompletion, rejectCompletion);
        }
        return promise;
      },
      cancel: () => {
        if (started || cancelled) return false;
        cancelled = true;
        this.pending.delete(operation);
        for (const id of keys) {
          if (this.tails.get(id) !== operation) continue;
          const predecessor = predecessors.get(id);
          if (predecessor && this.pending.has(predecessor)) this.tails.set(id, predecessor);
          else this.tails.delete(id);
        }
        return true;
      },
    };
    this.pending.add(operation);
    for (const id of keys) this.tails.set(id, operation);
    // Commit predecessors immediately so an earlier Undo cannot invalidate
    // the optimistic state used to construct this action.
    for (const predecessor of previous) void predecessor.run().catch(() => {});
    return operation;
  }

  commit(ids: number[]): void {
    for (const id of ids) void this.tails.get(this.key(id))?.run().catch(() => {});
  }

  run<T>(ids: number[], execute: () => Promise<T>): Promise<T> {
    return this.reserve(ids, execute).run();
  }
}

// Shared by the timeline and the description draft worker in this browser.
export const entryMutations = new EntryMutations();
