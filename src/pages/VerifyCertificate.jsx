import React, { useState } from 'react';
import { useEffect } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ShieldCheck, Search, CheckCircle, XCircle, ArrowLeft } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { getCertificateDisplayName } from '../utils/identityVerification';
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

const formatFallbackCertificateId = (submission) => {
  const issuedAt = submission?.submitted_at ? new Date(submission.submitted_at) : new Date();
  const y = issuedAt.getFullYear();
  const m = String(issuedAt.getMonth() + 1).padStart(2, '0');
  const d = String(issuedAt.getDate()).padStart(2, '0');
  const seed = `fallback-${submission?.id ?? `${y}${m}${d}`}`;
  const random = generateDeterministicCode(seed);
  return `SucessKart-${y}-${m}-${d}-${random}`;
};

const isPermissionError = (error) => {
  const message = String(error?.message || '').toLowerCase();
  const details = String(error?.details || '').toLowerCase();
  return (
    message.includes('permission denied') ||
    message.includes('row-level security') ||
    message.includes('jwt') ||
    details.includes('permission denied') ||
    details.includes('row-level security')
  );
};

const VerifyCertificate = () => {
  const { id: routeCertId } = useParams();
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [certId, setCertId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const shouldShowPublicActions = !user?.id && location.state?.fromHome === true;
  const shouldShowAboutBack = location.state?.fromAbout === true;

  const runVerify = async (rawCertId) => {
    const trimmedSource = rawCertId || certId;
    if (!trimmedSource?.trim()) return;
    setLoading(true);
    setResult(null);
    setPreviewUrl('');
    try {
      const trimmedId = trimmedSource.trim();
      const formattedMatch = trimmedId.match(/^SucessKart-(\d{4})-(\d{2})-(\d{2})-([A-Za-z0-9]{12})$/);

      let data = null;
      let error = null;

      if (formattedMatch) {
        const [, y, m, d] = formattedMatch;
        const baseDate = new Date(`${y}-${m}-${d}T00:00:00.000Z`);
        const start = new Date(baseDate.getTime() - 24 * 60 * 60 * 1000).toISOString();
        const end = new Date(baseDate.getTime() + 2 * 24 * 60 * 60 * 1000 - 1).toISOString();
        const resp = await supabase
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
        error = resp.error;
        if (!resp.error && resp.data) {
          data = resp.data.find((cert) => formatCertificateId(cert).toUpperCase() === trimmedId.toUpperCase()) || null;
        }

        if ((!data || error) && isPermissionError(error)) {
          const basicResp = await supabase
            .from('certificates')
            .select('id, issued_at, revoked_at')
            .gte('issued_at', start)
            .lte('issued_at', end);
          error = basicResp.error;
          if (!basicResp.error && basicResp.data) {
            data = basicResp.data.find((cert) => formatCertificateId(cert).toUpperCase() === trimmedId.toUpperCase()) || null;
          }
        }

        if (!data && !error) {
          const fallbackResp = await supabase
            .from('exam_submissions')
            .select(`
              id,
              submitted_at,
              score_percent,
              passed,
              user:profiles!exam_submissions_user_id_fkey(full_name, certificate_name, identity_verification_status, email),
              exam:exams(course_id, course:courses(title, category))
            `)
            .eq('passed', true)
            .gte('submitted_at', start)
            .lte('submitted_at', end);

          if (!fallbackResp.error && fallbackResp.data) {
            const matchedSubmission =
              fallbackResp.data.find(
                (sub) => formatFallbackCertificateId(sub).toUpperCase() === trimmedId.toUpperCase()
              ) || null;
            if (matchedSubmission) {
              data = {
                id: `fallback-${matchedSubmission.id}`,
                issued_at: matchedSubmission.submitted_at,
                revoked_at: null,
                user: matchedSubmission.user || null,
                course: matchedSubmission.exam?.course || null,
                _fallback: true,
              };
            }
          }
        }
      } else {
        const resp = await supabase
          .from('certificates')
          .select(`
            id,
            issued_at,
            revoked_at,
            user:profiles!certificates_user_id_fkey(full_name, certificate_name, identity_verification_status, email),
            course:courses!certificates_course_id_fkey(title, category)
          `)
          .eq('id', trimmedId)
          .single();
        error = resp.error;
        data = resp.data;

        if ((!data || error) && isPermissionError(error)) {
          const basicResp = await supabase
            .from('certificates')
            .select('id, issued_at, revoked_at')
            .eq('id', trimmedId)
            .single();
          error = basicResp.error;
          data = basicResp.data;
        }
      }
      
      if (error || !data) {
        setResult({ valid: false, message: 'Certificate ID not found. This certificate was not issued by SucessKart.' });
      } else if (data.revoked_at) {
        const { data: generatedMeta } = await supabase
          .from('generated_certificates')
          .select('award_type, award_name, reason, course_name')
          .eq('certificate_id', data.id)
          .maybeSingle();
        if (generatedMeta) {
          data.generated = generatedMeta;
        }
        setResult({
          valid: false,
          message: 'Certificate blocked: caught due to cheating/malpractice.',
          data
        });
      } else {
        if (!data._fallback) {
          const { data: generatedMeta } = await supabase
            .from('generated_certificates')
            .select('award_type, award_name, reason, course_name')
            .eq('certificate_id', data.id)
            .maybeSingle();
          if (generatedMeta) {
            data.generated = generatedMeta;
          }
        }
        setResult({ valid: true, message: 'Certificate is valid and authentic!', data });
        if (getCertificateDisplayName(data.user) && (data.course?.title || data.generated?.award_name || data.generated?.course_name)) {
          const formattedId = data._fallback ? certId.trim() : formatCertificateId(data);
          const dataUrl = await buildCertificateDataUrl(data, formattedId);
          setPreviewUrl(dataUrl);
        }
        if (!data._fallback) {
          await supabase.from('certificate_verifications').insert({ certificate_id: data.id });
        }
      }
    } catch (err) {
      setResult({ valid: false, message: 'Certificate not present in our records. Not issued by SucessKart.' });
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    await runVerify(certId);
  };

  useEffect(() => {
    if (!routeCertId) return;
    const decoded = decodeURIComponent(routeCertId);
    setCertId(decoded);
    runVerify(decoded);
  }, [routeCertId]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl p-8 space-y-6">
        {shouldShowPublicActions ? (
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <ArrowLeft size={16} />
              Back to Home
            </button>
            <Link to="/register" className="text-sm font-semibold text-amber-700 hover:text-amber-800">
              Create Account
            </Link>
          </div>
        ) : null}

        {shouldShowAboutBack ? (
          <div>
            <button
              type="button"
              onClick={() => navigate('/about')}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <ArrowLeft size={16} />
              Back to About
            </button>
          </div>
        ) : null}

        <div className="text-center">
          <div className="w-16 h-16 mx-auto bg-gold-400 rounded-full flex items-center justify-center mb-4">
            <ShieldCheck size={32} className="text-nani-dark" />
          </div>
          <h1 className="text-3xl font-bold text-nani-dark">Verify Certificate</h1>
          <p className="text-slate-600 mt-2">Enter a certificate ID to validate authenticity</p>
        </div>

        <form onSubmit={handleVerify} className="space-y-4">
          <div className="relative">
            <input
              type="text"
              value={certId}
              onChange={(e) => setCertId(e.target.value)}
              placeholder="Enter Certificate ID (SucessKart-YYYY-MM-DD-XXXXXXXXXXXX or UUID)"
              className="w-full p-4 pr-12 border-2 border-slate-200 rounded-xl focus:border-gold-400 focus:outline-none"
              required
            />
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full btn-gold py-4 font-bold text-lg disabled:opacity-60"
          >
            {loading ? 'Verifying...' : 'Verify Certificate'}
          </button>
        </form>

        {result && (
          <div className={`p-6 rounded-xl border-2 ${
            result.valid 
              ? 'bg-green-50 border-green-500' 
              : 'bg-red-50 border-red-500'
          }`}>
            <div className="flex items-center gap-3 mb-3">
              {result.valid ? (
                <CheckCircle size={28} className="text-green-600" />
              ) : (
                <XCircle size={28} className="text-red-600" />
              )}
              <h3 className="text-xl font-bold">{result.message}</h3>
            </div>
            {result.data && result.valid && (
              <div className="text-sm space-y-1 text-slate-700">
                <p><strong>Student:</strong> {getCertificateDisplayName(result.data.user)}</p>
                <p><strong>Course:</strong> {result.data.course?.title}</p>
                <p><strong>Category:</strong> {result.data.course?.category}</p>
                <p><strong>Issued:</strong> {new Date(result.data.issued_at).toLocaleDateString()}</p>
                {result.data.generated?.award_name && <p><strong>Award:</strong> {result.data.generated.award_name}</p>}
                {result.data.generated?.award_type && <p><strong>Type:</strong> {result.data.generated.award_type}</p>}
                {result.data.generated?.reason && <p><strong>Reason:</strong> {result.data.generated.reason}</p>}
                <div className="mt-4 rounded-xl border border-green-200 bg-white p-4">
                  <p className="font-semibold text-slate-900">Build yours on SucessKart</p>
                  <p className="mt-1 text-sm text-slate-600">Courses, mentorship, verified exams, resume builder, and shareable certificates are available from one account.</p>
                  <Link to="/register" className="mt-3 inline-flex items-center rounded-lg bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-700">
                    Join SucessKart
                  </Link>
                </div>
              </div>
            )}
            {result.data && !result.valid && result.data.revoked_at && (
              <div className="text-sm space-y-1 text-red-800">
                <p><strong>Student:</strong> {getCertificateDisplayName(result.data.user)}</p>
                <p><strong>Course:</strong> {result.data.course?.title}</p>
                <p><strong>Issued:</strong> {new Date(result.data.issued_at).toLocaleDateString()}</p>
                <p><strong>Blocked On:</strong> {new Date(result.data.revoked_at).toLocaleString()}</p>
                <p><strong>Reason:</strong> Caught due to cheating/malpractice.</p>
                {result.data.generated?.award_name && <p><strong>Award:</strong> {result.data.generated.award_name}</p>}
              </div>
            )}
          </div>
        )}

        {previewUrl && result?.valid && (
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-slate-700 mb-3">Certificate Preview</p>
            <img src={previewUrl} alt="Certificate preview" className="w-full h-auto border" />
          </div>
        )}
      </div>
    </div>
  );
};

export default VerifyCertificate;
