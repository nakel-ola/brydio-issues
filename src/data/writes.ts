import { ToolError, tools } from '@brydio/app';

export const writeReason = (error: unknown) => error instanceof Error ? error.message : String(error);

export async function versionedWrite<T>(tool: string, input: Record<string, unknown>, reload: () => Promise<void>): Promise<T> {
  try {
    return await tools.call<T>(tool, input);
  } catch (error) {
    if (error instanceof ToolError && error.code === 'stale') await reload();
    throw error;
  }
}

export class WriteQueue {
  private tail = Promise.resolve();
  private stale = false;

  enqueue<T>(write: () => Promise<T>): Promise<T> {
    if (this.stale) return Promise.reject(new Error('This issue changed. Reload it before saving again.'));

    const next = this.tail.then(write);
    this.tail = next.then(() => undefined, error => {
      if (error instanceof ToolError && error.code === 'stale') this.stale = true;
    });

    return next;
  }

  reset() { this.stale = false; }
}
