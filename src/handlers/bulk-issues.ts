import type { Handler } from '@brydio/app/handler';

interface BulkIssuesInput {
  project: string;
  action: 'update' | 'archive' | 'delete';
  ids: string[];
  fields?: string;
}

const bulkIssues: Handler<BulkIssuesInput> = async ({ project, action, ids, fields }, { data }) => {
  if (ids.length > 100) throw new Error('Bulk actions accept at most 100 issues.');
  const unique = [...new Set(ids)];

  if (unique.length !== ids.length) throw new Error('Each issue may appear only once.');

  if (unique.length === 0) return { updated: 0, archived: 0, deleted: 0 };

  const records = await Promise.all(unique.map(id => data.get('issues', id)));

  if (records.some(one => one.project !== project)) throw new Error('Every issue must belong to this project.');

  let update: Record<string, unknown> = {};

  if (action === 'update') {
    try {
      update = fields ? JSON.parse(fields) as Record<string, unknown> : {};
    } catch {
      throw new Error('Fields must be a JSON object.');
    }

    if (!update || Array.isArray(update) || typeof update !== 'object') throw new Error('Fields must be a JSON object.');
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

  return {
    updated: action === 'update' ? changes.length : 0,
    archived: action === 'archive' ? changes.length : 0,
    deleted: action === 'delete' ? changes.length : 0,
  };
};

export default bulkIssues;
