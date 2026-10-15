import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppManagementController } from './app-management.controller';

function controllerRoutes(): string[] {
  const base = Reflect.getMetadata(PATH_METADATA, AppManagementController) as string;
  const prototype = AppManagementController.prototype as unknown as Record<string, unknown>;
  return Object.getOwnPropertyNames(prototype)
    .filter((name) => name !== 'constructor')
    .flatMap((name) => {
      const handler = prototype[name];
      if (typeof handler !== 'function') return [];
      const path = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
      if (path == null || method == null) return [];
      return [`${RequestMethod[method]} /${base}${path ? `/${path}` : ''}`];
    })
    .sort();
}

describe('PHAROS-compatible app-management API contract', () => {
  it('keeps the complete method/path surface', () => {
    expect(controllerRoutes()).toEqual([
      'DELETE /app/ads/:id',
      'DELETE /app/exercise-categories/:id',
      'DELETE /app/exercises/:id',
      'DELETE /app/news/:id',
      'DELETE /app/notifications/:id',
      'DELETE /app/offers/:id',
      'DELETE /app/payment-methods/:id',
      'DELETE /app/trainers/:id',
      'GET /app/about',
      'GET /app/ads',
      'GET /app/exercise-categories',
      'GET /app/exercises',
      'GET /app/invitations',
      'GET /app/invitations/status/:status',
      'GET /app/news',
      'GET /app/notifications',
      'GET /app/offers',
      'GET /app/payment-methods',
      'GET /app/payment-methods/manage',
      'GET /app/trainers',
      'POST /app/ads',
      'POST /app/exercise-categories',
      'POST /app/exercises',
      'POST /app/invitations',
      'POST /app/news',
      'POST /app/notifications',
      'POST /app/offers',
      'POST /app/payment-methods',
      'POST /app/trainers',
      'PUT /app/about',
      'PUT /app/ads/:id',
      'PUT /app/exercise-categories/:id',
      'PUT /app/exercises/:id',
      'PUT /app/invitations/:id',
      'PUT /app/invitations/:id/status',
      'PUT /app/news/:id',
      'PUT /app/offers/:id',
      'PUT /app/payment-methods/:id',
      'PUT /app/trainers/:id',
    ]);
  });

  it('documents canonical ONE80 offers, trainers, uploads and every /app route family', () => {
    const docs = readFileSync(resolve(process.cwd(), '../docs/APP_MANAGEMENT_API.md'), 'utf8');
    for (const path of [
      '/app/about', '/app/invitations', '/app/offers', '/app/trainers',
      '/app/exercise-categories', '/app/exercises', '/app/news', '/app/ads',
      '/app/notifications', '/app/payment-methods',
    ]) expect(docs).toContain(path);
    expect(docs).toContain('PUT /club-subscription-types/{id}/promo');
    expect(docs).toContain('GET /member/packages');
    expect(docs).toContain('GET /member/trainers');
    expect(docs).toContain('/api/uploads/public/{fileId}');
  });
});
