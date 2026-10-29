import { useCallback, useEffect, useState } from 'react';
import { api, PRIORITIES, STATUSES, fmt } from './api.js';
import Badge from './Badge.jsx';

export default function TicketDetail({ id, agents, me, onClose, onChanged }) {
  const [t, setT] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const [type, setType] = useState('reply');
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setT(await api.ticket(id)); setError(''); } catch (e) { setError(e.message); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function run(fn, reload = true) {
    setBusy(true);
    setError('');
    try { await fn(); if (reload) await load(); onChanged(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  const patch = (body) => run(() => api.update(id, { ...body, actor: me }));
  const saveEdit = () => run(async () => { await api.update(id, { ...draft, actor: me }); setEditing(false); });
  const send = () => {
    if (!content.trim()) return setError('Write something before sending.');
    run(async () => { await api.comment(id, { type, content, author: me }); setContent(''); });
  };
  const del = () => {
    if (!window.confirm('Delete this ticket and all its replies/history? This cannot be undone.')) return;
    run(async () => { await api.remove(id); onClose(); }, false);
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose}>✕</button>
        {error && <div className="alert error">⚠ {error}</div>}
        {!t ? <div className="loading">{error ? '' : 'Loading…'}</div> : (
          <>
            <h2>#{t.id} · {t.subject} {t.overdue && <span className="badge overdue">OVERDUE</span>}</h2>
            <div className="muted">From <b>{t.customer}</b> · created {fmt(t.created_at)}</div>

            <div className="row controls">
              <label>Status
                <select value={t.status} disabled={busy} onChange={(e) => patch({ status: e.target.value })}>
                  {STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
              <label>Priority
                <select value={t.priority} disabled={busy} onChange={(e) => patch({ priority: e.target.value })}>
                  {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
                </select>
              </label>
              <label>Assignee
                <select value={t.assignee_id ?? ''} disabled={busy} onChange={(e) => patch({ assignee_id: e.target.value || null })}>
                  <option value="">Unassigned</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </label>
            </div>
            <div><Badge kind="status" value={t.status} /> <Badge kind="prio" value={t.priority} /></div>

            <h3>Details {!editing && <button className="link" onClick={() => { setDraft({ subject: t.subject, customer: t.customer, description: t.description }); setEditing(true); }}>Edit</button>}</h3>
            {editing ? (
              <div className="edit">
                <input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
                <input value={draft.customer} onChange={(e) => setDraft({ ...draft, customer: e.target.value })} />
                <textarea rows={4} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
                <div className="actions"><button onClick={() => setEditing(false)}>Cancel</button><button className="primary" disabled={busy} onClick={saveEdit}>Save</button></div>
              </div>
            ) : <p className="desc">{t.description}</p>}

            <h3>Conversation</h3>
            {t.comments.length === 0 && <div className="empty small">No replies or notes yet.</div>}
            {t.comments.map((c) => (
              <div key={c.id} className={`comment ${c.type}`}>
                <div className="comment-head">
                  <span className="tag">{c.type === 'note' ? '🔒 INTERNAL NOTE' : '💬 PUBLIC REPLY'}</span>
                  <span>{c.author} · {fmt(c.created_at)}</span>
                </div>
                <div>{c.content}</div>
              </div>
            ))}

            <div className={`composer ${type}`}>
              <div className="tabs">
                <button className={type === 'reply' ? 'active' : ''} onClick={() => setType('reply')}>Public reply</button>
                <button className={type === 'note' ? 'active' : ''} onClick={() => setType('note')}>Internal note</button>
              </div>
              <textarea rows={3} value={content} onChange={(e) => setContent(e.target.value)}
                placeholder={type === 'reply' ? 'Visible to the customer…' : 'Only visible to the support team…'} />
              <button className="primary" disabled={busy} onClick={send}>{busy ? 'Sending…' : type === 'reply' ? 'Send reply' : 'Add note'}</button>
            </div>

            <h3>Activity history</h3>
            <ul className="history">
              {t.activity.map((a) => <li key={a.id}><span className="muted">{fmt(a.created_at)}</span> — {a.detail} <span className="muted">({a.actor})</span></li>)}
            </ul>

            <button className="danger" disabled={busy} onClick={del}>Delete ticket</button>
          </>
        )}
      </div>
    </div>
  );
}
