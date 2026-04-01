import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createHmac } from 'node:crypto';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { initData } = await req.json();
    if (!initData || typeof initData !== 'string') {
      return new Response(JSON.stringify({ valid: false, error: 'Missing initData' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
    if (!BOT_TOKEN) {
      return new Response(JSON.stringify({ valid: false, error: 'Bot token not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse initData query string
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) {
      return new Response(JSON.stringify({ valid: false, error: 'Missing hash' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build data-check-string: sort all key=value pairs except "hash", join with \n
    params.delete('hash');
    const entries = Array.from(params.entries());
    entries.sort((a, b) => a[0].localeCompare(b[0]));
    const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join('\n');

    // secret_key = HMAC-SHA256("WebAppData", BOT_TOKEN)
    const secretKey = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();

    // calculated_hash = HMAC-SHA256(secret_key, data_check_string)
    const calculatedHash = createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (calculatedHash !== hash) {
      return new Response(JSON.stringify({ valid: false, error: 'Invalid hash' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract user info
    const userStr = params.get('user');
    let tg_id: number | null = null;
    if (userStr) {
      try {
        const userData = JSON.parse(userStr);
        tg_id = userData.id ?? null;
      } catch {
        // Couldn't parse user data
      }
    }

    // Check auth_date is not too old (allow 24 hours)
    const authDate = Number(params.get('auth_date') || 0);
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > 86400) {
      return new Response(JSON.stringify({ valid: false, error: 'Auth data expired' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ valid: true, tg_id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ valid: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
