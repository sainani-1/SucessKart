import React, { useEffect, useState } from 'react';
import { Award, Download, Eye, Linkedin, MessageCircle, XCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import usePopup from '../hooks/usePopup.jsx';
import LoadingSpinner from '../components/LoadingSpinner';
import { buildWhatsAppShareUrl, trackPremiumEvent } from '../utils/growth';
import { getCertificateDisplayName, hasApprovedIdentity } from '../utils/identityVerification';
import { buildCertificateDataUrl } from '../utils/certificateCanvas';
import { logError } from '../utils/errorLogger';

/**
 * MyCertificates Component
 * ========================
 * Displays user certificates with the official SkillPro branding
 * Features:
 * - View certificates in browser
 * - Download certificates as PDF
 * - Share certificates via URL
 * - Verify certificates using UUID or formatted ID
 * 
 * Certificate Format: SkillPro-YYYY-MM-DD-RANDOM12
 * Canvas Size: 1200x900px
 * Logo: Loaded from public/skillpro-logo.png
 */

let jsPdfLoader;

/**
 * Dynamically loads jsPDF library from local dependency
 * Caches the loader promise to prevent multiple imports
 * Used for PDF generation from canvas
 */
const loadJsPDF = async () => {
  if (!jsPdfLoader) {
    jsPdfLoader = import('jspdf');
  }
  return jsPdfLoader;
};

/**
 * generateDeterministicCode()
 * ===========================
 * Creates a unique 12-character code from certificate ID
 * Uses deterministic hashing so same input = same output
 * Output: Letters A-Z and digits 0-9
 * This ensures consistent certificate IDs across sessions
 */
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

/**
 * formatCertificateId()
 * ====================
 * Formats certificate ID in official SkillPro format
 * Format: SkillPro-YYYY-MM-DD-RANDOM12
 * 
 * Example: SkillPro-2026-01-04-PJEEZAML9K2X
 * 
 * Components:
 * - Prefix: "SkillPro" (branding)
 * - Date: Year-Month-Day when certificate was issued
 * - Random: 12-character unique code (deterministic based on certificate ID)
 */
const formatCertificateId = (cert) => {
  const date = cert?.issued_at ? new Date(cert.issued_at) : new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const random = generateDeterministicCode(String(cert?.id ?? `${y}${m}${d}`));
  return `SkillPro-${y}-${m}-${d}-${random}`;
};

const resolveCertificateCourseTitle = (cert) =>
  cert?.generated_course_name || cert?.generated_name || cert?.course?.title || 'General Achievement';

const toSafeFilePart = (value) =>
  String(value || '')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * MyCertificates Component
 * Uses: useAuth (profile, isPremium), usePopup (notifications)
 * State: certificates[], loading, downloading
 * 
 * Displays certificates in a card grid with options to:
 * 1. View in browser (opens in new tab)
 * 2. Download as PDF
 * 3. Share via URL (copy shareable link)
 */
const MyCertificates = () => {
  const { profile } = useAuth();
  const [certificates, setCertificates] = useState([]);
  const [revokedCount, setRevokedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(null);
  const { popupNode, openPopup } = usePopup();
  const certificateDisplayName = getCertificateDisplayName(profile);
  const idVerifiedForCertificates = hasApprovedIdentity(profile);

  /**
   * downloadCertificate()
   * =====================
   * Downloads certificate as PDF file
   * Process:
   * 1. Awaits buildCertificateDataUrl to generate canvas
   * 2. Loads jsPDF library from CDN
   * 3. Creates PDF from canvas data URL
  * 4. Sets filename: SkillPro_Certificate_[FormattedID].pdf
   * 5. Triggers browser download
   * 
   * File format: PDF (landscape, 1200x900pt)
   */
  const downloadCertificate = async (cert) => {
    try {
      setDownloading(cert.id);
      const { jsPDF } = await loadJsPDF();
      const formattedId = formatCertificateId(cert);
      const dataUrl = await buildCertificateDataUrl(cert, formattedId, { profile });
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [2400, 1800] });
      pdf.addImage(dataUrl, 'PNG', 0, 0, 2400, 1800);
      const userName = toSafeFilePart(certificateDisplayName || 'User');
      const courseName = toSafeFilePart(resolveCertificateCourseTitle(cert) || 'Course');
      const fileName = `SkillPro Certificate ${userName} ${courseName}.pdf`;
      pdf.save(fileName);
      setDownloading(null);
    } catch (err) {
      logError({ message: 'Download error:', source: 'MyCertificates', details: err })
      openPopup('Download failed', 'Failed to download certificate.', 'error');
      setDownloading(null);
    }
  };

  const shareOnLinkedIn = (cert) => {
    try {
      const certId = formatCertificateId(cert);
      const verifyUrl = `${window.location.origin}/verify/${encodeURIComponent(certId)}`;
      const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(verifyUrl)}`;
      trackPremiumEvent('certificate_share_linkedin', 'my_certificates', { certId }, profile?.id || null);
      window.open(linkedinUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      logError({ message: 'LinkedIn share error:', source: 'MyCertificates', details: err })
      openPopup('Share failed', 'Unable to open LinkedIn share.', 'error');
    }
  };

  const shareOnWhatsApp = (cert) => {
    try {
      const certId = formatCertificateId(cert);
      const verifyUrl = `${window.location.origin}/verify/${encodeURIComponent(certId)}`;
      const text = `My SkillPro certificate is verified here: ${verifyUrl}. Join SkillPro to build yours too.`;
      trackPremiumEvent('certificate_share_whatsapp', 'my_certificates', { certId }, profile?.id || null);
      window.open(buildWhatsAppShareUrl(text), '_blank', 'noopener,noreferrer');
    } catch (err) {
      logError({ message: 'WhatsApp share error:', source: 'MyCertificates', details: err })
      openPopup('Share failed', 'Unable to open WhatsApp share.', 'error');
    }
  };

  /**
   * useEffect Hook - Fetch User Certificates
   * ==========================================
   * Runs once when profile loads
   * Queries certificates table for current user
   * Joins with courses table to get course details
   * Joins with exam_submissions table to get scores
   * 
   * Data structure:
   * {
   *   id: UUID,
   *   issued_at: timestamp,
   *   course: { title, category },
   *   exam: { score_percent }
   * }
   */
  useEffect(() => {
    const fetchCerts = async () => {
      if (!profile) return;
      try {
        const [
          { data: certData, error: certError },
          { data: passedData, error: passedError },
          { data: generatedData, error: generatedError }
        ] = await Promise.all([
          supabase
          .from('certificates')
          .select(`
            id,
            issued_at,
            revoked_at,
            exam_submission_id,
            course_id,
            course:courses(title, category),
            exam:exam_submissions(score_percent)
          `)
          .eq('user_id', profile.id),
          supabase
            .from('exam_submissions')
            .select(`
              id,
              submitted_at,
              score_percent,
              exam:exams(course_id, course:courses(title, category))
            `)
            .eq('user_id', profile.id)
            .eq('passed', true),
          supabase
            .from('generated_certificates')
            .select(`
              id,
              award_type,
              award_name,
              reason,
              course_name,
              issued_at,
              certificate:certificates(id, issued_at, revoked_at)
            `)
            .eq('user_id', profile.id),
        ]);

        if (certError) throw certError;
        if (passedError) throw passedError;
        if (generatedError) throw generatedError;

        const certRows = certData || [];
        const passedRows = passedData || [];
        const generatedRows = generatedData || [];
        const generatedByCertId = new Map(
          generatedRows
            .filter((g) => g?.certificate?.id)
            .map((g) => [String(g.certificate.id), g])
        );
        const certBySubmission = new Set(
          certRows
            .map(cert => cert.exam_submission_id)
            .filter(Boolean)
            .map(String)
        );
        const certByCourse = new Set(
          certRows
            .map(cert => cert.course_id)
            .filter(Boolean)
            .map(String)
        );

        const fallbackCerts = passedRows
          .filter(sub => !certBySubmission.has(String(sub.id)))
          .filter(sub => {
            const courseId = sub?.exam?.course_id;
            if (!courseId) return true;
            return !certByCourse.has(String(courseId));
          })
          .map(sub => ({
            id: `fallback-${sub.id}`,
            issued_at: sub.submitted_at || new Date().toISOString(),
            revoked_at: null,
            exam_submission_id: sub.id,
            course_id: sub?.exam?.course_id ?? null,
            course: sub?.exam?.course || { title: 'Course', category: '' },
            exam: { score_percent: sub.score_percent },
            _fallback: true,
          }));

        const enrichedCerts = certRows.map((cert) => {
          const g = generatedByCertId.get(String(cert.id));
          if (!g) return cert;
          return {
            ...cert,
            _generated: true,
            generated_id: g.id,
            generated_type: g.award_type,
            generated_name: g.award_name,
            generated_reason: g.reason,
            generated_course_name: g.course_name,
          };
        });

        const generatedWithoutCert = generatedRows
          .filter((g) => !g?.certificate?.id)
          .map((g) => ({
            id: `generated-${g.id}`,
            issued_at: g.issued_at,
            revoked_at: g?.certificate?.revoked_at || null,
            course: { title: g.course_name || g.award_name || 'Generated Certificate', category: '' },
            exam: null,
            _generated: true,
            generated_id: g.id,
            generated_type: g.award_type,
            generated_name: g.award_name,
            generated_reason: g.reason,
            generated_course_name: g.course_name,
          }));

        const merged = [...enrichedCerts, ...fallbackCerts, ...generatedWithoutCert].sort(
          (a, b) => new Date(b.issued_at).getTime() - new Date(a.issued_at).getTime()
        );
        const revoked = merged.filter(cert => cert.revoked_at).length;
        setRevokedCount(revoked);
        setCertificates(merged);
      } catch (err) {
        logError({ message: err, source: 'MyCertificates', details: null })
      } finally {
        setLoading(false);
      }
    };
    fetchCerts();
  }, [profile]);

  if (loading) return <div>Loading certificates...</div>;

  /**
   * Certificate Display
   * ===================
   * Shows all user certificates in a grid
   * Each certificate card has:
   * - Course title and icon
   * - Issue date
   * - Three action buttons:
   *   1. Eye icon: View certificate in browser
   *   2. Download icon: Download as PDF
   *   3. Share icon: (future feature)
   */
  return (
    <div className="space-y-6">
      {popupNode}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Certificates</h1>
          <p className="text-slate-500">Certificate name: {certificateDisplayName}</p>
        </div>
      </div>

      {!idVerifiedForCertificates && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4">
          Verify your government ID in `Verify My ID` before certificates can be issued in your name.
        </div>
      )}

      {revokedCount > 0 && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-4">
          One or more certificates are blocked due to cheating/malpractice.
        </div>
      )}

      {!idVerifiedForCertificates ? (
        <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm text-center text-slate-600">
          Your certificate section will unlock after ID verification is approved.
        </div>
      ) : certificates.length === 0 ? (
        <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm text-center text-slate-600">
          No certificates yet. Complete exams with 70%+ score to earn your first one.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {certificates.map(cert => (
            <div
              key={cert.id}
              className={`bg-white border rounded-xl p-4 shadow-sm flex flex-col space-y-3 ${
                cert.revoked_at ? 'border-red-200 bg-red-50/30' : 'border-slate-100'
              }`}
            >
              <div className="flex items-center space-x-3">
                {cert.revoked_at ? (
                  <XCircle className="text-red-600" size={24} />
                ) : (
                  <Award className="text-gold-400" size={24} />
                )}
                <div className="flex-1">
                  <p className="font-semibold text-slate-900">
                    {cert.generated_name || cert.generated_course_name || cert.course?.title || 'Certificate'}
                  </p>
                  <p className="text-xs text-slate-500">Issued on {new Date(cert.issued_at).toLocaleDateString()}</p>
                  <p className="text-xs text-slate-500">Awarded to {certificateDisplayName}</p>
                  <p className="text-xs font-mono text-blue-600 mt-1">ID: {formatCertificateId(cert)}</p>
                  {cert.generated_type && (
                    <p className="text-xs text-indigo-700 mt-1">
                      Type: {cert.generated_type === 'course_completion'
                        ? 'Completion Of Certificate'
                        : cert.generated_type === 'weekly_contest_winner'
                        ? 'Winner Of The Weekly Contest'
                        : 'Custom'}
                    </p>
                  )}
                  {cert.generated_reason && (
                    <p className="text-xs text-slate-700 mt-1">Reason: {cert.generated_reason}</p>
                  )}
                  {cert.revoked_at && (
                    <p className="text-xs text-red-700 mt-1">
                      Blocked due to cheating/malpractice.
                    </p>
                  )}
                </div>
              </div>
              {typeof cert.exam?.score_percent === 'number' ? (
                <div className="inline-flex items-center w-fit px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-700">
                  Score: {cert.exam.score_percent.toFixed(1)}%
                </div>
              ) : cert._generated ? (
                <div className="inline-flex items-center w-fit px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-xs font-semibold text-indigo-700">
                  Admin Generated Certificate
                </div>
              ) : (
                <div className="inline-flex items-center w-fit px-3 py-1 rounded-full bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700">
                  Verified Certificate
                </div>
              )}
              <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <a
                  href={`/certificate-preview/${encodeURIComponent(formatCertificateId(cert))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`min-w-0 inline-flex min-h-[3rem] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 hover:shadow ${
                    cert.revoked_at ? 'opacity-50 pointer-events-none cursor-not-allowed' : ''
                  }`}
                >
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                    <Eye size={19} strokeWidth={2.4} />
                  </span>
                  <span className="truncate">View Certificate</span>
                </a>
                <button
                  onClick={() => downloadCertificate(cert)}
                  disabled={downloading === cert.id || !!cert.revoked_at}
                  className="min-w-0 inline-flex min-h-[3rem] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-slate-900 to-slate-800 px-3 py-3 text-sm font-semibold text-white shadow-md transition hover:from-slate-800 hover:to-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/15 text-white">
                    <Download size={19} strokeWidth={2.4} />
                  </span>
                  <span className="truncate">{downloading === cert.id ? 'Downloading...' : 'Download PDF'}</span>
                </button>
                <button
                  onClick={() => shareOnLinkedIn(cert)}
                  disabled={!!cert.revoked_at}
                  className="min-w-0 inline-flex min-h-[3rem] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 px-3 py-3 text-sm font-semibold text-white shadow-md transition hover:from-blue-800 hover:to-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/15 text-white">
                    <Linkedin size={19} strokeWidth={2.4} />
                  </span>
                  <span className="truncate">Share LinkedIn</span>
                </button>
                <button
                  onClick={() => shareOnWhatsApp(cert)}
                  disabled={!!cert.revoked_at}
                  className="min-w-0 inline-flex min-h-[3rem] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 px-3 py-3 text-sm font-semibold text-white shadow-md transition hover:from-emerald-700 hover:to-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/15 text-white">
                    <MessageCircle size={19} strokeWidth={2.4} />
                  </span>
                  <span className="truncate">WhatsApp</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MyCertificates;
