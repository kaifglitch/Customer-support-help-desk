import { useState } from 'react';
import { api, PRIORITIES, STATUSES } from './api.js';

function Field({ label, error, children }) {
  return <label className="field">{label}{children}{error && <span className="field-error">{error}</span>}</label>;
}

export default function TicketForm({ agents, me, onClose, onCreated }) {
  const [form, setForm] = useState({ subject: '', customer: '', description: '', priority: 'Medium', status: 'Open', assignee_id: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    const errs = {};
    ['subject', 'customer', 'description'].forEach((k) => { if (!form[k].trim()) errs[k] = 'Required'; });
    setErrors(errs);
    if (Object.keys(errs).length) return; // client-side validation
    setSaving(true);
    setServerError('');
    try {
      const t = await api.create({ ...form, assignee_id: form.assignee_id || null, actor: me });
      onCreated(t);
    } catch (err) {
      setErrors(err.details || {}); // server-side validation errors
      setServerError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit} noValidate>
        <h2>New ticket</h2>
        {serverError && <div className="alert error">{serverError}</div>}
        <Field label="Subject *" error={errors.subject}><input value={form.subject} onChange={set('subject')} maxLength={200} /></Field>
        <Field label="Customer name or email *" error={errors.customer}><input value={form.customer} onChange={set('customer')} /></Field>
        <Field label="Description *" error={errors.description}><textarea rows={4} value={form.description} onChange={set('description')} /></Field>
        <div className="row">
          <Field label="Priority" error={errors.priority}>
            <select value={form.priority} onChange={set('priority')}>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select>
          </Field>
          <Field label="Status" error={errors.status}>
            <select value={form.status} onChange={set('status')}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
          </Field>
          <Field label="Assignee" error={errors.assignee_id}>
            <select value={form.assignee_id} onChange={set('assignee_id')}>
              <option value="">Unassigned</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
        </div>
        <div className="actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={saving}>{saving ? 'Creating…' : 'Create ticket'}</button>
        </div>
      </form>
    </div>
  );
}
