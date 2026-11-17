import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import { ZodError } from 'zod'

export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
) {
  const statusCode = error.statusCode || 500

  request.log.error({
    err: error,
    url: request.url,
    method: request.method
  })

  // Validation errors
  if (error instanceof ZodError) {
    return reply.status(400).send({
      error: 'Validation Error',
      message: 'Invalid request data',
      details: error.issues
    })
  }
  if (error.validation) {
    return reply.status(400).send({
      error: 'Validation Error',
      message: error.message,
      details: error.validation
    })
  }

  // JWT errors
  if (error.code === 'FST_JWT_NO_AUTHORIZATION_IN_HEADER') {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Missing authorization header'
    })
  }

  if (error.code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED') {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Token expired'
    })
  }

  // Database errors (pg-specific)
  if ((error as any).code === '23505') {
    return reply.status(409).send({
      error: 'Conflict',
      message: 'Resource already exists'
    })
  }

  if ((error as any).code === '23503') {
    return reply.status(400).send({
      error: 'Bad Request',
      message: 'Referenced resource does not exist'
    })
  }

  // Default error
  return reply.status(statusCode).send({
    error: error.name || 'Internal Server Error',
    message: statusCode === 500 ? 'An unexpected error occurred' : error.message
  })
}
