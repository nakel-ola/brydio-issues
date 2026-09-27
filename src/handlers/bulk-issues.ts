import type { Handler } from '@brydio/app/handler';

interface BulkIssuesInput {
  project: string;
  action: 'update' | 'archive' | 'delete';
  ids: string[];
  fields?: string;
}

const bulkIssues: Handler<BulkIssuesInput> = async ({ project, action, ids, fields }, { data }) => {
  const unique = [...new Set(ids)].slice(0, 100);

  if (unique.length === 0) return { changed: 0 };

  const records = await Promise.all(unique.map(id => data.get('issues', id)));

  if (records.some(one => one.project !== project)) throw new Error('Every issue must belong to this project.');

  let update: Record<string, unknown> = {};

  if (action === 'update') {
    try {
      update = fields ? JSON.parse(fields) as Record<string, unknown> : {};
    } catch {
      throw new Error('Fields must be a JSON object.');
    }
  }

  const changes = records.map(one => action === 'delete'
    ? { op: 'delete', id: one.id, version: one.version }
    : {
        op: 'update',
        id: one.id,
        version: one.version,
        fields: action === 'archive' ? { archived: true } : update,
      });

  await data.batch('issues', changes);

  return { changed: changes.length };
};

export default bulkIssues;
