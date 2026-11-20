import test from 'node:test'
import assert from 'node:assert/strict'
import { route, service, identity } from '../src/service.js'
import { memoryStore } from '../../dev/memory.js'

const neighbor = ['authenticated']
const moderator = ['authenticated', 'moderador']
const data = { sector:'zarate', category:'robo', slot:'noche' }
const request = body => new Request('http://localhost', {
  method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(body)
})
const fixture = () => service(memoryStore())
const create = (api, body = data, roles = neighbor) => route(api, 'POST', 'reports', request(body), roles)
const decide = (api, id, status) => route(api, 'PATCH', 'moderation/' + id, request({status}), moderator)
const list = api => route(api, 'GET', 'reports', null, [])

test('exige sesión para registrar', async () => {
  assert.equal((await create(fixture(), data, [])).status, 401)
})
test('el vecino recibe 403 al consultar pendientes', async () => {
  assert.equal((await route(fixture(), 'GET', 'moderation/pending', null, neighbor)).status, 403)
})
test('rechaza sectores fuera del catálogo', async () => {
  assert.equal((await create(fixture(), {...data, sector:'__proto__'})).status, 400)
})
test('exige JSON', async () => {
  const text = new Request('http://localhost', {method:'POST', body:'texto'})
  assert.equal((await route(fixture(), 'POST', 'reports', text, neighbor)).status, 415)
})
test('un reporte solo aparece en público tras aprobarse', async () => {
  const api = fixture()
  const created = await create(api, {...data, extra:'privado'})
  assert.equal(created.status, 201)
  const {id} = created.jsonBody
  assert.deepEqual((await list(api)).jsonBody, [])
  assert.equal((await decide(api, id, 'approved')).status, 200)
  assert.deepEqual((await list(api)).jsonBody, [{id,...data}])
})
test('los rechazados permanecen fuera del mapa', async () => {
  const api = fixture()
  const {id} = (await create(api)).jsonBody
  await decide(api, id, 'rejected')
  assert.deepEqual((await list(api)).jsonBody, [])
})
test('decisiones concurrentes producen un conflicto', async () => {
  const api = fixture()
  const {id} = (await create(api)).jsonBody
  const results = await Promise.all([decide(api,id,'approved'), decide(api,id,'rejected')])
  assert.deepEqual(results.map(result => result.status).sort(), [200,409])
})
test('health devuelve 503 si falla Storage', async () => {
  const api = service({ async check() { throw new Error('detalle') } })
  const result = await route(api, 'GET', 'health', null, [])
  assert.equal(result.status, 503)
  assert.equal(result.jsonBody.message, 'Almacenamiento no disponible.')
})
test('interpreta los roles del principal de Azure', () => {
  const header = Buffer.from(JSON.stringify({userRoles:moderator})).toString('base64')
  assert.deepEqual(identity(header), moderator)
  assert.deepEqual(identity('inválido'), [])
})
