export const getProfileCompletionIssues = (profile) => {
  if (!profile) return ['profile'];

  const issues = [];
  if (!String(profile.full_name || '').trim()) issues.push('full_name');
  if (!String(profile.phone || '').trim()) issues.push('phone');

  if ((profile.role || 'student') === 'student') {
    if (!String(profile.education_level || '').trim()) issues.push('education_level');
    if (!String(profile.study_stream || profile.core_subject || '').trim()) issues.push('study_stream');
  }

  if (profile.auth_provider === 'google' || profile.google_profile_completed === false) {
    if (!profile.terms_accepted) issues.push('terms_accepted');
    if (!profile.google_profile_completed) issues.push('google_profile_completed');
  }

  return issues;
};

export const isProfileComplete = (profile) => getProfileCompletionIssues(profile).length === 0;
