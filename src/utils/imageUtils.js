import { logError } from '../utils/errorLogger';

export const prepareAvatarFile = async (file, options = {}) => {
  if (!file) return null;
  if (!file.type?.startsWith('image/')) return file;

  const {
    maxWidth = 512,
    maxHeight = 512,
    quality = 0.85,
    outputType = 'image/jpeg'
  } = options;

  const loadImage = (src) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    const scale = Math.min(1, maxWidth / img.width, maxHeight / img.height);
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, outputType, quality);
    });

    if (!blob) return file;

    const newName = file.name.replace(/\.[^.]+$/, '.jpg');
    return new File([blob], newName, { type: outputType });
  } catch (err) {
    logError({ message: 'Image resize failed, using original file', source: 'imageUtils', details: err });
    return file;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};
