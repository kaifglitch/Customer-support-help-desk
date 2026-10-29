import { useCallback, useEffect, useState } from 'react';
import { api, STATUSES, PRIORITIES, fmt } from './api.js';
import Badge from './Badge.jsx';
import TicketForm from './TicketForm.jsx';
import TicketDetail from './TicketDetail.jsx';

export default function App() {
  const [agents, setAgents] = useState([]);
  const [me, setMe] = useState('');
  const [stats, setStats] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [filters, setFilters] = useState({ q: '', status: '', priority: '', assignee: '', sort: 'updated' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
      const [t, s] = await Promise.all([api.tickets(params), api.dashboard()]);
      setTickets(t);
      setStats(s);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    api.agents().then((a) => { setAgents(a); setMe(a[0]?.name || ''); }).catch((e) => setError(e.message));
  }, []);

  // debounce so typing in search doesn't fire a request per keystroke
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const setFilter = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  const hasFilters = filters.q || filters.status || filters.priority || filters.assignee;

  return (
    <div className="app">
      <header className="topbar">
        <h1>🎧 Support Desk</h1>
        <div className="topbar-right">
          <label>Acting as&nbsp;
            <select value={me} onChange={(e) => setMe(e.target.value)}>
              {agents.map((a) => <option key={a.id}>{a.name}</option>)}
            </select>
          </label>
          <button className="primary" onClick={() => setShowNew(true)}>+ New ticket</button>
        </div>
      </header>

      {error && <div className="alert error">⚠ {error} <button onClick={load}>Retry</button></div>}

      <section className="stats">
        {[['Total', 'total'], ['Open', 'open'], ['In progress', 'inProgress'], ['Resolved', 'resolved'], ['Urgent', 'urgent'], ['Overdue', 'overdue']]
          .map(([label, key]) => (
            <div key={key} className={`stat ${key}`}>
              <div className="stat-num">{stats ? stats[key] : '–'}</div>
              <div className="stat-label">{label}</div>
            </div>
          ))}
      </section>

      <section className="filters">
        <input placeholder="Search subject or customer…" value={filters.q} onChange={setFilter('q')} />
        <select value={filters.status} onChange={setFilter('status')}>
          <option value="">All statuses</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select value={filters.priority} onChange={setFilter('priority')}>
          <option value="">All priorities</option>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}
        </select>
        <select value={filters.assignee} onChange={setFilter('assignee')}>
          <option value="">All assignees</option>
          <option value="unassigned">Unassigned</option>
          {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select value={filters.sort} onChange={setFilter('sort')}>
          <option value="updated">Sort: Recently updated</option>
          <option value="priority">Sort: Priority</option>
        </select>
        {hasFilters && <button onClick={() => setFilters((f) => ({ ...f, q: '', status: '', priority: '', assignee: '' }))}>Clear</button>}
      </section>

      <div className="table-wrap">
        {loading && <div className="loading">Loading…</div>}
        {!loading && tickets.length === 0 ? (
          <div className="empty">
            {hasFilters ? 'No tickets match your filters.' : 'No tickets yet. Create the first one!'}
          </div>
        ) : (
          <table>
            <thead>
              <tr><th>#</th><th>Subject</th><th>Customer</th><th>Status</th><th>Priority</th><th>Assignee</th><th>Updated</th></tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id} className={t.overdue ? 'overdue-row' : ''} onClick={() => setSelectedId(t.id)}>
                  <td>{t.id}</td>
                  <td>{t.subject} {t.overdue && <span className="badge overdue">OVERDUE</span>}</td>
                  <td>{t.customer}</td>
                  <td><Badge kind="status" value={t.status} /></td>
                  <td><Badge kind="prio" value={t.priority} /></td>
                  <td>{t.assignee_name || <em className="muted">Unassigned</em>}</td>
                  <td>{fmt(t.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showNew && (
        <TicketForm agents={agents} me={me} onClose={() => setShowNew(false)}
          onCreated={(t) => { setShowNew(false); load(); setSelectedId(t.id); }} />
      )}
      {selectedId && (
        <TicketDetail id={selectedId} agents={agents} me={me}
          onClose={() => setSelectedId(null)} onChanged={load} />
      )}
    </div>
  );
}
