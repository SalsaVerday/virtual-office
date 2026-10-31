import { useEffect, useState } from 'react'
import { canViewAdmin } from '../auth/adminGate'
import { adminReportCsv, buildAdminReport, formatPresence, type AdminReport } from '../usage/adminStats'
import { createEventSink } from '../usage/createSink'

/**
 * Dev name entry has no `users` row, so `isAdmin` stays null and `VITE_ADMIN`
 * decides. Azure sign-in should pass `users.is_admin` here instead.
 */
function adminAllowed(): boolean {
  return canViewAdmin({
    devFlag: import.meta.env.VITE_ADMIN === 'true',
    isAdmin: null,
  })
}

export function AdminScreen() {
  const allowed = adminAllowed()
  const [report, setReport] = useState<AdminReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!allowed) return
    let cancel = false
    void createEventSink()
      .load()
      .then((events) => {
        if (!cancel) setReport(buildAdminReport(events))
      })
      .catch((err: unknown) => {
        if (!cancel) setError(err instanceof Error ? err.message : 'Could not read usage events')
      })
    return () => {
      cancel = true
    }
  }, [allowed])

  function exportCsv() {
    if (!report) return
    const blob = new Blob([adminReportCsv(report)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'office-usage.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <main className="admin">
      <div className="admin-card">
        <a className="admin-back" href="/">
          Back to the office
        </a>
        <p className="eyebrow">Admin</p>
        <h1>Usage</h1>
        {allowed ? (
          <p className="lede">
            Daily active users, time present, and conversations of at least 30 seconds. This build reads the local
            event sink. The same sink reads Supabase <code>usage_events</code> when that project is configured.
          </p>
        ) : (
          <p className="lede" data-testid="admin-denied">
            Admins only. Set <code>VITE_ADMIN=true</code> for local dev. Azure sign-in will use <code>users.is_admin</code>.
          </p>
        )}
        {allowed && report ? (
          <>
            <button type="button" className="primary" data-testid="export-csv" onClick={exportCsv}>
              Export CSV
            </button>
            {report.presence.length === 0 && report.conversations.every((day) => day.conversations === 0) ? (
              <p data-testid="admin-empty">No usage events yet.</p>
            ) : null}
            <section>
              <h2>Daily active users</h2>
              <table data-testid="dau-table">
                <thead>
                  <tr>
                    <th>Day (UTC)</th>
                    <th>Users</th>
                  </tr>
                </thead>
                <tbody>
                  {report.dailyActive.map((day) => (
                    <tr key={day.date}>
                      <td>{day.date}</td>
                      <td data-testid={`dau-${day.date}`}>{day.users}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section>
              <h2>Time present</h2>
              <table data-testid="presence-table">
                <thead>
                  <tr>
                    <th>Day (UTC)</th>
                    <th>User</th>
                    <th>Present</th>
                  </tr>
                </thead>
                <tbody>
                  {report.presence.map((row) => (
                    <tr key={`${row.date}-${row.userId}`}>
                      <td>{row.date}</td>
                      <td>{row.userId}</td>
                      <td data-testid={`presence-${row.date}-${row.userId}`}>{formatPresence(row.seconds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section>
              <h2>Conversations</h2>
              <p className="auth-note">Only conversations that lasted 30 seconds or more. A pair is counted once.</p>
              <table data-testid="conversation-table">
                <thead>
                  <tr>
                    <th>Day (UTC)</th>
                    <th>Conversations</th>
                  </tr>
                </thead>
                <tbody>
                  {report.conversations.map((day) => (
                    <tr key={day.date}>
                      <td>{day.date}</td>
                      <td data-testid={`conversations-${day.date}`}>{day.conversations}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        ) : null}
        {error ? (
          <p className="error" data-testid="admin-error">
            {error}
          </p>
        ) : null}
      </div>
    </main>
  )
}
