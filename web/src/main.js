import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './style.css'

const get = id => document.getElementById(id)
const form = document.querySelector('form')
const map = L.map('map').setView([-11.994, -77.006], 12)
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  maxZoom: 19
}).addTo(map)
const markers = L.layerGroup().addTo(map)
let catalog
let published = []

function element(tag, text) {
  const item = document.createElement(tag)
  item.textContent = text
  return item
}

async function json(url, method = 'GET', data) {
  const options = data === undefined ? { method } : {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
  }
  const response = await fetch(url, options)
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.message ?? `HTTP ${response.status}`)
  return body
}

function options(select, items, first) {
  select.append(new Option(first, ''))
  for (const [key, label] of Object.entries(items)) select.append(new Option(label, key))
}

function renderMap() {
  const category = get('category').value
  const slot = get('slot').value
  const reports = published.filter(r => (!category || r.category === category) && (!slot || r.slot === slot))
  const totals = new Map()
  for (const row of reports) totals.set(row.sector, (totals.get(row.sector) ?? 0) + 1)
  markers.clearLayers()
  get('counts').replaceChildren()
  for (const [sector, count] of totals) {
    const { point, label } = catalog.sectors[sector]
    const text = `${label} · ${count}`
    L.circleMarker(point, { radius: Math.min(24, 8 + count * 2), color: '#116754' })
      .bindTooltip(element('span', text)).addTo(markers)
    get('counts').append(element('li', text))
  }
  get('total').textContent = reports.length ? `Reportes aprobados visibles: ${reports.length}` : 'No hay coincidencias.'
}

async function loadMap() {
  published = await json('/api/reports')
  renderMap()
}

async function review() {
  const rows = await json('/api/moderation/pending')
  const queue = get('pending')
  queue.replaceChildren()
  if (!rows.length) queue.append(element('p', 'No hay reportes pendientes.'))
  for (const row of rows) {
    const line = element('div', '')
    line.append(element('p', `${catalog.sectors[row.sector].label} · ${catalog.categories[row.category]} · ${catalog.slots[row.slot]}`))
    for (const [status, label] of [['approved', 'Aprobar'], ['rejected', 'Rechazar']]) {
      const button = element('button', label)
      button.onclick = async () => {
        for (const item of line.querySelectorAll('button')) item.disabled = true
        try {
          await json(`/api/moderation/${row.id}`, 'PATCH', { status })
          get('feedback').textContent = 'Decisión guardada.'
          await Promise.all([loadMap(), review()])
        } catch (error) {
          get('feedback').textContent = error.message
          for (const item of line.querySelectorAll('button')) item.disabled = false
        }
      }
      line.append(button)
    }
    queue.append(line)
  }
}

function link(label, href) {
  const anchor = element('a', label)
  anchor.href = href
  get('session').append(anchor)
}

async function start() {
  catalog = await json('/api/catalog')
  const me = await json('/.auth/me')
  const roles = me.clientPrincipal?.userRoles ?? []
  if (import.meta.env.DEV) {
    link('Demo vecino', '/demo/vecino')
    link('Demo moderador', '/demo/moderador')
    link('Demo visitante', '/demo/visitante')
  } else if (roles.includes('authenticated')) link('Cerrar sesión', '/.auth/logout')
  else link('Ingresar con GitHub', '/.auth/login/github')

  options(get('category'), catalog.categories, 'Todas')
  options(get('slot'), catalog.slots, 'Todas')
  get('category').onchange = renderMap
  get('slot').onchange = renderMap
  options(form.elements.sector, Object.fromEntries(Object.entries(catalog.sectors).map(([k, s]) => [k, s.label])), 'Selecciona')
  options(form.elements.category, catalog.categories, 'Selecciona')
  options(form.elements.slot, catalog.slots, 'Selecciona')
  get('registration').hidden = !roles.includes('authenticated')
  get('moderation').hidden = !roles.includes('moderador')
  form.onsubmit = async event => {
    event.preventDefault()
    const button = form.querySelector('button')
    button.disabled = true
    try {
      const result = await json('/api/reports', 'POST', Object.fromEntries(new FormData(form)))
      get('feedback').textContent = `Reporte pendiente: ${result.id}`
      form.reset()
      if (roles.includes('moderador')) await review()
    } catch (error) { get('feedback').textContent = error.message }
    finally { button.disabled = false }
  }
  await loadMap()
  if (roles.includes('moderador')) await review()
}

start().catch(error => { get('feedback').textContent = error.message })
