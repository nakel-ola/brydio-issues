import type { Handler } from '@brydio/app/handler';

interface CreateSprintInput {
  name?: string;
}

const createSprint: Handler<CreateSprintInput> = async ({ name }, { tools }) => {
  const title = name?.trim() ?? '';

  if (!title) throw new Error('Give the sprint a name.');
  if (title.length > 200) throw new Error('A sprint name is at most 200 characters.');

  return tools.call('create_sprint', { name: title, status: 'draft' });
};

export default createSprint;
