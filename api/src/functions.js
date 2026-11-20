import { app } from '@azure/functions'
import { service, identity, route } from './service.js'
import { tableStore } from './table.js'

const api = service(tableStore(process.env.TABLE_CONNECTION_STRING))
for (const [name, path, methods] of [
  ['health', 'health', ['GET']],
  ['catalog', 'catalog', ['GET']],
  ['reports', 'reports', ['GET', 'POST']],
  ['pending', 'moderation/pending', ['GET']],
  ['decision', 'moderation/{id}', ['PATCH']]
]) {
  app.http(name, {
    route: path, methods, authLevel: 'anonymous',
    handler: request => route(api, request.method, path.replace('{id}', request.params.id), request,
      identity(request.headers.get('x-ms-client-principal')))
  })
}
