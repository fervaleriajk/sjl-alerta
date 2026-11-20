import { randomUUID } from 'node:crypto'
export const catalog = {
  sectors: {
    zarate: { label: 'Zárate', point: [-12.019, -77.002] },
    caja: { label: 'Caja de Agua', point: [-12.022, -77.013] },
    canto: { label: 'Canto Grande', point: [-11.963, -77.007] }
  },
  categories: { robo: 'Robo al paso', asalto: 'Asalto en transporte', extorsion: 'Extorsión', drogas: 'Microcomercialización' },
  slots: { madrugada: '00:00–05:59', manana: '06:00–11:59', tarde: '12:00–17:59', noche: '18:00–23:59' }
}

function fail(status, message) {
  throw Object.assign(new Error(message), { status })
}

function requireRole(roles, role) {
  if (!roles.includes('authenticated')) fail(401, 'Inicia sesión.')
  if (!roles.includes(role)) fail(403, 'Rol insuficiente.')
}

async function readBody(request) {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') fail(415, 'Se requiere JSON.')
  const raw = await request.text()
  if (Buffer.byteLength(raw) > 4096) fail(413, 'Solicitud demasiado grande.')
  try { return JSON.parse(raw) ?? {} } catch { fail(400, 'JSON inválido.') }
}

export function identity(header) {
  try {
    const roles = JSON.parse(Buffer.from(header, 'base64').toString()).userRoles
    return Array.isArray(roles) ? roles : []
  } catch { return [] }
}

function publicFields(row) {
  return { id: row.rowKey, sector: row.sector, category: row.category, slot: row.slot }
}

export function service(store) {
  return {
    async health() {
      try { await store.check() } catch { fail(503, 'Almacenamiento no disponible.') }
      return { status: 'ok' }
    },
    async published() { return (await store.list('approved')).map(publicFields) },
    async pending(roles) {
      requireRole(roles, 'moderador')
      return (await store.list('pending')).map(publicFields)
    },
    async create(request, roles) {
      requireRole(roles, 'authenticated')
      const body = await readBody(request)
      const fields = { sector: catalog.sectors, category: catalog.categories, slot: catalog.slots }
      for (const [key, options] of Object.entries(fields)) {
        if (typeof body[key] !== 'string' || !Object.hasOwn(options, body[key])) fail(400, `Valor inválido para ${key}.`)
      }
      const rowKey = randomUUID()
      const { sector, category, slot } = body
      await store.create({ rowKey, sector, category, slot, status: 'pending', createdAt: new Date().toISOString() })
      return { id: rowKey, status: 'pending' }
    },
    async decide(id, request, roles) {
      requireRole(roles, 'moderador')
      if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) fail(404, 'Reporte no encontrado.')
      const { status } = await readBody(request)
      if (!['approved', 'rejected'].includes(status)) fail(400, 'Decisión inválida.')
      const row = await store.get(id)
      if (!row) fail(404, 'Reporte no encontrado.')
      const decidedAt = new Date().toISOString()
      if (row.status !== 'pending' || !await store.decide(row, { status, decidedAt })) fail(409, 'Reporte ya revisado.')
      return { id, status, decidedAt }
    }
  }
}

export async function route(api, method, path, request, roles) {
  const headers = { 'Cache-Control': 'no-store' }
  const result = (status, jsonBody) => ({ status, headers, jsonBody })
  try {
    if (method === 'GET' && path === 'health') return result(200, await api.health())
    if (method === 'GET' && path === 'catalog') return result(200, catalog)
    if (method === 'GET' && path === 'reports') return result(200, await api.published())
    if (method === 'POST' && path === 'reports') return result(201, await api.create(request, roles))
    if (method === 'GET' && path === 'moderation/pending') return result(200, await api.pending(roles))
    if (method === 'PATCH' && path.startsWith('moderation/')) return result(200, await api.decide(path.slice(11), request, roles))
    return result(404, { message: 'Ruta no encontrada.' })
  } catch (error) {
    return result(error.status ?? 500, { message: error.status ? error.message : 'Error interno.' })
  }
}
