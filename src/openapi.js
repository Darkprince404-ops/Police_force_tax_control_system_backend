import swaggerUi from 'swagger-ui-express';
import { Router } from 'express';

const spec = {
  openapi: '3.0.0',
  info: { title: 'Police Tax Control API', version: '0.1.0' },
  paths: {
    '/api/health': { get: { summary: 'Health', responses: { 200: { description: 'ok' } } } },
  },
};

export const openApiRouter = Router();
openApiRouter.use('/', swaggerUi.serve, swaggerUi.setup(spec));

