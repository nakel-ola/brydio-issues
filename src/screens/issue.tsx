import { mount, useHost } from '@brydio/app/preact';

import { IssueDetail } from '../features/issues/issue-detail.tsx';

/**
 * One issue on its own, for a placement or a link that names the `issue`
 * screen with an item selected. The board opens issues in its own tab, so
 * this is the same view; without a selection it says how to get one.
 */
function selectedItem(selection: unknown): string | null {
  const item = selection as { kind?: unknown; id?: unknown } | null | undefined;

  return item?.kind === 'item' && typeof item.id === 'string' ? item.id : null;
}

function IssueScreen() {
  const host = useHost();
  const selected = selectedItem(host.selection);

  return selected ? (
    <IssueDetail id={selected} currentProjectId={host.placement.projectId} />
  ) : (
    <bry-stack gap="2">
      <bry-heading level={1} text="Issue" />
      <bry-text tone="muted" text="Open an issue from List or Kanban to see it here." />
    </bry-stack>
  );
}

void mount(IssueScreen);
