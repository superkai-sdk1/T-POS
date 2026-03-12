/** Compress image to max size and JPEG quality 0.7 (~10-30KB) */
export function compressImage(file: File, maxSize = 256): Promise<{ blob: Blob; dataUrl: string }> {
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      if (width > height) {
        if (width > maxSize) { height = (height * maxSize) / width; width = maxSize; }
      } else {
        if (height > maxSize) { width = (width * maxSize) / height; height = maxSize; }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({ blob: file, dataUrl: URL.createObjectURL(file) });
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          resolve({ blob: blob || file, dataUrl });
        },
        'image/jpeg',
        0.7
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ blob: file, dataUrl: URL.createObjectURL(file) });
    };
    img.src = objectUrl;
  });
}
