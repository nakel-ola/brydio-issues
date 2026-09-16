import { ToolError, tools } from '@brydio/app';
import { useEffect, useList, useRef, useState } from '@brydio/app/preact';

import { COLUMNS, dueText, reason, type Issue, type Status } from '../issues.ts';

/**
 * One issue, opened from its card (A8-F01-S03).
 *
 * Every field saves on its own, with no Save button: the status, the due date
 * and the labels as soon as they change, the title and the description a
 * moment after the typing stops (or at once on Enter). Saves go one after
 * another from the version the last one returned, so a burst of changes is
 * never refused by itself.
 *
 * What another person changed meanwhile is not taken in quietly: the view
 * keeps the version it read, so a save after somebody else's is refused as
 * stale, and the view says "Someone else changed this; reload to see" with a
 * Reload button, rather than writing over their change.
 */

/** How long after the last keystroke a title or description is saved. */
export const TYPING_PAUSE_MS = 600;

/** The labels collection: a name and a colour token. */
interface Label {
  id: string;
  name: string;
  colour: 'neutral' | 'brand' | 'success' | 'warn' | 'danger';
}

export const STALE = 'Someone else changed this; reload to see.';

export function IssueView({ id, onBack }: { id: string; onBack: () => void }) {
  const [issue, setIssue] = useState<Issue | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [saving, setSaving] = useState(0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [editingBody, setEditingBody] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const labels = useList<Label>('labels', { limit: 200 }, { watch: true });
  // The version the next save starts from, and the saves waiting their turn.
  const version = useRef(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const load = async () => {
    try {
      const read = await tools.call<Issue>('get_issue', { id });

      version.current = read.version;
      setIssue(read);
      setTitle(read.title);
      setBody(read.body ?? '');
      setStale(false);
      setFailed(null);
    } catch (failure) {
      setFailed(`Couldn’t open the issue. ${reason(failure)}`);
    }
  };

  useEffect(() => {
    void load();

    return () => {
      for (const timer of timers.current.values()) clearTimeout(timer);
    };
  }, [id]);

  /** Saves some fields, after any save already on its way. */
  const save = (fields: Partial<Issue>) => {
    const run = async () => {
      if (stale) return;

      setSaving(count => count + 1);

      try {
        const saved = await tools.call<Issue>('update_issue', { id, version: version.current, ...fields });

        version.current = saved.version;
        setIssue(saved);
        setFailed(null);
      } catch (failure) {
        if (failure instanceof ToolError && failure.code === 'stale') setStale(true);
        else setFailed(`Couldn’t save. ${reason(failure)}`);
      } finally {
        setSaving(count => count - 1);
      }
    };

    queue.current = queue.current.then(run, run);

    return queue.current;
  };

  /** Saves a typed field once the typing pauses. */
  const later = (field: 'title' | 'body', value: string) => {
    clearTimeout(timers.current.get(field));
    timers.current.set(
      field,
      setTimeout(() => {
        timers.current.delete(field);
        void save(field === 'title' ? { title: value } : { body: value || null } as Partial<Issue>);
      }, TYPING_PAUSE_MS),
    );
  };

  const now = (field: 'title' | 'body', value: string) => {
    clearTimeout(timers.current.get(field));
    timers.current.delete(field);

    return save(field === 'title' ? { title: value } : ({ body: value || null } as Partial<Issue>));
  };

  const back = (
    <bry-stack direction="row" gap="2" align="center">
      <bry-button label="Back to the board" variant="ghost" size="sm" onPress={onBack} />
      {saving > 0 && <bry-text tone="muted" size="sm" text="Saving…" />}
    </bry-stack>
  );

  if (!issue) {
    return (
      <bry-stack gap="3">
        {back}
        {failed ? <bry-text tone="danger" text={failed} /> : <bry-skeleton shape="block" count={3} />}
      </bry-stack>
    );
  }

  const chosen = new Set(issue.labels ?? []);
  const setLabels = (names: string[]) => save({ labels: names });

  return (
    <bry-stack gap="4">
      {back}
      {stale && (
        <bry-card padding="3">
          <bry-stack direction="row" justify="between" align="center" gap="2">
            <bry-text tone="danger" text={STALE} />
            <bry-button label="Reload" variant="secondary" size="sm" onPress={() => void load()} />
          </bry-stack>
        </bry-card>
      )}
      {failed && <bry-text tone="danger" text={failed} />}
      <bry-input
        label="Title"
        value={title}
        maxLength={200}
        required
        disabled={stale}
        onChange={event => {
          setTitle(event.detail.value);
          if (event.detail.value.trim()) later('title', event.detail.value);
        }}
        onSubmit={event => void (event.detail.value.trim() && now('title', event.detail.value))}
      />
      <bry-stack direction="row" gap="3" wrap>
        <bry-select
          label="Status"
          value={issue.status}
          options={COLUMNS.map(column => ({ value: column.status, label: column.title }))}
          disabled={stale}
          onChange={event => void save({ status: event.detail.value as Status })}
        />
        <bry-date
          label="Due"
          placeholder="No due date"
          value={issue.due ?? ''}
          disabled={stale}
          onChange={event => void save({ due: event.detail.value || null } as Partial<Issue>)}
        />
        {issue.due && <bry-text tone="muted" size="sm" text={dueText(issue.due)} />}
      </bry-stack>
      <bry-label text="Description">
        {editingBody ? (
          <bry-stack gap="2">
            <bry-textarea
              value={body}
              placeholder="What needs doing, and why"
              maxLength={4000}
              disabled={stale}
              onChange={event => {
                setBody(event.detail.value);
                later('body', event.detail.value);
              }}
            />
            <bry-button
              label="Done"
              variant="secondary"
              size="sm"
              onPress={() => {
                setEditingBody(false);
                void now('body', body);
              }}
            />
          </bry-stack>
        ) : (
          <bry-stack gap="2">
            {issue.body ? <bry-markdown text={issue.body} /> : <bry-text tone="muted" text="No description yet." />}
            <bry-button label="Edit description" variant="ghost" size="sm" disabled={stale} onPress={() => setEditingBody(true)} />
          </bry-stack>
        )}
      </bry-label>
      <bry-label text="Labels">
        <bry-stack gap="2">
          {labels.items.length === 0 && !labels.loading && <bry-text tone="muted" size="sm" text="No labels yet." />}
          {[...labels.items].sort((a, b) => a.name.localeCompare(b.name)).map(label => (
            <bry-checkbox
              key={label.id}
              label={label.name}
              checked={chosen.has(label.name)}
              disabled={stale}
              onChange={event =>
                void setLabels(event.detail.checked ? [...chosen, label.name] : [...chosen].filter(name => name !== label.name))
              }
            />
          ))}
          <bry-stack direction="row" gap="2" align="end">
            <bry-input label="New label" placeholder="bug, design…" value={newLabel} maxLength={60} disabled={stale} onChange={event => setNewLabel(event.detail.value)} />
            <bry-button
              label="Add label"
              variant="secondary"
              size="sm"
              disabled={stale || !newLabel.trim() || labels.items.some(label => label.name === newLabel.trim())}
              onPress={async () => {
                const name = newLabel.trim();

                try {
                  await tools.call('create_label', { name, colour: 'neutral' });
                  setNewLabel('');
                  await labels.refetch();
                  await setLabels([...chosen, name]);
                } catch (failure) {
                  setFailed(`Couldn’t add the label. ${reason(failure)}`);
                }
              }}
            />
          </bry-stack>
        </bry-stack>
      </bry-label>
    </bry-stack>
  );
}
