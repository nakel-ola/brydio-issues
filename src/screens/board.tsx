import { ToolError, tools } from '@brydio/app';
import { mount, useBoard, useList, useRef, useState } from '@brydio/app/preact';

import { COLUMNS, dueText, reason, type Issue, type Status } from '../issues.ts';

/**
 * The Issues board (A8-F01).
 *
 * Three columns, To do, Doing and Done, drawn by Brydio's own board: a person
 * drags a card to another column, or picks it up with Space and moves it with
 * the arrow keys. A card shows the issue's title, when it is due and its
 * labels, and its actions menu deletes it. "New issue" opens a small form for
 * a title and an optional due date; the issue lands in To do.
 *
 * Brydio draws a moved card in its new place at once. The board answers by
 * writing the new status with `update_issue`, from the version it read, and
 * reading the list again, which renders the card there; if the write is
 * refused the card goes back and a line says why. A move from an old version
 * is refused as stale, and the board reads the issues again.
 *
 * The list is watched, so an issue somebody else makes or moves, in another
 * tab or through the assistant in a chat, shows without a reload. Every write
 * asks the person first, through Brydio, so the board doesn't ask again.
 */

/** Everything in one page: a board of more than two hundred issues wants windowed columns. */
const QUERY = { limit: 200 };

function Board() {
  const list = useList<Issue>('issues', QUERY, { watch: true });
  const keys = useBoard<string, Status>();
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The title being typed, or null while the form is closed.
  const [draft, setDraft] = useState<string | null>(null);
  const [due, setDue] = useState('');
  // Whether the list has been read once: later reads keep the board drawn.
  const loaded = useRef(false);

  if (!list.loading) loaded.current = true;

  const issues = list.items;
  const error = failed ?? (list.error ? `Couldn’t load the issues. ${reason(list.error)}` : null);

  /** Runs a write, then reads the list again. False when it didn't go through, with the reason on the error line. */
  const write = async (tool: string, input: Record<string, unknown>, words: string): Promise<boolean> => {
    setBusy(true);

    try {
      await tools.call(tool, input);
      setFailed(null);
      await list.refetch();

      return true;
    } catch (failure) {
      setFailed(`${words} ${reason(failure)}`);

      // Somebody else changed it: show the board as it is now, so the next
      // move starts from the right version.
      if (failure instanceof ToolError && failure.code === 'stale') await list.refetch();

      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    const title = draft?.trim() ?? '';

    if (!title) return;

    if (await write('create_issue', { title, status: 'todo', ...(due ? { due } : {}) }, 'Couldn’t add the issue.')) close();
  };

  const close = () => {
    setDraft(null);
    setDue('');
  };

  const remove = (issue: Issue) => write('delete_issue', { id: issue.id }, `Couldn’t delete “${issue.title}”.`);

  return (
    <bry-stack gap="4">
      <bry-stack direction="row" justify="between" align="center">
        <bry-heading level={1} text="Issues" />
        <bry-button label="New issue" variant="primary" disabled={busy || draft !== null} onPress={() => setDraft('')} />
      </bry-stack>
      {draft !== null && (
        <bry-card padding="3">
          <bry-stack direction="row" gap="2" align="end">
            <bry-input
              label="Title"
              placeholder="What needs doing?"
              value={draft}
              maxLength={200}
              required
              disabled={busy}
              onChange={event => setDraft(event.detail.value)}
              onSubmit={() => void add()}
            />
            <bry-date label="Due" placeholder="No due date" value={due} disabled={busy} onChange={event => setDue(event.detail.value)} />
            <bry-button label="Add" variant="primary" working={busy} disabled={!draft.trim()} onPress={() => void add()} />
            <bry-button label="Cancel" variant="ghost" disabled={busy} onPress={close} />
          </bry-stack>
        </bry-card>
      )}
      {error && <bry-text tone="danger" text={error} />}
      <bry-board
        label="Issues"
        cardSize="lg"
        loading={!loaded.current}
        onMove={async event => {
          const move = keys.read(event);
          const issue = move && issues.find(one => one.id === move.card);

          // Within a column there is no order to keep, so the card goes back where it was.
          if (!move || !issue || move.to === issue.status) {
            keys.refuse(event);

            return;
          }

          const moved = await write('update_issue', { id: issue.id, version: issue.version, status: move.to }, `Couldn’t move “${issue.title}”.`);

          if (!moved) keys.refuse(event);
        }}
      >
        {COLUMNS.map(column => {
          const cards = issues.filter(issue => issue.status === column.status);

          return (
            <bry-board-column key={column.status} ref={keys.column(column.status)} title={column.title} count={cards.length} empty="Nothing here.">
              {cards.map(issue => (
                <bry-card key={issue.id} ref={keys.card(issue.id)} padding="3">
                  <bry-stack gap="2">
                    <bry-stack direction="row" justify="between" align="start" gap="2">
                      <bry-text text={issue.title} />
                      <bry-menu
                        items={[{ id: 'delete', label: 'Delete', icon: 'trash', tone: 'danger' }]}
                        onSelect={event => event.detail.id === 'delete' && void remove(issue)}
                      >
                        <bry-button label={`Actions for ${issue.title}`.slice(0, 200)} icon="more" hideLabel variant="ghost" size="sm" disabled={busy} />
                      </bry-menu>
                    </bry-stack>
                    {issue.due && <bry-text tone="muted" size="sm" text={dueText(issue.due)} />}
                    {(issue.labels ?? []).length > 0 && (
                      <bry-stack direction="row" gap="1" wrap>
                        {(issue.labels ?? []).map(label => (
                          <bry-badge key={label} text={label} tone="neutral" />
                        ))}
                      </bry-stack>
                    )}
                  </bry-stack>
                </bry-card>
              ))}
            </bry-board-column>
          );
        })}
      </bry-board>
    </bry-stack>
  );
}

void mount(Board);
