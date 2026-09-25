import { createProject, toProject } from '@repo/db';
import { HttpStatus } from '../../utils/api-error';
import { defineApiHandler, readJsonBody } from '../../utils/api-handler';
import { useLocalUser } from '../../utils/local-user';
import { parseCreateProject } from '../../utils/validation';

export default defineApiHandler(async (event) => {
  const request = parseCreateProject(await readJsonBody(event));
  const { ds, user } = await useLocalUser();
  const project = toProject(await createProject(ds, user.id, request.title));
  setResponseStatus(event, HttpStatus.Created);
  return project;
});
