import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import { FileText, Eye, Plus, Save, Trash2 } from 'lucide-react';
import usePopup from '../hooks/usePopup';
import LoadingSpinner from '../components/LoadingSpinner';
import { getNotesLibrarySettingKey, parseNotesLibraryItems } from '../utils/notesLibrary';

const DEFAULT_FORM = {
  title: '',
  category: '',
  description: '',
  imageUrl: '',
  notesUrl: '',
  isActive: true,
};

const AdminNotesLibrary = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState([]);
  const [form, setForm] = useState(DEFAULT_FORM);
  const { popupNode, openPopup } = usePopup();

  const sortedNotes = useMemo(
    () => [...notes].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()),
    [notes]
  );

  useEffect(() => {
    loadNotes();
  }, []);

  const loadNotes = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('settings')
        .select('value')
        .eq('key', getNotesLibrarySettingKey())
        .maybeSingle();

      if (error) throw error;
      setNotes(parseNotesLibraryItems(data?.value));
    } catch (error) {
      openPopup('Error', `Failed to load notes library: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const persistNotes = async (nextNotes) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('settings')
        .upsert(
          {
            key: getNotesLibrarySettingKey(),
            value: JSON.stringify(nextNotes),
          },
          { onConflict: 'key' }
        );

      if (error) throw error;
      setNotes(nextNotes);
    } finally {
      setSaving(false);
    }
  };

  const addNote = async () => {
    if (!form.title.trim()) {
      openPopup('Missing Title', 'Please enter a note title.', 'warning');
      return;
    }
    if (!form.notesUrl.trim()) {
      openPopup('Missing Notes URL', 'Please add a notes preview URL.', 'warning');
      return;
    }

    const newNote = {
      id: `notes_${Date.now()}`,
      title: form.title.trim(),
      category: form.category.trim() || 'Advanced Notes',
      description: form.description.trim(),
      imageUrl: form.imageUrl.trim(),
      notesUrl: form.notesUrl.trim(),
      isActive: !!form.isActive,
      createdAt: new Date().toISOString(),
    };

    try {
      await persistNotes([newNote, ...notes]);
      setForm(DEFAULT_FORM);
      openPopup('Success', 'Notes library item added.', 'success');
    } catch (error) {
      openPopup('Error', `Failed to add note: ${error.message}`, 'error');
    }
  };

  const toggleActive = async (id) => {
    try {
      await persistNotes(notes.map((item) => (item.id === id ? { ...item, isActive: !item.isActive } : item)));
    } catch (error) {
      openPopup('Error', `Failed to update note: ${error.message}`, 'error');
    }
  };

  const removeNote = async (id) => {
    try {
      await persistNotes(notes.filter((item) => item.id !== id));
      openPopup('Removed', 'Notes library item deleted.', 'success');
    } catch (error) {
      openPopup('Error', `Failed to remove note: ${error.message}`, 'error');
    }
  };

  if (loading) return <LoadingSpinner message="Loading notes library..." />;

  return (
    <div className="space-y-6">
      {popupNode}

      <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-blue-800 p-6 text-white">
        <h1 className="text-2xl font-bold">Premium Plus Notes Library</h1>
        <p className="mt-1 text-sm text-slate-200">Upload separate advanced notes for Premium Plus students only.</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Plus size={18} className="text-blue-600" />
          <h2 className="text-lg font-bold text-slate-900">Add Notes Item</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Title</label>
            <input
              type="text"
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              className="w-full rounded-lg border border-slate-300 p-3"
              placeholder="Advanced React Interview Notes"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Category</label>
            <input
              type="text"
              value={form.category}
              onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
              className="w-full rounded-lg border border-slate-300 p-3"
              placeholder="Frontend / DSA / Aptitude"
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-semibold text-slate-700">Description</label>
            <textarea
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              className="min-h-24 w-full rounded-lg border border-slate-300 p-3"
              placeholder="What students will get in this advanced notes pack..."
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Preview Image URL</label>
            <input
              type="url"
              value={form.imageUrl}
              onChange={(event) => setForm((prev) => ({ ...prev, imageUrl: event.target.value }))}
              className="w-full rounded-lg border border-slate-300 p-3"
              placeholder="https://example.com/notes-cover.jpg"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Notes Preview URL</label>
            <input
              type="url"
              value={form.notesUrl}
              onChange={(event) => setForm((prev) => ({ ...prev, notesUrl: event.target.value }))}
              className="w-full rounded-lg border border-slate-300 p-3"
              placeholder="https://drive.google.com/file/d/... or docs.google.com/..."
            />
            <p className="mt-1 text-xs text-slate-500">Students will only see the protected preview inside SucessKart, not a visible external link.</p>
          </div>
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))}
          />
          Publish immediately
        </label>
        <button
          type="button"
          onClick={addNote}
          disabled={saving}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          <Save size={18} />
          {saving ? 'Saving...' : 'Add To Notes Library'}
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <FileText size={18} className="text-slate-700" />
          <h2 className="text-lg font-bold text-slate-900">Existing Notes</h2>
        </div>
        {sortedNotes.length === 0 ? (
          <p className="text-sm text-slate-500">No Premium Plus notes uploaded yet.</p>
        ) : (
          <div className="space-y-3">
            {sortedNotes.map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="flex gap-4">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.title} className="h-24 w-28 rounded-lg object-cover" />
                    ) : (
                      <div className="flex h-24 w-28 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                        <Eye size={20} />
                      </div>
                    )}
                    <div>
                      <p className="font-semibold text-slate-900">{item.title}</p>
                      <p className="mt-1 text-xs font-medium uppercase tracking-wide text-blue-700">{item.category}</p>
                      {item.description ? <p className="mt-2 text-sm text-slate-600">{item.description}</p> : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${item.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                      {item.isActive ? 'Active' : 'Hidden'}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleActive(item.id)}
                      disabled={saving}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                    >
                      {item.isActive ? 'Hide' : 'Show'}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeNote(item.id)}
                      disabled={saving}
                      className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                    >
                      <Trash2 size={16} />
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminNotesLibrary;
