export const GET = async ({ url }) => {
  const target = url.searchParams.get('url');
  if (!target) {
    return new Response('Missing url', { status: 400 });
  }
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return new Response('Invalid url', { status: 400 });
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return new Response('Unsupported protocol', { status: 400 });
  }
  try {
    const res = await fetch(parsed.toString(), { redirect: 'follow' });
    if (!res.ok) {
      return new Response(`Upstream error: ${res.status}`, { status: 502 });
    }
    const text = await res.text();
    return new Response(text, {
      status: 200,
      headers: {
        'content-type': 'image/svg+xml; charset=utf-8'
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch';
    return new Response(message, { status: 502 });
  }
};
