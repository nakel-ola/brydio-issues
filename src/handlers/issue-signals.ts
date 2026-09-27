import type { Handler, HandlerRecord } from '@brydio/app/handler';

interface SignalInput {
  project: string;
  issue: string;
  action: 'vote' | 'subscribe' | 'react';
  emoji?: string;
}

const collectionOf = { vote: 'votes', subscribe: 'subscriptions', react: 'reactions' } as const;

const toggleIssueSignal: Handler<SignalInput> = async ({ project, issue, action, emoji }, { caller, data }) => {
  if (action === 'react' && !emoji?.trim()) throw new Error('Choose a reaction.');
  const collection = collectionOf[action];
  const filter: Record<string, unknown> = { project, issue, member: caller.userId };

  if (action === 'react') filter.emoji = emoji!.trim();
  const page = await data.list(collection, { filter, limit: 10 });
  const current = page.items as HandlerRecord[];

  if (current.length > 0) {
    await Promise.all(current.map(record => data.remove(collection, record.id)));

    return { active: false, removed: current.length };
  }

  await data.create(collection, filter);

  return { active: true, created: 1 };
};

export default toggleIssueSignal;
