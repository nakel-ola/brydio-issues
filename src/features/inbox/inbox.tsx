import { navigate, tools } from '@brydio/app';
import type { BryEvent } from '@brydio/ui';
import { useState } from '@brydio/app/preact';

import { issueIdentifier } from '../../model/issues.ts';
import type { Issue, State } from '../../model/schemas.ts';

export function Inbox({ projectName, issues, refresh }: {
  projectName: string;
  issues: readonly Issue[];
  refresh: () => Promise<void>;
}) {
  const inbox = issues.filter(one => one.inbox && one.inbox !== 'none' && !one.archived);
  const targets = issues.filter(one => !one.archived && !one.draft);
  const [duplicate, setDuplicate] = useState(targets[0]?.id ?? '');
  const [snoozeUntil, setSnoozeUntil] = useState('');
  const [error, setError] = useState<string | null>(null);

  const decide = async (issue: Issue, action: 'accept' | 'decline' | 'snooze' | 'duplicate') => {
    setError(null);
    try {
      if (action === 'duplicate') {
        if (!duplicate || duplicate === issue.id) throw new Error('Choose a different issue as the duplicate target.');
        await tools.call('manage_relations', { project: issue.project, issue: issue.id, target: duplicate, kind: 'duplicates' });
      }
      const fields = action === 'accept'
        ? { inbox: 'none', inbox_until: null, draft: false }
        : action === 'decline' ? { inbox: 'declined', inbox_until: null }
          : action === 'snooze' ? { inbox: 'snoozed', inbox_until: snoozeUntil || null }
            : { inbox: 'none', inbox_until: null };
      await tools.call('update_issue', { id: issue.id, version: issue.version, ...fields });
      await refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };

  return (
    <bry-stack gap="4">
      <bry-heading level={1} text="Inbox" />
      {error && <bry-alert tone="danger" title="Couldn’t update the inbox" description={error} />}
      {inbox.length === 0 ? <bry-empty-state title="Inbox zero" text="There are no issue decisions waiting." /> : inbox.map(issue => (
        <bry-card key={issue.id} padding="3">
          <bry-stack gap="2">
            <bry-list-row title={issue.title} description={issueIdentifier(issue, projectName)} meta={issue.inbox ?? undefined} pressable onPress={() => void navigate({ kind: 'item', id: issue.id })} />
            <bry-stack direction="row" gap="2" wrap>
              <bry-button label="Accept" variant="primary" onPress={() => void decide(issue, 'accept')} />
              <bry-button label="Decline" onPress={() => void decide(issue, 'decline')} />
              <bry-date label="Snooze until" value={snoozeUntil || undefined} onChange={(event: BryEvent<{ value: string }>) => setSnoozeUntil(event.detail.value)} />
              <bry-button label="Snooze" onPress={() => void decide(issue, 'snooze')} />
              <bry-select label="Duplicate of" value={duplicate} options={targets.filter(one => one.id !== issue.id).map(one => ({ value: one.id, label: one.title }))} onChange={(event: BryEvent<{ value: string }>) => setDuplicate(event.detail.value)} />
              <bry-button label="Mark duplicate" onPress={() => void decide(issue, 'duplicate')} />
            </bry-stack>
          </bry-stack>
        </bry-card>
      ))}
    </bry-stack>
  );
}

export function Drafts({ projectName, issues, states, refresh }: {
  projectName: string;
  issues: readonly Issue[];
  states: readonly State[];
  refresh: () => Promise<void>;
}) {
  const drafts = issues.filter(one => one.draft && !one.archived);
  const defaultState = states.find(one => one.group === 'unstarted') ?? states[0];
  const [selected, setSelected] = useState<string | null>(null);
  const draft = drafts.find(one => one.id === selected);
  const [title, setTitle] = useState('');
  const [state, setState] = useState(defaultState?.id ?? '');
  const [error, setError] = useState<string | null>(null);

  const promote = async () => {
    if (!draft || !title.trim() || !state) return;
    setError(null);
    try {
      await tools.call('update_issue', { id: draft.id, version: draft.version, title: title.trim(), state, draft: false, inbox: 'none' });
      setSelected(null); setTitle('');
      await refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };

  return (
    <bry-stack gap="4">
      <bry-heading level={1} text="Drafts" />
      {error && <bry-alert tone="danger" title="Couldn’t promote the draft" description={error} />}
      {draft && (
        <bry-card padding="3">
          <bry-stack gap="2">
            <bry-input label="Draft title" value={title} required onChange={(event: BryEvent<{ value: string }>) => setTitle(event.detail.value)} />
            <bry-select label="Draft state" value={state} options={states.map(one => ({ value: one.id, label: one.name }))} onChange={(event: BryEvent<{ value: string }>) => setState(event.detail.value)} />
            <bry-button label="Promote draft" variant="primary" disabled={!title.trim() || !state} onPress={() => void promote()} />
          </bry-stack>
        </bry-card>
      )}
      {drafts.length === 0 ? <bry-empty-state title="No drafts" text="Draft issues will appear here until they are promoted." /> : drafts.map(one => (
        <bry-list-row key={one.id} title={one.title || 'Untitled draft'} description={issueIdentifier(one, projectName)} meta="Draft" pressable onPress={() => { setSelected(one.id); setTitle(one.title ?? ''); setState(one.state ?? defaultState?.id ?? ''); }} />
      ))}
    </bry-stack>
  );
}
