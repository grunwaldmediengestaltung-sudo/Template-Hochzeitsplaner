import { getStore } from '@netlify/blobs';

const STORE_NAME = 'hochzeit-daten';
const KEY = 'wedding-data';

export default async (req, context) => {
  const store = getStore(STORE_NAME);

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  if(req.method === 'OPTIONS'){
    return new Response(null, { status: 204, headers });
  }

  if(req.method === 'GET'){
    const data = await store.get(KEY, { type: 'json' });
    return new Response(JSON.stringify(data || {}), { status: 200, headers });
  }

  if(req.method === 'POST'){
    try{
      const body = await req.json();
      await store.setJSON(KEY, body);
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
    }catch(e){
      return new Response(JSON.stringify({ error: 'Ungültige Daten' }), { status: 400, headers });
    }
  }

  return new Response(JSON.stringify({ error: 'Methode nicht erlaubt' }), { status: 405, headers });
};

export const config = {
  path: '/.netlify/functions/data'
};
