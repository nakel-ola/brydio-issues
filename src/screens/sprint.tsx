import { mount } from '@brydio/app/preact';

function SprintScreen() {
  return (
    <bry-stack gap="2">
      <bry-heading level={1} text="Sprint" />
      <bry-text tone="muted" text="Choose a sprint from the Sprints folder or create the first one." />
    </bry-stack>
  );
}

void mount(SprintScreen);
