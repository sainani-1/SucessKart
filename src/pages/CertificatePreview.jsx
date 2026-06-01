import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import LoadingSpinner from '../components/LoadingSpinner';
import { buildCertificateDataUrl } from '../utils/certificateCanvas';

const generateDeterministicCode = (seed) => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  let code = '';
  for (let i = 0; i < 12; i += 1) {
    hash = (hash * 1664525 + 1013904223) >>> 0;
    code += alphabet[hash % alphabet.length];
  }
  return code;
};

const formatCertificateId = (cert) => {
  const date = cert?.issued_at ? new Date(cert.issued_at) : new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const random = generateDeterministicCode(String(cert?.id ?? `${y}${m}${d}`));
  return `SucessKart-${y}-${m}-${d}-${random}`;
};

const CertificatePreview = () => {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!id) {
        setError('Invalid certificate id.');
        setLoading(false);
        return;
      }
      try {
        const decodedId = decodeURIComponent(id);
        const match = decodedId.match(/^SucessKart-(\d{4})-(\d{2})-(\d{2})-([A-Za-z0-9]{12})$/);
        if (!match) throw new Error('Invalid certificate format.');
        const [, y, m, d] = match;
        const baseDate = new Date(`${y}-${m}-${d}T00:00:00.000Z`);
        const start = new Date(baseDate.getTime() - 24 * 60 * 60 * 1000).toISOString();
        const end = new Date(baseDate.getTime() + 2 * 24 * 60 * 60 * 1000 - 1).toISOString();

        const { data, error: certErr } = await supabase
          .from('certificates')
          .select(`
            id,
            issued_at,
            revoked_at,
            user:profiles!certificates_user_id_fkey(full_name, certificate_name, identity_verification_status, email),
            course:courses!certificates_course_id_fkey(title, category)
          `)
          .gte('issued_at', start)
          .lte('issued_at', end);
        if (certErr) throw certErr;

        const cert = (data || []).find((row) => formatCertificateId(row).toUpperCase() === decodedId.toUpperCase());
        if (!cert) throw new Error('Certificate not found.');
        if (cert.revoked_at) throw new Error('Certificate is blocked.');

        const { data: generated } = await supabase
          .from('generated_certificates')
          .select('award_type, award_name, reason, course_name')
          .eq('certificate_id', cert.id)
          .maybeSingle();
        if (generated) cert.generated = generated;

        const url = await buildCertificateDataUrl(cert, decodedId);
        setPreviewUrl(url);
      } catch (e) {
        setError(e.message || 'Failed to load certificate preview.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  if (loading) return <LoadingSpinner message="Loading certificate preview..." />;

  return (
    <div className="min-h-screen bg-slate-100 p-4">
      {error ? (
        <div className="max-w-3xl mx-auto bg-white border border-red-200 rounded-xl p-6 text-red-700">{error}</div>
      ) : (
        <img src={previewUrl} alt="Certificate preview" className="max-w-5xl w-full mx-auto border bg-white shadow" />
      )}
    </div>
  );
};

export default CertificatePreview;
