import type { Issue, Module, ProjectPlan, Sprint, State } from '../model/schemas.ts';

export const PROJECT_COLLECTIONS = [
  'issues', 'labels', 'states', 'sprints', 'modules', 'views', 'comments', 'reactions',
  'attachments', 'links', 'relations', 'subscriptions', 'votes', 'activity', 'project_plan',
] as const;

export interface ProjectData {
  issues: Issue[];
  states: State[];
  sprints: Sprint[];
  modules: Module[];
  plans: ProjectPlan[];
}

export const EMPTY_PROJECT_DATA: ProjectData = {
  issues: [],
  states: [],
  sprints: [],
  modules: [],
  plans: [],
};

export function scopeProjectData(projectId: string | undefined, data: ProjectData): ProjectData {
  if (!projectId) return data;

  return {
    issues: scopeProjectRecords(projectId, data.issues),
    states: scopeProjectRecords(projectId, data.states),
    sprints: scopeProjectRecords(projectId, data.sprints),
    modules: scopeProjectRecords(projectId, data.modules),
    plans: scopeProjectRecords(projectId, data.plans),
  };
}

export function scopeProjectRecords<T extends { project?: string | null }>(projectId: string, records: readonly T[]): T[] {
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
