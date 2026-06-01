import * as faceapi from "face-api.js";

const MODEL_URL = "/models";

async function ensureBackend() {
  try {
    await faceapi.tf.setBackend('cpu');
  } catch {
    // cpu backend fallback
  }
}

export async function loadFaceModels() {
  await ensureBackend();
  await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
  window.faceapi = faceapi;
}

export async function loadFaceRecognitionModels() {
  await ensureBackend();
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ]);
  window.faceapi = faceapi;
}
