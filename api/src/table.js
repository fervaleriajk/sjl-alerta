import { TableClient, odata } from '@azure/data-tables'

export function tableStore(connection) {
  const partitionKey = 'sjl'
  let client
  const table = () => client ??= TableClient.fromConnectionString(connection, 'reports')
  return {
    async check() { await table().listEntities().byPage({ maxPageSize: 1 }).next() },
    create(row) { return table().createEntity({ partitionKey, ...row }) },
    async list(status) {
      const filter = odata`PartitionKey eq ${partitionKey} and status eq ${status}`
      const rows = []
      for await (const row of table().listEntities({ queryOptions: { filter } })) rows.push(row)
      return rows
    },
    async get(id) {
      try { return await table().getEntity(partitionKey, id) }
      catch (error) { if (error.statusCode !== 404) throw error; return null }
    },
    async decide(row, changes) {
      try {
        await table().updateEntity({ partitionKey, rowKey: row.rowKey, ...changes }, 'Merge', { etag: row.etag })
        return true
      } catch (error) { if (error.statusCode !== 412) throw error; return false }
    }
  }
}
