import { data } from '@brydio/app';
import {
  mount,
  useCallback,
  useHost,
  useLayoutEffect,
  useProjects,
  useRef,
  useState,
  useWatch,
} from '@brydio/app/preact';

import { EMPTY_PROJECT_DATA, scopeProjectData, type ProjectData } from '../data/project-data.ts';
import { readAll } from '../data/pages.ts';
import { Home, ProjectOverview } from '../features/home/home.tsx';
import { IssueCollection } from '../features/issues/issue-collection.tsx';
import { defaultPlanSection, PlanNavigation, type PlanSection } from '../features/navigation/plan-navigation.tsx';
import { ProjectSettings } from '../features/settings/project-settings.tsx';
import type { Issue, Module, ProjectPlan, Sprint, State } from '../model/schemas.ts';

interface PlanDataState {
  data: ProjectData;
  loading: boolean;
  error: string | null;
}

function usePlanData(projectId?: string): PlanDataState & { refresh: () => Promise<void> } {
  const [state, setState] = useState<PlanDataState>({ data: EMPTY_PROJECT_DATA, loading: true, error: null });
  const ticket = useRef(0);
  const refresh = useCallback(async () => {
    const mine = ++ticket.current;
    const query = projectId ? { filter: { project: projectId } } : {};
    const list = <T,>(collection: string) => readAll<T>(
      (name, page) => data.list<T>(name, page),
      collection,
      query,
      () => mine === ticket.current,
    );

    try {
      const [issues, states, sprints, modules, plans] = await Promise.all([
        list<Issue>('issues'),
        list<State>('states'),
        list<Sprint>('sprints'),
        list<Module>('modules'),
        list<ProjectPlan>('project_plan'),
      ]);

      if (mine !== ticket.current) return;
      setState({
        data: scopeProjectData(projectId, { issues, states, sprints, modules, plans }),
        loading: false,
        error: null,
      });
    } catch (failure) {
      if (mine !== ticket.current) return;
      setState(previous => ({
        ...previous,
        loading: false,
        error: failure instanceof Error ? failure.message : String(failure),
      }));
    }
  }, [projectId]);

  useLayoutEffect(() => {
    setState(previous => ({ ...previous, loading: true }));
    void refresh();
  }, [refresh]);
  useWatch('issues', () => void refresh());
  useWatch('states', () => void refresh());
  useWatch('sprints', () => void refresh());
  useWatch('modules', () => void refresh());
  useWatch('project_plan', () => void refresh());

  return { ...state, refresh };
}

function PlanScreen() {
  const projectId = useHost().placement.projectId;
  const [section, setSection] = useState<PlanSection>(() => defaultPlanSection(projectId));
  const seenProject = useRef(projectId);
  const loaded = usePlanData(projectId);
  const projectIds = [
    ...new Set([
      ...(projectId ? [projectId] : []),
      ...loaded.data.issues.map(one => one.project),
      ...loaded.data.states.map(one => one.project),
      ...loaded.data.sprints.map(one => one.project),
      ...loaded.data.modules.map(one => one.project),
      ...loaded.data.plans.map(one => one.project),
    ].filter((one): one is string => typeof one === 'string' && one.length > 0)),
  ];
  const projects = useProjects(projectIds);

  if (seenProject.current !== projectId) {
    seenProject.current = projectId;
    setSection(defaultPlanSection(projectId));
  }

  return (
    <bry-stack gap="4">
      <PlanNavigation projectId={projectId} section={section} onSelect={setSection} />
      {loaded.error && <bry-alert tone="danger" title="Plan couldn’t load" description={loaded.error} />}
      {loaded.loading ? (
        <bry-stack gap="2">
          <bry-skeleton shape="line" count={2} />
          <bry-skeleton shape="row" count={4} />
        </bry-stack>
      ) : (
        <Section
          section={section}
          projectId={projectId}
          projectName={projectId ? projects.get(projectId)?.name ?? 'Project' : undefined}
          projects={projects}
          data={loaded.data}
          onSelect={setSection}
          refresh={loaded.refresh}
        />
      )}
    </bry-stack>
  );
}

function Section({ section, projectId, projectName, projects, data: projectData, onSelect, refresh }: {
  section: PlanSection;
  projectId?: string;
  projectName?: string;
  projects: ReadonlyMap<string, { name: string }>;
  data: ProjectData;
  onSelect: (section: PlanSection) => void;
  refresh: () => Promise<void>;
}) {
  if (!projectId) {
    if (section === 'home') return <Home data={projectData} projects={projects} />;

    return <FutureSection section={section} />;
  }

  if (section === 'overview') return <ProjectOverview projectId={projectId} projectName={projectName ?? 'Project'} data={projectData} />;
  if (section === 'settings') {
    return (
      <ProjectSettings
        projectId={projectId}
        states={projectData.states}
        plan={projectData.plans.find(one => one.project === projectId)}
        onChanged={refresh}
      />
    );
  }
  if (section === 'issues') {
    return (
      <IssueCollection
        projectId={projectId}
        projectName={projectName ?? 'Project'}
        issues={projectData.issues}
        states={projectData.states}
        sprints={projectData.sprints}
        modules={projectData.modules}
        refresh={refresh}
        onConfigureStates={() => onSelect('settings')}
      />
    );
  }

  return <FutureSection section={section} />;
}

const LABELS: Partial<Record<PlanSection, string>> = {
  'your-work': 'Your work', analytics: 'Analytics', views: 'Views', sprints: 'Sprints', modules: 'Modules',
  inbox: 'Inbox', drafts: 'Drafts', archive: 'Archive',
};

function FutureSection({ section }: { section: PlanSection }) {
  const title = LABELS[section] ?? 'Plan';

  return (
    <bry-stack gap="2">
      <bry-heading level={1} text={title} />
      <bry-text tone="muted" text={`${title} is part of this Plan workspace.`} />
    </bry-stack>
  );
}

void mount(PlanScreen);
