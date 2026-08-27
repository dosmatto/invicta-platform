import { writeFile } from 'node:fs/promises';
export async function POST(req: Request): Promise<Response> {
  await writeFile('/private/tmp/claude-501/f11/classe.pdf', Buffer.from(await req.arrayBuffer()));
  return Response.json({ ok: true });
}
