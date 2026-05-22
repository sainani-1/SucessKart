import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import LoadingSpinner from '../components/LoadingSpinner';
import { AlertTriangle, RefreshCcw, Search, Trash2 } from 'lucide-react';

const toDisplayTime = (ts) => {
  if (!ts) return '-';
  try {
    return new Date(ts).toLocaleString('en-IN');
  } catch {
    return String(ts);
  }
};

export default function AdminErrorLogs() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [missingTable, setMissingTable] = useState(false);
  const [clearing, setClearing] = useState(false);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('error_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      setMissingTable(false);
      setRows(data || []);
    } catch {
      setMissingTable(true);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const clearLogs = async () => {
    setClearing(true);
    try {
      await supabase.from('error_logs').delete().gt('created_at', '1970-01-01');
      setRows([]);
    } catch {
    } finally {
      setClearing(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.message, r.source, r.details, r.context, r.user_id]
        .map((v) => String(v || '').toLowerCase())
        .some((v) => v.includes(q))
    );
  }, [rows, search]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-7 w-7 text-red-400" />
          <h1 className="text-2xl font-bold text-slate-900">Error Logs</h1>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-500">
            {rows.length} errors
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadLogs}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshCcw size={16} /> Refresh
          </button>
          {rows.length > 0 && (
            <button
              onClick={clearLogs}
              disabled={clearing}
              className="inline-flex items-center gap-2 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 size={16} /> {clearing ? 'Clearing...' : 'Clear All'}
            </button>
          )}
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input
          type="text"
          placeholder="Search errors..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
      </div>

      {loading ? (
        <LoadingSpinner message="Loading error logs..." />
      ) : missingTable ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-8 text-center">
          <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-amber-400" />
          <h2 className="text-lg font-semibold text-amber-800">Table Not Found</h2>
          <p className="mt-2 text-sm text-amber-600">
            The <code className="rounded bg-amber-100 px-2 py-0.5 font-mono text-sm">error_logs</code> table does not exist in your database. Create it to start capturing errors.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center">
          <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm text-slate-500">
            {search ? 'No errors match your search.' : 'No errors logged yet.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-4 py-3 font-semibold text-slate-600">Time</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Source</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Message</th>
                <th className="px-4 py-3 font-semibold text-slate-600">User</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                    {toDisplayTime(row.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600">
                      {row.source || 'app'}
                    </span>
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 text-slate-900">
                    {row.message}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">
                    {row.user_id ? `${row.user_id.slice(0, 8)}...` : '-'}
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 text-slate-500">
                    {row.details ? (
                      <span
                        className="cursor-pointer text-blue-600 hover:underline"
                        title={typeof row.details === 'object' ? JSON.stringify(row.details, null, 2) : String(row.details)}
                      >
                        {typeof row.details === 'object' ? JSON.stringify(row.details).slice(0, 60) + '...' : String(row.details).slice(0, 60)}
                      </span>
                    ) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
