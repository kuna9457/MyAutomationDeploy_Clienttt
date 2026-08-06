interface Column<T> {
  header: string
  render: (row: T) => React.ReactNode
  key: string
}

export default function DataTable<T>({
  columns,
  rows,
  empty = "No data.",
  rowKey,
  rowClassName,
}: {
  columns: Column<T>[]
  rows: T[]
  empty?: string
  rowKey: (row: T, index: number) => string
  /** Extra classes per row, for tables where some rows mean something
   *  different from the rest (e.g. a signal that fired but wasn't taken). */
  rowClassName?: (row: T, index: number) => string
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">{empty}</p>
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-800">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-900 text-slate-400">
          <tr>
            {columns.map((c) => (
              <th key={c.key} className="whitespace-nowrap px-3 py-2 font-medium">
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={rowKey(row, i)}
              className={`border-t border-slate-800 text-slate-200 ${
                rowClassName?.(row, i) ?? ""
              }`}
            >
              {columns.map((c) => (
                <td key={c.key} className="whitespace-nowrap px-3 py-1.5">
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
