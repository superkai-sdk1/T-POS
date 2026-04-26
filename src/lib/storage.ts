/**
 * Storage клиент для MinIO (замена Supabase Storage)
 */

async function uploadFile(blob: Blob, filename: string, folder: string = 'uploads'): Promise<{ url?: string; key?: string; error?: string }> {
  try {
    const reader = new FileReader();
    const base64 = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    // Remove data URL prefix
    const base64Data = base64.split(',')[1];

    const res = await fetch('/api/storage/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file: base64Data,
        filename,
        folder,
      }),
    });

    const json = await res.json();
    if (!res.ok || json.error) {
      return { error: json.error || 'Ошибка загрузки файла' };
    }

    return { url: json.data.url, key: json.data.key };
  } catch (e) {
    return { error: 'Ошибка загрузки файла' };
  }
}

/**
 * Supabase-compatible API wrapper
 */
export const storage = {
  from: (bucket: string) => ({
    upload: (path: string, file: Blob | File) => {
      return {
        then: async (resolve: (value: any) => any) => {
          const filename = path.split('/').pop() || `file_${Date.now()}.jpg`;
          const folder = path.split('/')[0] || 'uploads';
          const result = await uploadFile(file, filename, folder);
          if (result.error) {
            resolve({ error: result.error, data: null });
          } else {
            resolve({ error: null, data: { path: result.key } });
          }
        },
      };
    },
  }),
};

export default storage;
