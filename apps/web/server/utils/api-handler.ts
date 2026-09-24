import { ApiException, toApiError } from './api-error';
import { parseJsonBody } from './validation';

type ApiEvent = InstanceType<typeof H3Event>;

/** The one wrapper every `/api` route uses: success passes through, any error becomes an `ApiError`. */
export function defineApiHandler<T>(handler: (event: ApiEvent) => Promise<T>) {
  return defineEventHandler(async (event) => {
    try {
      return await handler(event);
    } catch (error) {
      if (!(error instanceof ApiException)) {
        console.error(`[api] ${event.method} ${event.path}`, error);
      }
      const apiError = toApiError(error);
      setResponseStatus(event, apiError.statusCode);
      return apiError;
    }
  });
}

/** Reads a JSON body without h3's own error format; bad JSON is a 400 `ApiError`. */
export async function readJsonBody(event: ApiEvent): Promise<unknown> {
  const raw = await readRawBody(event, 'utf8');
  return parseJsonBody(raw);
}
