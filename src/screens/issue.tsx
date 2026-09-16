import { mount } from '@brydio/app/preact';

/**
 * One issue on its own. A stub in Phase 0: the manifest declares the screen
 * so a placement or a link can name it later, and this says so rather than
 * showing nothing.
 */
function IssueScreen() {
  return (
    <bry-stack gap="2">
      <bry-heading level={1} text="Issue" />
      <bry-text tone="muted" text="Opening a single issue arrives in a later version. The board has every issue for now." />
    </bry-stack>
  );
}

void mount(IssueScreen);
