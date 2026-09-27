import type { Handler } from '@brydio/app/handler';

interface SprintChildrenInput {
  folder?: string;
  project?: string;
  parent?: string;
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
      sort: { field: 'start', dir: 'desc' },
      limit: 200,
      ...(cursor ? { cursor } : {}),
    });

    items.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor && items.length < 30);

  const rows = items.slice(0, 30).map(one => ({
    id: String(one.id),
    title: String(one.name ?? 'Untitled sprint'),
    subtitle: [one.start, one.end].filter(Boolean).join(' – ') || undefined,
    badge: typeof one.status === 'string' ? one.status : undefined,
  }));

  return rows.length
    ? { items: rows, total: items.length }
    : { items: [], empty: { title: 'No sprints yet', subtitle: 'Create the first sprint here.' } };
};

export default sprintChildren;
