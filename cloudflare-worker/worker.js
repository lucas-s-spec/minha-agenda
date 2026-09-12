// Cole este código no Cloudflare Worker (dash.cloudflare.com > Workers & Pages > seu worker > Edit code).
// Secrets necessários (Settings > Variables and Secrets, todos como "Secret"):
//   GOOGLE_CLIENT_ID     -> o Client ID do OAuth "Agenda AtenderBem"
//   GOOGLE_CLIENT_SECRET -> o Client Secret NOVO (rotacionado) desse mesmo OAuth client
//   SHARED_TOKEN         -> b5b54de57f01b1189be0d911e0bbd2b154e4bcc1 (o mesmo token já usado no index.html)
//   GOOGLE_REFRESH_TOKEN -> preenchido DEPOIS, no passo do /oauth/start (veja instruções)

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/oauth/start') {
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
      authUrl.searchParams.set('redirect_uri', url.origin + '/oauth/callback');
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/calendar.events');
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('prompt', 'consent');
      return Response.redirect(authUrl.toString(), 302);
    }

    if (url.pathname === '/oauth/callback') {
      const code = url.searchParams.get('code');
      if (!code) return new Response('Faltou o parametro code', { status: 400 });
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          redirect_uri: url.origin + '/oauth/callback',
          grant_type: 'authorization_code'
        })
      });
      const tokenData = await tokenRes.json();
      if (!tokenData.refresh_token) {
        return new Response(
          'Nao veio refresh_token na resposta: ' + JSON.stringify(tokenData) +
          '\n\nDica: revogue o acesso em https://myaccount.google.com/permissions e acesse /oauth/start de novo.',
          { status: 400 }
        );
      }
      return new Response(
        'Copie este REFRESH TOKEN e salve como secret GOOGLE_REFRESH_TOKEN no Worker:\n\n' + tokenData.refresh_token,
        { headers: { 'Content-Type': 'text/plain' } }
      );
    }

    if (request.method === 'GET') {
      const token = url.searchParams.get('token');
      if (token !== env.SHARED_TOKEN) return json({ error: 'unauthorized' }, 401);
      const action = url.searchParams.get('action');

      if (action === 'ping') return json({ ok: true, ping: 'pong' });

      if (action === 'events') {
        const days = parseInt(url.searchParams.get('days'), 10) || 14;
        const accessToken = await getAccessToken(env);
        const now = new Date();
        const end = new Date(now.getTime() + days * 86400000);
        const params = new URLSearchParams({
          timeMin: now.toISOString(),
          timeMax: end.toISOString(),
          singleEvents: 'true',
          orderBy: 'startTime',
          maxResults: '50'
        });
        const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?' + params.toString(), {
          headers: { Authorization: 'Bearer ' + accessToken }
        });
        const data = await res.json();
        if (!res.ok) return json({ error: data.error?.message || 'erro ao buscar eventos' }, 502);
        const events = (data.items || []).map(item => ({
          id: item.id,
          title: item.summary || '(Sem título)',
          start: item.start?.dateTime || item.start?.date,
          end: item.end?.dateTime || item.end?.date,
          allDay: !item.start?.dateTime,
          description: item.description || ''
        }));
        return json({ ok: true, events });
      }

      return json({ error: 'unknown action' }, 400);
    }

    if (request.method === 'POST') {
      let body;
      try { body = JSON.parse(await request.text()); } catch { return json({ error: 'invalid json' }, 400); }
      if (body.token !== env.SHARED_TOKEN) return json({ error: 'unauthorized' }, 401);

      const accessToken = await getAccessToken(env);
      const start = new Date(body.date + 'T' + body.time + ':00');
      const durationMin = parseInt(body.duration, 10) || 30;
      const end = new Date(start.getTime() + durationMin * 60000);

      const eventPayload = {
        summary: body.summary || 'Reunião',
        description: body.description || '',
        start: { dateTime: start.toISOString(), timeZone: 'America/Sao_Paulo' },
        end: { dateTime: end.toISOString(), timeZone: 'America/Sao_Paulo' }
      };
      if (body.email) eventPayload.attendees = [{ email: body.email }];

      const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
        body: JSON.stringify(eventPayload)
      });
      const data = await res.json();
      if (!res.ok) return json({ error: data.error?.message || 'erro ao criar evento' }, 502);
      return json({ ok: true, id: data.id });
    }

    return new Response('Not found', { status: 404 });
  }
};

async function getAccessToken(env) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token'
    })
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Falha ao renovar access token: ' + JSON.stringify(data));
  return data.access_token;
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json' } });
}
