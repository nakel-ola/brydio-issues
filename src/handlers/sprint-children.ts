import type { Handler, HandlerRecord } from '@brydio/app/handler';

interface SprintChildrenInput {
  folder?: string;
  project?: string;
  parent?: string;
}

type Phase = 'active' | 'upcoming' | 'draft' | 'completed' | 'cancelled';
const ORDER: Record<Phase, number> = { active: 0, upcoming: 1, draft: 2, completed: 3, cancelled: 4 };

function phaseOf(sprint: HandlerRecord, today: string): Phase {
  if (sprint.status === 'draft' || sprint.status === 'completed' || sprint.status === 'cancelled') return sprint.status;
  if (typeof sprint.start === 'string' && today < sprint.start) return 'upcoming';
  if (typeof sprint.end === 'string' && today > sprint.end) return 'completed';

  return 'active';
}

export function sprintFolderRows(records: readonly HandlerRecord[], today: string) {
  return records
    .slice()
    .sort((left, right) => {
      const leftPhase = phaseOf(left, today);
      const rightPhase = phaseOf(right, today);

      return ORDER[leftPhase] - ORDER[rightPhase]
        || String(left.start ?? '9999').localeCompare(String(right.start ?? '9999'))
        || String(left.name ?? '').localeCompare(String(right.name ?? ''));
    })
    .slice(0, 30)
    .map(one => {
      const phase = phaseOf(one, today);

      return {
        id: String(one.id),
        title: String(one.name ?? 'Untitled sprint'),
        subtitle: [one.start, one.end].filter(Boolean).join(' – ') || `${phase[0]!.toUpperCase()}${phase.slice(1)} sprint`,
        badge: phase,
      };
    });
}

const sprintChildren: Handler<SprintChildrenInput> = async ({ project }, { data }) => {
  if (!project) {
    return {
      items: [],
      empty: { title: 'No project selected', subtitle: 'Add the Sprints folder under a Brydio project.' },
    };
  }

  const items: Record<string, unknown>[] = [];
  let cursor: string | undefined;

  do {
    const page = await data.list('sprints', {
      filter: { project },
      limit: 200,
      ...(cursor ? { cursor } : {}),
    });

    items.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor && items.length < 30);

  const rows = sprintFolderRows(items as HandlerRecord[], new Date().toISOString().slice(0, 10));

  return rows.length
    ? { items: rows, total: items.length }
    : { items: [], empty: { title: 'No sprints yet', subtitle: 'Create the first sprint here.' } };
};

export default sprintChildren;
