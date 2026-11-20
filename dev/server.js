import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { service, route } from '../api/src/service.js'
import { memoryStore } from './memory.js'

const seed = [['zarate','robo','noche'], ['caja','asalto','tarde'], ['canto','robo','manana'], ['zarate','extorsion','noche']]
  .map(([sector, category, slot]) => ({ sector, category, slot, rowKey: randomUUID(), status: 'approved' }))
const api = service(memoryStore(seed))
createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname
  const login = /^\/demo\/(vecino|moderador|visitante)$/.exec(path)
  if (req.method === 'GET' && login) {
    res.writeHead(302, { Location: '/', 'Set-Cookie': `sjl_demo=${login[1]}; Path=/; HttpOnly; SameSite=Strict` }).end()
    return
  }
  const demo = /(?:^|; *)sjl_demo=(vecino|moderador)(?:;|$)/.exec(req.headers.cookie ?? '')?.[1]
  const roles = demo === 'moderador' ? ['authenticated','moderador'] : demo ? ['authenticated'] : []
  const request = {
    headers: new Headers(req.headers),
    async text() {
      const chunks = []
      let bytes = 0
      for await (const chunk of req) {
        bytes += chunk.length
        if (bytes <= 4096) chunks.push(chunk)
      }
      return bytes > 4096 ? ' '.repeat(4097) : Buffer.concat(chunks).toString()
    }
  }
  const result = path === '/.auth/me'
    ? { status: 200, jsonBody: { clientPrincipal: demo ? { userRoles: roles } : null } }
    : await route(api, req.method, path.slice(5), request, roles)
  res.writeHead(result.status, { 'Content-Type': 'application/json', ...result.headers })
  res.end(JSON.stringify(result.jsonBody))
}).listen(7071, '127.0.0.1', () => console.log('API de demostración en http://127.0.0.1:7071'))
