/**
 * Sync Queue Manager
 *
 * Handles queueing of operations on time entries with temporary IDs.
 * Ensures operations are executed in order after the real ID is received from the server.
 * Prevents race conditions where edits happen before entry creation completes.
 */

export type OperationType =
  | 'UPDATE_DESCRIPTION'
  | 'UPDATE_PROJECT'
  | 'UPDATE_TAGS'
  | 'UPDATE_TIME'
  | 'UPDATE_DURATION'
  | 'UPDATE_BULK'
  | 'DELETE'
  | 'STOP';

export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'error';

export interface QueuedOperation {
  type: OperationType;
  tempId: number;
  payload: Record<string, unknown>;
  retryCount: number;
  timestamp: number;
  execute: (realId: number) => Promise<void>;
}

export interface OperationResult {
  success: boolean;
  error?: string;
}

/**
 * Manager for queuing and executing operations on time entries
 */
export class SyncQueueManager {
  // Map of temp ID -> array of queued operations
  private queue: Map<number, QueuedOperation[]> = new Map();

  // Map of temp ID -> real ID (once known)
  private idMap: Map<number, number> = new Map();

  // Map of entry ID -> sync status
  private syncStatusMap: Map<number, SyncStatus> = new Map();

  // Retry configuration
  private maxRetries = 3;
  private baseRetryDelay = 1000; // 1 second

  /**
   * Check if an ID is a temporary ID (negative number)
   */
  isTempId(id: number): boolean {
    return id < 0;
  }

  /**
   * Get the real ID for a temp ID, if known
   */
  getRealId(tempId: number): number | null {
    return this.idMap.get(tempId) ?? null;
  }

  /**
   * Register a mapping from temp ID to real ID
   * This also moves all queued operations from temp ID to real ID
   */
  registerIdMapping(tempId: number, realId: number): void {
    console.log(`[SyncQueue] Mapping temp ID ${tempId} -> real ID ${realId}`);
    this.idMap.set(tempId, realId);

    // Move queued operations from temp ID to real ID key
    const queuedOps = this.queue.get(tempId);
    if (queuedOps && queuedOps.length > 0) {
      console.log(`[SyncQueue] Moving ${queuedOps.length} queued operations from temp ID ${tempId} to real ID ${realId}`);
      // Update the tempId field in each operation to reference the real ID
      queuedOps.forEach(op => {
        op.tempId = realId;
      });
      // Re-key the queue map to use real ID instead of temp ID
      this.queue.set(realId, queuedOps);
      this.queue.delete(tempId);
    }

    // Move sync status from temp ID to real ID
    const tempStatus = this.syncStatusMap.get(tempId);
    if (tempStatus) {
      this.syncStatusMap.set(realId, tempStatus === 'pending' ? 'syncing' : tempStatus);
      this.syncStatusMap.delete(tempId);
    } else {
      this.setSyncStatus(realId, 'syncing');
    }
  }

  /**
   * Add an operation to the queue for a temp ID
   */
  queueOperation(operation: QueuedOperation): void {
    const { tempId, type } = operation;

    console.log(`[SyncQueue] Queueing operation ${type} for temp ID ${tempId}`);

    if (!this.queue.has(tempId)) {
      this.queue.set(tempId, []);
    }

    const operations = this.queue.get(tempId)!;

    // Merge/deduplicate operations where possible
    const mergedOperations = this.mergeOperations(operations, operation);
    this.queue.set(tempId, mergedOperations);

    // Update sync status to pending
    this.setSyncStatus(tempId, 'pending');
  }

  /**
   * Merge new operation with existing operations to avoid redundant API calls
   */
  private mergeOperations(
    existing: QueuedOperation[],
    newOp: QueuedOperation
  ): QueuedOperation[] {
    // For UPDATE_BULK, check if we can merge with previous bulk update
    if (newOp.type === 'UPDATE_BULK') {
      const lastBulkIndex = existing.findLastIndex(op => op.type === 'UPDATE_BULK');

      if (lastBulkIndex !== -1) {
        // Merge payloads
        const merged = {
          ...existing[lastBulkIndex],
          payload: {
            ...existing[lastBulkIndex].payload,
            ...newOp.payload,
          },
          timestamp: newOp.timestamp,
          execute: newOp.execute,
        };

        const result = [...existing];
        result[lastBulkIndex] = merged;
        console.log(`[SyncQueue] Merged bulk operations for temp ID ${newOp.tempId}`);
        return result;
      }
    }

    // For individual field updates, merge with existing UPDATE_BULK if present
    if (
      newOp.type === 'UPDATE_DESCRIPTION' ||
      newOp.type === 'UPDATE_PROJECT' ||
      newOp.type === 'UPDATE_TAGS'
    ) {
      const lastBulkIndex = existing.findLastIndex(op => op.type === 'UPDATE_BULK');

      if (lastBulkIndex !== -1) {
        // Merge into bulk update
        const fieldName =
          newOp.type === 'UPDATE_DESCRIPTION' ? 'description' :
          newOp.type === 'UPDATE_PROJECT' ? 'projectName' :
          'tags';

        const merged = {
          ...existing[lastBulkIndex],
          payload: {
            ...existing[lastBulkIndex].payload,
            [fieldName]: newOp.payload[fieldName],
          },
          timestamp: newOp.timestamp,
          execute: existing[lastBulkIndex].execute, // Keep the bulk execute function
        };

        const result = [...existing];
        result[lastBulkIndex] = merged;
        console.log(`[SyncQueue] Merged ${newOp.type} into bulk update for temp ID ${newOp.tempId}`);
        return result;
      }
    }

    // No merge possible, append
    return [...existing, newOp];
  }

  /**
   * Flush all queued operations for a temp ID using its real ID
   * Note: registerIdMapping should be called first, which moves operations to realId key
   */
  async flushOperations(tempId: number, realId: number): Promise<OperationResult[]> {
    // After registerIdMapping, operations are under the real ID key
    const operations = this.queue.get(realId) || this.queue.get(tempId);

    if (!operations || operations.length === 0) {
      console.log(`[SyncQueue] No operations to flush for temp ID ${tempId} / real ID ${realId}`);
      this.setSyncStatus(realId, 'synced');
      return [];
    }

    console.log(`[SyncQueue] Flushing ${operations.length} operation(s) for real ID ${realId}`);

    this.setSyncStatus(realId, 'syncing');

    const results: OperationResult[] = [];

    for (const operation of operations) {
      try {
        await operation.execute(realId);
        results.push({ success: true });
        console.log(`[SyncQueue] Successfully executed ${operation.type} for ID ${realId}`);
      } catch (error) {
        console.error(`[SyncQueue] Failed to execute ${operation.type} for ID ${realId}:`, error);

        // Retry logic
        if (operation.retryCount < this.maxRetries) {
          const delay = this.baseRetryDelay * Math.pow(2, operation.retryCount);
          console.log(`[SyncQueue] Retrying ${operation.type} after ${delay}ms (attempt ${operation.retryCount + 1}/${this.maxRetries})`);

          await new Promise(resolve => setTimeout(resolve, delay));

          try {
            operation.retryCount++;
            await operation.execute(realId);
            results.push({ success: true });
            console.log(`[SyncQueue] Retry successful for ${operation.type}`);
          } catch (retryError) {
            console.error(`[SyncQueue] Retry failed for ${operation.type}:`, retryError);
            results.push({
              success: false,
              error: retryError instanceof Error ? retryError.message : 'Unknown error'
            });
            this.setSyncStatus(realId, 'error');
          }
        } else {
          results.push({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          this.setSyncStatus(realId, 'error');
        }
      }
    }

    // Check if all operations succeeded
    const allSucceeded = results.every(r => r.success);

    if (allSucceeded) {
      this.setSyncStatus(realId, 'synced');
      // Clean up queue - operations might be under real ID or temp ID
      this.queue.delete(realId);
      this.queue.delete(tempId);
      console.log(`[SyncQueue] All operations completed successfully for ID ${realId}`);
    }

    return results;
  }

  /**
   * Get sync status for an entry (works with both temp and real IDs)
   */
  getSyncStatus(id: number): SyncStatus {
    // If it's a temp ID, check if we have a real ID mapping
    if (this.isTempId(id)) {
      const realId = this.getRealId(id);
      if (realId) {
        return this.syncStatusMap.get(realId) ?? 'synced';
      }
      // Check if there are queued operations
      const hasQueuedOps = this.queue.has(id) && this.queue.get(id)!.length > 0;
      return hasQueuedOps ? 'pending' : 'synced';
    }

    return this.syncStatusMap.get(id) ?? 'synced';
  }

  /**
   * Set sync status for an entry
   */
  setSyncStatus(id: number, status: SyncStatus): void {
    this.syncStatusMap.set(id, status);
  }

  /**
   * Clear sync status for an entry
   */
  clearSyncStatus(id: number): void {
    this.syncStatusMap.delete(id);
  }

  /**
   * Check if an entry has pending operations
   */
  hasPendingOperations(id: number): boolean {
    // Check if there are operations queued under this ID (temp or real)
    if (this.queue.has(id) && this.queue.get(id)!.length > 0) {
      return true;
    }

    // If this is a real ID, check if it was mapped from a temp ID
    if (!this.isTempId(id)) {
      for (const [, realId] of this.idMap.entries()) {
        if (realId === id && this.queue.has(realId) && this.queue.get(realId)!.length > 0) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Retry failed operations for an entry
   */
  async retryFailedOperations(id: number): Promise<OperationResult[]> {
    console.log(`[SyncQueue] Retrying failed operations for ID ${id}`);

    // Operations are now stored under the real ID after registerIdMapping
    // Reset retry counts
    const operations = this.queue.get(id);
    if (!operations || operations.length === 0) {
      console.log(`[SyncQueue] No operations found for ID ${id}`);
      return [];
    }

    operations.forEach(op => op.retryCount = 0);

    // Find the temp ID that maps to this real ID (for logging purposes)
    let tempId: number = id;
    for (const [tId, rId] of this.idMap.entries()) {
      if (rId === id) {
        tempId = tId;
        break;
      }
    }

    // Flush operations again
    return this.flushOperations(tempId, id);
  }

  /**
   * Clear all queued operations (useful for cleanup/reset)
   */
  clear(): void {
    this.queue.clear();
    this.idMap.clear();
    this.syncStatusMap.clear();
  }

  /**
   * Get queue size for debugging
   */
  getQueueSize(): number {
    let total = 0;
    for (const ops of this.queue.values()) {
      total += ops.length;
    }
    return total;
  }

  /**
   * Get debug info
   */
  getDebugInfo(): {
    queueSize: number;
    idMappings: number;
    syncStatuses: number;
    queuedEntries: number[];
  } {
    return {
      queueSize: this.getQueueSize(),
      idMappings: this.idMap.size,
      syncStatuses: this.syncStatusMap.size,
      queuedEntries: Array.from(this.queue.keys()),
    };
  }
}

// Create a singleton instance for the app
export const syncQueue = new SyncQueueManager();
