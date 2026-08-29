export class AppError extends Error {
  constructor(message, { status = 500, code = 'internal_error', details = undefined, cause = undefined } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = this.constructor.name;
    this.status = status;
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message, options = {}) {
    super(message, { status: 400, code: 'validation_error', ...options });
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Запись не найдена.', options = {}) {
    super(message, { status: 404, code: 'not_found', ...options });
  }
}

export class ConflictError extends AppError {
  constructor(message, options = {}) {
    super(message, { status: 409, code: 'conflict', ...options });
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message = 'Размер запроса превышает допустимый лимит.', options = {}) {
    super(message, { status: 413, code: 'payload_too_large', ...options });
  }
}

export class UnprocessableEntityError extends AppError {
  constructor(message, options = {}) {
    super(message, { status: 422, code: 'unprocessable_entity', ...options });
  }
}

export function httpStatusOf(error) {
  return Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599 ? error.status : 500;
}
