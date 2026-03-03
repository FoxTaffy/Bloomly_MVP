import { FastifyInstance } from 'fastify';
import { uploadFile } from './service.js';

export async function mediaRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/upload',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const data = await request.file();

      if (!data) {
        return reply.code(400).send({ success: false, data: null, error: { code: 'NO_FILE', message: 'No file uploaded' } });
      }

      try {
        const chunks: Buffer[] = [];
        for await (const chunk of data.file) {
          chunks.push(chunk as Buffer);
        }
        const buf = Buffer.concat(chunks);

        if (buf.length === 0) {
          return reply.code(400).send({ success: false, data: null, error: { code: 'NO_FILE', message: 'Uploaded file is empty' } });
        }

        const folder = ((request.query as any).folder || 'posts') as 'posts' | 'avatars' | 'banners' | 'messages' | 'backgrounds';
        const url = await uploadFile(buf, data.filename, data.mimetype, folder);
        return reply.send({ success: true, data: { url }, error: null });
      } catch (err: any) {
        fastify.log.error({ err }, 'Media upload failed');
        return reply.code(500).send({ success: false, data: null, error: { code: 'UPLOAD_ERROR', message: err?.message ?? String(err) } });
      }
    },
  );
}
