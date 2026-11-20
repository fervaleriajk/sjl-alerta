export function memoryStore(seed = []) {
  const rows = new Map(seed.map(row => [row.rowKey, { ...row, etag: 1 }]))
  return {
    async check() {},
    async create(row) { rows.set(row.rowKey, { ...row, etag: 1 }) },
    async list(status) { return [...rows.values()].filter(row => row.status === status) },
    async get(id) { return rows.get(id) },
    async decide(row, changes) {
      if (rows.get(row.rowKey)?.etag !== row.etag) return false
      rows.set(row.rowKey, { ...row, ...changes, etag: row.etag + 1 })
      return true
    }
  }
}
