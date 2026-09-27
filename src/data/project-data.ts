export const PROJECT_COLLECTIONS = [
  'issues', 'labels', 'states', 'sprints', 'modules', 'views', 'comments', 'reactions',
  'attachments', 'links', 'relations', 'subscriptions', 'votes', 'activity', 'project_plan',
] as const;

export function scopeProjectRecords<T extends { project?: string }>(projectId: string, records: readonly T[]): T[] {
  return records.filter(record => record.project === projectId);
}

/** One active refresh and at most one trailing refresh for any watch burst. */
export class RefreshQueue {
  private running: Promise<void> | null = null;
  private again = false;

  constructor(private readonly refresh: () => Promise<void>) {}

  request(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }

    this.running = (async () => {
      do {
        this.again = false;
        await this.refresh();
      } while (this.again);
      this.running = null;
    })();

    return this.running;
  }
}
