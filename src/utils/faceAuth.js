import { supabase } from '../supabaseClient';
import { detectFace } from './detectFace';
import * as faceapi from 'face-api.js';
import { loadFaceRecognitionModels } from './loadFaceModels';

const localKey = (userId) => `face_auth_settings_${userId}`;
const loginDataKey = 'face_auth_login_data';

export const faceMfaSessionKey = (userId) => `face_mfa_verified_${userId}`;

export const captureVideoFrame = (video) =>
  new Promise((resolve, reject) => {
    if (!video || !video.videoWidth || !video.videoHeight) {
      reject(new Error('Camera is not ready yet.'));
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Could not capture photo from camera.'));
        return;
      }
      resolve(new File([blob], 'face-auth.jpg', { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.92);
  });

export const detectFaceFromVideo = async (video) => {
  const file = await captureVideoFrame(video);
  const result = await detectFace(file);
  return { ...result, file };
};

export const extractFaceDescriptorFromImage = async (file) => {
  await loadFaceRecognitionModels();
  const img = await new Promise((resolve, reject) => {
    const element = new Image();
    element.onload = () => {
      URL.revokeObjectURL(element.src);
      resolve(element);
    };
    element.onerror = () => {
      URL.revokeObjectURL(element.src);
      reject(new Error('Could not load face image.'));
    };
    element.src = URL.createObjectURL(file);
  });

  const detection = await faceapi
    .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 224 }))
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection?.descriptor) {
    throw new Error('No clear face detected. Please face the camera and try again.');
  }
  return Array.from(detection.descriptor);
};

export const extractFaceDescriptorFromVideo = async (video) => {
  const file = await captureVideoFrame(video);
  const descriptor = await extractFaceDescriptorFromImage(file);
  return { file, descriptor };
};

export const faceDistance = (a, b) => {
  const first = Array.isArray(a) ? a : [];
  const second = Array.isArray(b) ? b : [];
  if (!first.length || first.length !== second.length) return Number.POSITIVE_INFINITY;
  const sum = first.reduce((total, value, index) => total + ((Number(value) || 0) - (Number(second[index]) || 0)) ** 2, 0);
  return Math.sqrt(sum);
};

export const isFaceDescriptorMatch = (a, b, threshold = 0.52) => faceDistance(a, b) <= threshold;

const readLocalSettings = (userId) => {
  try {
    const raw = localStorage.getItem(localKey(userId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const writeLocalSettings = (userId, settings) => {
  const safe = { ...settings };
  delete safe.descriptor;
  try {
    localStorage.setItem(localKey(userId), JSON.stringify(safe));
  } catch {
    // Local fallback is best-effort.
  }
};

export const getFaceAuthSettings = (profile) => {
  if (!profile?.id) return { enabled: false, mfaEnabled: false, imageUrl: '', registeredAt: null };
  const local = readLocalSettings(profile.id);
  return {
    enabled: Boolean(profile.face_auth_enabled ?? local.enabled),
    mfaEnabled: Boolean(profile.face_mfa_enabled ?? local.mfaEnabled),
    imageUrl: profile.face_image_url || local.imageUrl || '',
    descriptor: profile.face_descriptor || null,
    registeredAt: profile.face_registered_at || local.registeredAt || null,
  };
};

export const isFaceMfaVerified = (userId) => {
  if (!userId) return false;
  try {
    return sessionStorage.getItem(faceMfaSessionKey(userId)) === 'true';
  } catch {
    return false;
  }
};

export const getStoredFaceLoginData = () => {
  try {
    const raw = localStorage.getItem(loginDataKey);
    if (!raw) return null;
    const decoded = decodeURIComponent(escape(atob(raw)));
    return JSON.parse(decoded);
  } catch {
    return null;
  }
};

export const markFaceMfaVerified = (userId) => {
  if (!userId) return;
  try {
    sessionStorage.setItem(faceMfaSessionKey(userId), 'true');
  } catch {
    // Ignore storage failures.
  }
};

export const clearFaceMfaVerified = (userId) => {
  if (!userId) return;
  try {
    sessionStorage.removeItem(faceMfaSessionKey(userId));
  } catch {
    // Ignore storage failures.
  }
};

export const clearFaceLoginData = () => {
  try {
    localStorage.removeItem(loginDataKey);
  } catch {
    // best-effort
  }
};

export const uploadFaceAuthImage = async (userId, file) => {
  if (!userId || !file) return '';
  const path = `face-auth/${userId}.jpg`;
  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' });
  if (error) throw error;
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return data?.publicUrl || '';
};

export const saveFaceAuthSettings = async (profile, settings) => {
  if (!profile?.id) throw new Error('Profile is not loaded.');
  const payload = {
    face_auth_enabled: Boolean(settings.enabled),
    face_mfa_enabled: Boolean(settings.mfaEnabled),
    face_image_url: settings.imageUrl || null,
    face_descriptor: settings.descriptor || null,
    face_registered_at: settings.registeredAt || null,
    updated_at: new Date().toISOString(),
  };

  const localPayload = {
    enabled: payload.face_auth_enabled,
    mfaEnabled: payload.face_mfa_enabled,
    imageUrl: payload.face_image_url || '',
    registeredAt: payload.face_registered_at || null,
  };
  writeLocalSettings(profile.id, localPayload);

  if (settings.enabled && settings.descriptor) {
    try {
      const encoded = btoa(unescape(encodeURIComponent(JSON.stringify({
        email: profile.email || '',
        descriptor: settings.descriptor,
        enabled: true,
      }))));
      localStorage.setItem(loginDataKey, encoded);
    } catch {
      // best-effort
    }
  } else if (!settings.enabled) {
    try {
      localStorage.removeItem(loginDataKey);
    } catch {
      // best-effort
    }
  }

  const { error } = await supabase
    .from('profiles')
    .update(payload)
    .eq('id', profile.id);

  if (error) {
    const text = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase();
    if (
      text.includes('face_auth_enabled') ||
      text.includes('face_mfa_enabled') ||
      text.includes('face_image_url') ||
      text.includes('face_descriptor') ||
      text.includes('face_registered_at')
    ) {
      return { savedToSupabase: false };
    }
    throw error;
  }

  return { savedToSupabase: true };
};
