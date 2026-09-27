import { build } from '@brydio/cli';
import { FakeHost, type TreeNode } from '@brydio/fake-host';
import { afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const manifest = JSON.parse(readFileSync(join(root, '.brydio/app.json'), 'utf8'));
const entry = join(root, 'dist/screens/plan.js');
let host: FakeHost | null = null;

beforeAll(async () => {
  expect((await build(root)).problems.filter(problem => problem.severity === 'error')).toEqual([]);
});

afterEach(() => {
  host?.stop();
  host = null;
});

const by = (type: string, words?: string): TreeNode | undefined =>
  host!.findAll(node => node.type === type && (words === undefined || node.props.text === words || node.props.label === words || node.props.title === words))[0];

describe('Plan navigation', () => {
  test('opens Home in the workspace and changes sections from the full menu', async () => {
    host = FakeHost.start({
      entry,
      manifest,
      context: { placement: { id: 'place_home', kind: 'workspace-sidebar' } },
      fixtures: { issues: [], states: [], sprints: [], modules: [], project_plan: [] },
    });
    await host.mounted();

    expect(await host.waitFor(() => by('bry-heading', 'Home'), { what: 'Home' })).toBeTruthy();
    const menu = by('bry-section-menu')!;

    expect(menu.props.current).toBe('home');
    host.raise('bry-section-menu', menu, 'select', { id: 'analytics' });
    expect(await host.waitFor(() => by('bry-heading', 'Analytics'), { what: 'Analytics' })).toBeTruthy();
  });

  test('opens a project List directly without a second project navigation shell', async () => {
    host = FakeHost.start({
      entry,
      manifest,
      context: { placement: { id: 'place_list', kind: 'project-tab', projectId: 'project_alpha' } },
      directory: { projects: [{ id: 'project_alpha', name: 'Alpha' }] },
      fixtures: { issues: [], states: [], sprints: [], modules: [], project_plan: [] },
    });
    await host.mounted();

    const breadcrumb = await host.waitFor(() => {
      const current = by('bry-breadcrumb');

      return (current?.props.items as Array<{ label: string }> | undefined)?.[0]?.label === 'Alpha' ? current : undefined;
    }, { what: 'the project List header' });

    expect(breadcrumb.props.items).toEqual([
      { id: 'project', label: 'Alpha' },
      { id: 'issues', label: 'Issues' },
    ]);
    expect(by('bry-section-menu')).toBeUndefined();
    expect(host.byText('Overview')).toBeUndefined();
    expect(host.byText('New issue')).toBeTruthy();
    expect(host.byText('Configure states')).toBeTruthy();

    host.press(host.byText('Configure states')!);
    expect(await host.waitFor(() => host!.byText('Back to issues'), { what: 'project settings' })).toBeTruthy();
    expect(host.byText('Create default states')).toBeTruthy();

    host.press(host.byText('Create default states')!);
    await host.waitFor(() => host!.byText('In progress'), { what: 'the default workflow' });
    expect(host.calls.filter(call => call.tool === 'create_state').map(call => call.input)).toEqual([
      { name: 'Backlog', group: 'backlog', colour: 'neutral', position: 0, project: 'project_alpha' },
      { name: 'To do', group: 'unstarted', colour: 'neutral', position: 1024, project: 'project_alpha' },
      { name: 'In progress', group: 'started', colour: 'brand', position: 2048, project: 'project_alpha' },
      { name: 'Done', group: 'completed', colour: 'success', position: 3072, project: 'project_alpha' },
      { name: 'Cancelled', group: 'cancelled', colour: 'neutral', position: 4096, project: 'project_alpha' },
    ]);
    expect(host.byText('Create default states')).toBeUndefined();
  });
});
