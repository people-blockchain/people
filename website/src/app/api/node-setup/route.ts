import { resolvePublicNodeSetup } from '@/lib/node-setup';

export function GET() {
  return Response.json(resolvePublicNodeSetup({
    PUBLIC_NODE_IMAGE: process.env.PUBLIC_NODE_IMAGE,
    PUBLIC_NODE_NETWORK_URL: process.env.PUBLIC_NODE_NETWORK_URL,
  }), { headers: { 'Cache-Control': 'no-store' } });
}
