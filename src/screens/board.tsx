import { ToolError, navigate, tools } from '@brydio/app';
import { mount, useBoard, useHost, useList, useMembers, useRef, useState } from '@brydio/app/preact';

import { COLUMNS, columnIssues, dueText, placeCard, rankAfterLast, reason, type Issue, type Status } from '../issues.ts';
import { IssueView } from './issue-view.tsx';

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
 *
 * Pressing a card opens the issue in the same tab: the board asks Brydio to
 * open the item (`ui/navigate`), and Brydio makes it the screen's selection,
 * which is what an address or a shared link would name. Back returns to the
 * board.
 */

/** The item the host says is selected, if it is one of ours. */
function selectedItem(selection: unknown): string | null {
  const item = selection as { kind?: unknown; id?: unknown } | null | undefined;

  return item?.kind === 'item' && typeof item.id === 'string' ? item.id : null;
}

function Screen() {
  const selected = selectedItem(useHost().selection);
  const [open, setOpen] = useState<string | null>(selected);
  const seen = useRef(selected);

  // A selection the host changes (a link, the address, another press) opens
  // that issue. Compared during render, not in an effect: a worker's effects
  // run late, and one arriving after Back would open the issue again.
  if (seen.current !== selected) {
    seen.current = selected;
    setOpen(selected);
  }

  return open ? <IssueView id={open} onBack={() => setOpen(null)} /> : <Board onOpen={setOpen} />;
}

/** Everything in one page: a board of more than two hundred issues wants windowed columns. */
const QUERY = { limit: 200 };

function Board({ onOpen }: { onOpen: (id: string) => void }) {
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
  // Names and initials for the people the cards are assigned to, asked once each.
  const people = useMembers(issues.map(issue => issue.assignee));
  const error = failed ?? (list.error ? `Couldn’t load the issues. ${reason(list.error)}` : null);

  /**
   * Runs a write, or several in order, then reads the list again. False when
   * one didn't go through, with the reason on the error line.
   */
  const write = async (tool: string, input: Record<string, unknown> | Record<string, unknown>[], words: string): Promise<boolean> => {
    setBusy(true);

    try {
      for (const one of Array.isArray(input) ? input : [input]) await tools.call(tool, one);
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

    const input = { title, status: 'todo', rank: rankAfterLast(issues), ...(due ? { due } : {}) };

    if (await write('create_issue', input, 'Couldn’t add the issue.')) close();
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

          if (!move || !issue) {
            keys.refuse(event);

            return;
          }

          // Dropped where it already was: nothing to write.
          if (move.to === issue.status && columnIssues(issues, move.to).indexOf(issue) === move.position) {
            keys.refuse(event);

            return;
          }

          // The status and the rank in one write, so one approval card. A
          // column with no room left is renumbered after, as a last resort.
          const placed = placeCard(issues, issue.id, move.to, move.position);
          const version = (id: string) => issues.find(one => one.id === id)!.version;
          const inputs =
            'rank' in placed
              ? [{ id: issue.id, version: issue.version, status: move.to, rank: placed.rank }]
              : placed.renumber.map(change =>
                  change.id === issue.id
                    ? { id: issue.id, version: issue.version, status: move.to, rank: change.rank }
                    : { id: change.id, version: version(change.id), rank: change.rank },
                );
          const moved = await write('update_issue', inputs, `Couldn’t move “${issue.title}”.`);

          if (!moved) keys.refuse(event);
        }}
      >
        {COLUMNS.map(column => {
          const cards = columnIssues(issues, column.status);

          return (
            <bry-board-column key={column.status} ref={keys.column(column.status)} title={column.title} count={cards.length} empty="Nothing here.">
              {cards.map(issue => (
                <bry-card
                  key={issue.id}
                  ref={keys.card(issue.id)}
                  padding="3"
                  pressable
                  onPress={async () => {
                    try {
                      await navigate({ kind: 'item', id: issue.id });
                    } catch (failure) {
                      setFailed(`Couldn’t open “${issue.title}”. ${reason(failure)}`);

                      return;
                    }

                    onOpen(issue.id);
                  }}
                >
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
                    {issue.assignee && people.get(issue.assignee) && (
                      <bry-stack direction="row" gap="2" align="center">
                        <bry-avatar name={people.get(issue.assignee)!.name} size="sm" />
                        <bry-text tone="muted" size="sm" text={people.get(issue.assignee)!.name} />
                      </bry-stack>
                    )}
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

void mount(Screen);
