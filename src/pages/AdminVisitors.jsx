import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { Globe2, Monitor, Smartphone, Tablet, Search, Trash2, AlertTriangle, RotateCw } from 'lucide-react';
import AlertModal from '../components/AlertModal';

const ITEMS_PER_PAGE = 50;

const deviceIcon = (type) => {
  switch (type?.toLowerCase()) {
    case 'mobile': return <Smartphone size={16} className="text-blue-500" />;
    case 'tablet': return <Tablet size={16} className="text-purple-500" />;
    default: return <Monitor size={16} className="text-slate-500" />;
  }
};

const AdminVisitors = () => {
  const [visitors, setVisitors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deviceFilter, setDeviceFilter] = useState('all');
  const [dateRange, setDateRange] = useState('all');
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' });
  const [selectedVisitor, setSelectedVisitor] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const loadVisitors = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('visitor_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (search.trim()) {
        query = query.or(`ip_address.ilike.%${search.trim()}%,browser.ilike.%${search.trim()}%,os.ilike.%${search.trim()}%,device_type.ilike.%${search.trim()}%,page_url.ilike.%${search.trim()}%,country.ilike.%${search.trim()}%,city.ilike.%${search.trim()}%`);
      }

      if (deviceFilter !== 'all') {
        query = query.ilike('device_type', deviceFilter);
      }

      if (dateRange === 'today') {
        query = query.gte('created_at', new Date().toISOString().split('T')[0]);
      } else if (dateRange === 'week') {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        query = query.gte('created_at', weekAgo.toISOString());
      } else if (dateRange === 'month') {
        const monthAgo = new Date();
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        query = query.gte('created_at', monthAgo.toISOString());
      }

      const from = page * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;
      if (error) throw error;
      setVisitors(data || []);
      setTotalCount(count || 0);
    } catch (err) {
      setAlertModal({
        show: true,
        title: 'Error',
        message: 'Failed to load visitor data: ' + err.message,
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [search, deviceFilter, dateRange, page]);

  useEffect(() => {
    loadVisitors();
  }, [loadVisitors]);

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  const handleDeleteAll = async () => {
    if (!window.confirm('Are you sure you want to delete ALL visitor logs? This cannot be undone.')) return;
    try {
      const { error } = await supabase.from('visitor_logs').delete().gte('id', 0);
      if (error) throw error;
      setAlertModal({
        show: true,
        title: 'Success',
        message: 'All visitor logs deleted.',
        type: 'success',
      });
      loadVisitors();
    } catch (err) {
      setAlertModal({
        show: true,
        title: 'Error',
        message: err.message,
        type: 'error',
      });
    }
  };

  const handleDeleteOld = async () => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    try {
      const { error } = await supabase
        .from('visitor_logs')
        .delete()
        .lt('created_at', thirtyDaysAgo.toISOString());
      if (error) throw error;
      setAlertModal({
        show: true,
        title: 'Success',
        message: 'Visitor logs older than 30 days deleted.',
        type: 'success',
      });
      loadVisitors();
    } catch (err) {
      setAlertModal({
        show: true,
        title: 'Error',
        message: err.message,
        type: 'error',
      });
    }
  };

  const openDetail = (visitor) => {
    setSelectedVisitor(visitor);
    setShowDetailModal(true);
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const getInitials = (str) => {
    if (!str) return '?';
    return str.charAt(0).toUpperCase();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Visiting Website</h1>
          <p className="text-slate-500">Track all visitors to your website including device, browser & location</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadVisitors}
            className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 text-xs font-semibold flex items-center gap-1"
          >
            <RotateCw size={14} /> Refresh
          </button>
          <button
            onClick={handleDeleteOld}
            className="px-3 py-2 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 text-xs font-semibold flex items-center gap-1"
          >
            <Trash2 size={14} /> Delete 30d+
          </button>
          <button
            onClick={handleDeleteAll}
            className="px-3 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 text-xs font-semibold flex items-center gap-1"
          >
            <AlertTriangle size={14} /> Delete All
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border">
          <p className="text-xs uppercase tracking-wide text-slate-400">Total Visits</p>
          <p className="text-2xl font-bold text-slate-900">{totalCount}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border">
          <p className="text-xs uppercase tracking-wide text-slate-400">Desktop</p>
          <p className="text-2xl font-bold text-slate-900">{visitors.filter(v => v.device_type === 'Desktop' || !v.device_type).length}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border">
          <p className="text-xs uppercase tracking-wide text-slate-400">Mobile</p>
          <p className="text-2xl font-bold text-slate-900">{visitors.filter(v => v.device_type === 'Mobile').length}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border">
          <p className="text-xs uppercase tracking-wide text-slate-400">Tablet</p>
          <p className="text-2xl font-bold text-slate-900">{visitors.filter(v => v.device_type === 'Tablet').length}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-3 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search IP, browser, OS, device, page..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-gold-400 outline-none"
          />
        </div>
        <select
          value={deviceFilter}
          onChange={e => { setDeviceFilter(e.target.value); setPage(0); }}
          className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-gold-400 outline-none"
        >
          <option value="all">All Devices</option>
          <option value="Desktop">Desktop</option>
          <option value="Mobile">Mobile</option>
          <option value="Tablet">Tablet</option>
        </select>
        <select
          value={dateRange}
          onChange={e => { setDateRange(e.target.value); setPage(0); }}
          className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-gold-400 outline-none"
        >
          <option value="all">All Time</option>
          <option value="today">Today</option>
          <option value="week">Last 7 Days</option>
          <option value="month">Last 30 Days</option>
        </select>
      </div>

      {/* Visitors Table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">#</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Date & Time</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">IP Address</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Device</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Browser</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">OS</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Location</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Page</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visitors.map((v, i) => (
                <tr
                  key={v.id}
                  className="hover:bg-slate-50 cursor-pointer"
                  onClick={() => openDetail(v)}
                >
                  <td className="px-4 py-3 text-xs text-slate-400">{page * ITEMS_PER_PAGE + i + 1}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{formatDate(v.created_at)}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-mono bg-slate-100 px-2 py-1 rounded text-slate-700">
                      {v.ip_address || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {deviceIcon(v.device_type)}
                      <span className="text-xs text-slate-700">{v.device_type || 'Desktop'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-slate-700">
                      {v.browser || 'Unknown'}
                      {v.browser_version ? ` ${v.browser_version}` : ''}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-slate-700">
                      {v.os || 'Unknown'}
                      {v.os_version ? ` ${v.os_version}` : ''}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Globe2 size={12} className="text-slate-400" />
                      <span className="text-xs text-slate-700">
                        {[v.city, v.country].filter(Boolean).join(', ') || '—'}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 max-w-[200px]">
                    <span className="text-xs text-slate-500 truncate block" title={v.page_url}>
                      {v.page_url ? (() => { try { return new URL(v.page_url).pathname; } catch { return v.page_url; } })() : '—'}
                    </span>
                  </td>
                </tr>
              ))}
              {visitors.length === 0 && !loading && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                    No visitor data found. Visitors will appear here once they browse the website.
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                    Loading visitor data...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-slate-50">
            <p className="text-xs text-slate-500">
              Page {page + 1} of {totalPages} ({totalCount} total)
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1 border rounded text-xs disabled:opacity-40 hover:bg-slate-100"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-1 border rounded text-xs disabled:opacity-40 hover:bg-slate-100"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {showDetailModal && selectedVisitor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Visitor Details</h2>
              <button
                onClick={() => setShowDetailModal(false)}
                className="p-1 hover:bg-slate-100 rounded"
              >
                <span className="text-slate-500">&times;</span>
              </button>
            </div>

            <div className="space-y-3">
              <DetailRow label="Date & Time" value={formatDate(selectedVisitor.created_at)} />
              <DetailRow label="IP Address" value={selectedVisitor.ip_address || '—'} mono />
              <DetailRow label="Device Type" value={selectedVisitor.device_type || 'Desktop'} />
              <DetailRow label="Browser" value={`${selectedVisitor.browser || 'Unknown'} ${selectedVisitor.browser_version || ''}`} />
              <DetailRow label="OS" value={`${selectedVisitor.os || 'Unknown'} ${selectedVisitor.os_version || ''}`} />
              <DetailRow label="User Agent" value={selectedVisitor.user_agent || '—'} small />
              <DetailRow label="Referrer" value={selectedVisitor.referrer || '—'} small />
              <DetailRow label="Page URL" value={selectedVisitor.page_url || '—'} small />
              <DetailRow label="Country" value={selectedVisitor.country || '—'} />
              <DetailRow label="City" value={selectedVisitor.city || '—'} />
              <DetailRow label="ISP" value={selectedVisitor.isp || '—'} />
            </div>

            <button
              onClick={() => setShowDetailModal(false)}
              className="mt-6 w-full px-4 py-2 bg-nani-dark text-white rounded-lg hover:bg-nani-dark/90"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <AlertModal
        show={alertModal.show}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
        onClose={() => setAlertModal({ show: false, title: '', message: '', type: 'info' })}
      />
    </div>
  );
};

const DetailRow = ({ label, value, mono, small }) => (
  <div>
    <p className="text-xs uppercase tracking-wide text-slate-400 mb-0.5">{label}</p>
    <p className={`text-sm text-slate-800 ${mono ? 'font-mono' : ''} ${small ? 'break-all text-xs' : ''}`}>
      {value || '—'}
    </p>
  </div>
);

export default AdminVisitors;
