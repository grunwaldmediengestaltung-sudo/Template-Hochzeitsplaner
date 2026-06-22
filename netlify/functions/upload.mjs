import { getStore } from '@netlify/blobs';

const STORE_NAME = 'hochzeit-bilder';

export default async (req, context) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  if(req.method === 'OPTIONS'){
    return new Response(null, { status: 204, headers });
  }

  if(req.method !== 'POST'){
    return new Response(JSON.stringify({ error: 'Methode nicht erlaubt' }), { status: 405, headers });
  }

  try{
    const { filename, dataUrl } = await req.json();
    if(!dataUrl || !dataUrl.startsWith('data:')){
      return new Response(JSON.stringify({ error: 'Ungültige Datei' }), { status: 400, headers });
    }

    const matches = dataUrl.match(/^data:([a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if(!matches){
      return new Response(JSON.stringify({ error: 'Ungültiges Dateiformat' }), { status: 400, headers });
    }

    const mimeType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');

    const extMap = { 'application/pdf': 'pdf' };
    const ext = extMap[mimeType] || mimeType.split('/')[1] || 'bin';
    const key = `${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;

    const store = getStore(STORE_NAME);
    await store.set(key, buffer, {
      metadata: { contentType: mimeType, originalName: filename || '' }
    });

    return new Response(JSON.stringify({ ok: true, url: `/.netlify/functions/image?key=${encodeURIComponent(key)}` }), { status: 200, headers });
  }catch(e){
    return new Response(JSON.stringify({ error: 'Upload fehlgeschlagen' }), { status: 500, headers });
  }
};

export const config = {
  path: '/.netlify/functions/upload'
};
