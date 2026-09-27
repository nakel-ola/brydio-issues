import type { Handler, HandlerRecord } from '@brydio/app/handler';

interface RelationsInput {
  project: string;
  issue: string;
  target: string;
  kind: 'blocks' | 'relates' | 'duplicates';
  remove?: boolean;
}

const REVERSE = { blocks: 'blocked_by', relates: 'relates', duplicates: 'duplicated_by' } as const;

async function existing(data: { list: HandlerDataList }, project: string, issue: string, target: string, kind: string) {
  const page = await data.list('relations', { filter: { project, issue, target, kind }, limit: 200 });

  return page.items;
}

type HandlerDataList = (
  collection: string,
  query?: { filter?: Record<string, unknown>; limit?: number },
) => Promise<{ items: HandlerRecord[]; nextCursor: string | null }>;

const manageRelations: Handler<RelationsInput> = async ({ project, issue, target, kind, remove }, { data }) => {
  if (issue === target) throw new Error('An issue cannot relate to itself.');

  const reverse = REVERSE[kind];
  const [forwardRows, reverseRows] = await Promise.all([
    existing(data, project, issue, target, kind),
    existing(data, project, target, issue, reverse),
  ]);

  if (remove) {
    await Promise.all([...forwardRows, ...reverseRows].map(one => data.remove('relations', one.id)));

    return { removed: forwardRows.length + reverseRows.length };
  }

  if (forwardRows.length === 0) await data.create('relations', { project, issue, target, kind });
  if (reverseRows.length === 0) await data.create('relations', { project, issue: target, target: issue, kind: reverse });

  return { related: true };
};

export default manageRelations;
