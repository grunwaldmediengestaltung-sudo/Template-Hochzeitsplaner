import { getStore } from '@netlify/blobs';

const STORE_NAME = 'hochzeit-bilder';

export default async (req, context) => {
  const url = new URL(req.url);
  const key = url.searchParams.get('key');

  if(!key){
    return new Response('Fehlender Bild-Schlüssel', { status: 400 });
  }

  const store = getStore(STORE_NAME);
  const blob = await store.get(key, { type: 'arrayBuffer' });

  if(!blob){
    return new Response('Bild nicht gefunden', { status: 404 });
  }

  const meta = await store.getMetadata(key);
  let contentType = meta && meta.metadata && meta.metadata.contentType;

  if(!contentType){
    // Fallback: Content-Type anhand der Dateiendung bestimmen
    const ext = (key.split('.').pop() || '').toLowerCase();
    const extToType = {
      pdf: 'application/pdf',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml'
    };
    contentType = extToType[ext] || 'application/octet-stream';
  }

  const headers = {
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=31536000, immutable'
  };

  if(contentType === 'application/pdf'){
    headers['Content-Disposition'] = 'inline; filename="vertrag.pdf"';
  }

  return new Response(blob, {
    status: 200,
    headers
  });
};

export const config = {
  path: '/.netlify/functions/image'
};
