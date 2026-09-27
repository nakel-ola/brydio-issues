import { data } from '@brydio/app';
import { mount, useCallback, useHost, useLayoutEffect, useProjects, useState, useWatch } from '@brydio/app/preact';

import { readAll } from '../data/pages.ts';
import { Sprints } from '../features/sprints/sprints.tsx';
import type { Issue, Label, Module, Sprint, State } from '../model/schemas.ts';

interface SprintData {
  issues: Issue[];
  labels: Label[];
  states: State[];
  sprints: Sprint[];
  modules: Module[];
}

const EMPTY: SprintData = { issues: [], labels: [], states: [], sprints: [], modules: [] };

function selectedItem(selection: unknown) {
  const value = selection as { kind?: unknown; id?: unknown } | null | undefined;

  return value?.kind === 'item' && typeof value.id === 'string' ? value.id : undefined;
}

function SprintScreen() {
  const host = useHost();
  const projectId = host.placement.projectId;
  const selected = selectedItem(host.selection);
  const [loaded, setLoaded] = useState<{ data: SprintData; loading: boolean; error: string | null }>({ data: EMPTY, loading: true, error: null });
  const projects = useProjects(projectId ? [projectId] : []);
  const refresh = useCallback(async () => {
    if (!projectId) return;
    const query = { filter: { project: projectId } };
    const list = <T,>(collection: string) => readAll<T>((name, page) => data.list<T>(name, page), collection, query);

    try {
      const [issues, labels, states, sprints, modules] = await Promise.all([
        list<Issue>('issues'), list<Label>('labels'), list<State>('states'), list<Sprint>('sprints'), list<Module>('modules'),
      ]);
      setLoaded({ data: { issues, labels, states, sprints, modules }, loading: false, error: null });
    } catch (failure) {
      setLoaded(previous => ({ ...previous, loading: false, error: failure instanceof Error ? failure.message : String(failure) }));
    }
  }, [projectId]);

  useLayoutEffect(() => { void refresh(); }, [refresh]);
  useWatch('issues', () => void refresh());
  useWatch('sprints', () => void refresh());
  useWatch('states', () => void refresh());

  if (!projectId) return <bry-alert tone="warn" title="Add Sprint to a project" description="Sprint work always belongs to one Brydio project." />;
  if (loaded.error) return <bry-alert tone="danger" title="Sprint couldn’t load" description={loaded.error}><bry-button label="Retry" onPress={() => void refresh()} /></bry-alert>;
  if (loaded.loading) return <bry-skeleton shape="row" count={5} />;

  return (
    <Sprints
      projectId={projectId}
      projectName={projects.get(projectId)?.name ?? 'Project'}
      selectedSprintId={selected}
      activeByDefault={!selected}
      issues={loaded.data.issues}
      labels={loaded.data.labels}
      states={loaded.data.states}
      sprints={loaded.data.sprints}
      modules={loaded.data.modules}
      refresh={refresh}
    />
  );
}

void mount(SprintScreen);
