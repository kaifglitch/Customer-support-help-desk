import { slug } from './api.js';

export default function Badge({ kind, value }) {
  return <span className={`badge ${kind}-${slug(value)}`}>{value}</span>;
}
