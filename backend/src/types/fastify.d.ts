import { SessionUser } from '../middleware/auth.js'
import { preHandlerHookHandler } from 'fastify'
declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser
  }
  interface FastifyInstance {
    authenticate: preHandlerHookHandler
  }
}
