import { mount, useHost } from '@brydio/app/preact';

import { IssueView } from './issue-view.tsx';

/**
 * One issue on its own, for a placement or a link that names the `issue`
 * screen with an item selected. The board opens issues in its own tab, so
 * this is the same view; without a selection it says how to get one.
 */
function IssueScreen() {
  const selection = useHost().selection as { kind?: unknown; id?: unknown } | undefined;

  if (selection?.kind === 'item' && typeof selection.id === 'string') return <IssueView id={selection.id} onBack={() => undefined} />;

  return (
    <bry-stack gap="2">
      <bry-heading level={1} text="Issue" />
      <bry-text tone="muted" text="Open an issue from the board to see it here." />
    </bry-stack>
  );
}

void mount(IssueScreen);
