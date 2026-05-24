import * as faceapi from 'face-api.js';
import { loadFaceModels } from './loadFaceModels';

let modelsLoaded = false;
let loadingPromise = null;

function ensureModels() {
  if (modelsLoaded) return Promise.resolve(true);
  if (loadingPromise) return loadingPromise;
  loadingPromise = loadFaceModels()
    .then(() => { modelsLoaded = true; return true; })
    .catch(() => { modelsLoaded = false; return false; })
    .finally(() => { loadingPromise = null; });
  return loadingPromise;
}

function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(img.src); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(img.src); reject(new Error('Failed to load image')); };
    img.src = URL.createObjectURL(file);
  });
}

export async function detectFace(file) {
  if (!file) return { detected: false, error: 'No file provided' };

  const loaded = await ensureModels();
  if (!loaded) {
    return { detected: false, error: 'Face detection could not be initialized. Try uploading again.' };
  }

  try {
    const img = await fileToImage(file);
    const detections = await faceapi.detectAllFaces(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 224 }));
    return { detected: detections.length > 0, error: null };
  } catch {
    return { detected: false, error: 'Could not process the image. Try a different photo.' };
  }
}

export async function isFaceDetectionReady() {
  return ensureModels();
}
