import assert from 'node:assert/strict';
import test from 'node:test';
import { ConflictError, NotFoundError, ValidationError, httpStatusOf } from '../../../src/shared/errors.js';

test('shared application errors expose stable HTTP status values', () => {
  assert.equal(httpStatusOf(new ValidationError('bad')), 400);
  assert.equal(httpStatusOf(new NotFoundError()), 404);
  assert.equal(httpStatusOf(new ConflictError('conflict')), 409);
  assert.equal(httpStatusOf(new Error('boom')), 500);
});
