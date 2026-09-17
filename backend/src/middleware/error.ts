import { ZodError } from 'zod'
import { FastifyError, FastifyReply, FastifyRequest } from 'fastify'

export function errorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof ZodError) {
    return reply.status(400).send({
      error: 'Validation Error',
      message: 'Bitte die Eingaben prüfen.',
      details: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }))
    })
  }
  const statusCode = error.statusCode || 500

  request.log.error({
    err: error,
    url: request.url,
    method: request.method
  })

  // Validation errors
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
