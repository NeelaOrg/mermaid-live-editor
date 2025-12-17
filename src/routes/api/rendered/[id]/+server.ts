import { getRenderedSvg } from '$lib/server/renderedStore';

const headers = {
  'content-type': 'image/svg+xml; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  // Prevent script execution if the SVG is opened directly in a browser tab.
  'content-security-policy': "default-src 'none'; img-src data: https:; style-src 'unsafe-inline' https: data:; sandbox"
} as const;

export const GET = async ({ params }) => {
  const id = params.id;
  const entry = getRenderedSvg(id);
  if (!entry) {
    return new Response('Not found', { status: 404 });
  }
  return new Response(entry.svg, { status: 200, headers });
};

