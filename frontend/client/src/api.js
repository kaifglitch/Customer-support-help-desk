async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.details = data?.details || {};
    throw err;
  }
  return data;
}

export const api = {
  agents: () => request('/agents'),
  dashboard: () => request('/dashboard'),
  tickets: (params) => request(`/tickets?${new URLSearchParams(params)}`),
  ticket: (id) => request(`/tickets/${id}`),
  create: (body) => request('/tickets', { method: 'POST', body }),
  update: (id, body) => request(`/tickets/${id}`, { method: 'PATCH', body }),
  remove: (id) => request(`/tickets/${id}`, { method: 'DELETE' }),
  comment: (id, body) => request(`/tickets/${id}/comments`, { method: 'POST', body }),
};

export const STATUSES = ['Open', 'In Progress', 'Waiting on Customer', 'Resolved'];
export const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];
export const fmt = (iso) => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
export const slug = (s) => s.toLowerCase().replace(/\s+/g, '-');
