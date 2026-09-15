import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import pg from 'pg'
import { z } from 'zod'
import { hashPassword, verifyPassword } from './security.js'

const { Pool } = pg
const app = Fastify({ logger: true })
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

await app.register(cors, { origin: process.env.CLIENT_ORIGIN?.split(',') ?? false })
await app.register(jwt, { secret: process.env.JWT_SECRET ?? 'development-secret-change-me' })

app.decorate('authenticate', async (request) => request.jwtVerify())
app.decorate('authorize', (roles) => async (request, reply) => {
  await request.jwtVerify()
  if (!roles.includes(request.user.role)) return reply.code(403).send({ error: 'Insufficient permissions' })
})

function parse(schema, input, reply) {
  const result = schema.safeParse(input)
  if (!result.success) {
    reply.code(400).send({ error: 'Invalid request', issues: result.error.flatten() })
    return null
  }
  return result.data
}

function levelFromScore(score) {
  if (score < 20) return 'A1'
  if (score < 40) return 'A2'
  if (score < 60) return 'B1'
  if (score < 80) return 'B2'
  if (score < 90) return 'C1'
  return 'C2'
}

const registrationSchema = z.object({ name: z.string().trim().min(2).max(120), email: z.string().email().max(320), password: z.string().min(12).max(128) })
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) })
const placementSchema = z.object({ score: z.number().int().min(0).max(100), answers: z.array(z.unknown()), domainId: z.string().uuid().nullable().optional(), weeklyGoal: z.number().int().min(1).max(14).default(3), goal: z.string().trim().min(4).max(280) })
const courseSchema = z.object({ domainId: z.string().uuid(), title: z.string().trim().min(3).max(180), description: z.string().trim().min(10), level: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']), published: z.boolean().default(false) })
const resultSchema = z.object({ exerciseId: z.string().uuid(), answer: z.unknown(), score: z.number().int().min(0).max(100), feedback: z.string().max(1000).optional() })
const aiPathSchema = z.object({ language: z.string().trim().min(2).max(80), domains: z.array(z.string().trim().min(2).max(80)).min(1).max(8), level: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']), goal: z.string().trim().min(4).max(280) })

app.get('/health', async () => ({ status: 'ok' }))

app.post('/api/v1/ai/learning-path', async (request, reply) => {
  const body = parse(aiPathSchema, request.body, reply)
  if (!body) return
  const ollamaUrl = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434'
  const model = process.env.OLLAMA_MODEL ?? 'llama3.2:3b'
  const prompt = `You are an expert professional language learning designer. Return ONLY valid JSON, no markdown, using exactly this shape: {"title":"string","summary":"string","weeklyMinutes":number,"modules":[{"title":"string","description":"string","lessons":[{"title":"string","skill":"string","minutes":number}]}],"recommendations":["string"]}. Create a practical course for a learner who studies ${body.language}, works in these professional domains: ${body.domains.join(', ')}, has CEFR level ${body.level}, and wants to achieve: ${body.goal}. Create 3 modules with 2 lessons each. Keep all text concise and relevant to work.`
  try {
    const response = await fetch(`${ollamaUrl}/api/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, prompt, stream: false, format: 'json', options: { temperature: 0.4 } }) })
    if (!response.ok) return reply.code(503).send({ error: 'AI service unavailable', detail: `Start Ollama and pull ${model}.` })
    const result = await response.json()
    const course = JSON.parse(result.response)
    return { provider: 'ollama', model, course }
  } catch (error) {
    request.log.warn({ error }, 'AI learning path generation failed')
    return reply.code(503).send({ error: 'AI service unavailable', detail: `Start Ollama and pull ${model}.` })
  }
})

app.post('/api/v1/auth/register', async (request, reply) => {
  const body = parse(registrationSchema, request.body, reply)
  if (!body) return
  const passwordHash = await hashPassword(body.password)
  try {
    const { rows } = await pool.query('INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role', [body.name, body.email.toLowerCase(), passwordHash, 'learner'])
    await pool.query('INSERT INTO learner_profiles (user_id) VALUES ($1)', [rows[0].id])
    const token = app.jwt.sign({ sub: rows[0].id, role: rows[0].role, email: rows[0].email }, { expiresIn: '15m' })
    return reply.code(201).send({ user: rows[0], accessToken: token })
  } catch (error) {
    if (error.code === '23505') return reply.code(409).send({ error: 'Email already registered' })
    throw error
  }
})

app.post('/api/v1/auth/login', async (request, reply) => {
  const body = parse(loginSchema, request.body, reply)
  if (!body) return
  const { rows } = await pool.query('SELECT id, name, email, role, password_hash FROM users WHERE email = $1', [body.email.toLowerCase()])
  const user = rows[0]
  if (!user || !(await verifyPassword(body.password, user.password_hash))) return reply.code(401).send({ error: 'Invalid email or password' })
  const accessToken = app.jwt.sign({ sub: user.id, role: user.role, email: user.email }, { expiresIn: '15m' })
  return { user: { id: user.id, name: user.name, email: user.email, role: user.role }, accessToken }
})

app.get('/api/v1/users/me', { preHandler: [app.authenticate] }, async (request) => {
  const { rows } = await pool.query('SELECT u.id, u.name, u.email, u.role, p.target_language, p.cefr_level, p.weekly_goal, p.onboarding_complete FROM users u LEFT JOIN learner_profiles p ON p.user_id = u.id WHERE u.id = $1', [request.user.sub])
  return rows[0]
})

app.get('/api/v1/users', { preHandler: [app.authorize(['admin'])] }, async () => {
  const { rows } = await pool.query('SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC')
  return { users: rows }
})

app.patch('/api/v1/users/:id/role', { preHandler: [app.authorize(['admin'])] }, async (request, reply) => {
  const body = parse(z.object({ role: z.enum(['admin', 'trainer', 'learner']) }), request.body, reply)
  if (!body) return
  const { rows } = await pool.query('UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, email, role', [body.role, request.params.id])
  return rows[0] ?? reply.code(404).send({ error: 'User not found' })
})

app.post('/api/v1/placement-attempts', { preHandler: [app.authorize(['learner'])] }, async (request, reply) => {
  const body = parse(placementSchema, request.body, reply)
  if (!body) return
  const level = levelFromScore(body.score)
  const client = await pool.connect()
  await client.query('BEGIN')
  try {
    const { rows } = await client.query('INSERT INTO placement_attempts (user_id, score, cefr_level, answers) VALUES ($1, $2, $3, $4) RETURNING id, score, cefr_level, completed_at', [request.user.sub, body.score, level, JSON.stringify(body.answers)])
    await client.query('UPDATE learner_profiles SET domain_id = $1, cefr_level = $2, weekly_goal = $3, onboarding_complete = TRUE WHERE user_id = $4', [body.domainId ?? null, level, body.weeklyGoal, request.user.sub])
    await client.query('INSERT INTO learning_goals (user_id, title) VALUES ($1, $2)', [request.user.sub, body.goal])
    await client.query('COMMIT')
    return reply.code(201).send({ attempt: rows[0], learningPath: { level, domainId: body.domainId, weeklyGoal: body.weeklyGoal } })
  } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
})

app.get('/api/v1/courses', { preHandler: [app.authenticate] }, async (request) => {
  const { rows } = await pool.query('SELECT c.id, c.title, c.description, c.level, c.published, d.name AS domain, u.name AS author FROM courses c JOIN professional_domains d ON d.id = c.domain_id JOIN users u ON u.id = c.author_id WHERE c.published = TRUE OR c.author_id = $1 ORDER BY c.created_at DESC', [request.user.sub])
  return { courses: rows }
})

app.post('/api/v1/courses', { preHandler: [app.authorize(['trainer', 'admin'])] }, async (request, reply) => {
  const body = parse(courseSchema, request.body, reply)
  if (!body) return
  const { rows } = await pool.query('INSERT INTO courses (domain_id, author_id, title, description, level, published) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *', [body.domainId, request.user.sub, body.title, body.description, body.level, body.published])
  return reply.code(201).send(rows[0])
})

app.post('/api/v1/exercise-results', { preHandler: [app.authorize(['learner'])] }, async (request, reply) => {
  const body = parse(resultSchema, request.body, reply)
  if (!body) return
  const { rows } = await pool.query('INSERT INTO exercise_results (user_id, exercise_id, answer, score, feedback) VALUES ($1, $2, $3, $4, $5) RETURNING *', [request.user.sub, body.exerciseId, JSON.stringify(body.answer), body.score, body.feedback ?? null])
  if (body.score < 70) await pool.query("INSERT INTO recommendations (user_id, lesson_id, reason, score) SELECT $1, e.lesson_id, 'Recapitulă această competență: scor sub 70%.', 100 - $2 FROM exercises e WHERE e.id = $3", [request.user.sub, body.score, body.exerciseId])
  return reply.code(201).send(rows[0])
})

app.get('/api/v1/progress/me', { preHandler: [app.authorize(['learner'])] }, async (request) => {
  const { rows } = await pool.query('SELECT l.id, l.title, lp.status, lp.percent, lp.updated_at FROM lesson_progress lp JOIN lessons l ON l.id = lp.lesson_id WHERE lp.user_id = $1 ORDER BY lp.updated_at DESC', [request.user.sub])
  return { lessons: rows, averagePercent: rows.length ? Math.round(rows.reduce((total, lesson) => total + lesson.percent, 0) / rows.length) : 0 }
})

app.get('/api/v1/recommendations/me', { preHandler: [app.authorize(['learner'])] }, async (request) => {
  const { rows } = await pool.query('SELECT r.id, r.reason, r.score, r.created_at, l.id AS lesson_id, l.title AS lesson_title FROM recommendations r LEFT JOIN lessons l ON l.id = r.lesson_id WHERE r.user_id = $1 ORDER BY r.score DESC, r.created_at DESC LIMIT 10', [request.user.sub])
  return { recommendations: rows }
})

app.get('/api/v1/notifications', { preHandler: [app.authenticate] }, async (request) => {
  const { rows } = await pool.query('SELECT id, type, message, scheduled_for, read_at FROM notifications WHERE user_id = $1 AND scheduled_for <= NOW() ORDER BY read_at NULLS FIRST, scheduled_for DESC LIMIT 30', [request.user.sub])
  return { notifications: rows }
})

app.patch('/api/v1/notifications/:id/read', { preHandler: [app.authenticate] }, async (request, reply) => {
  const { rows } = await pool.query('UPDATE notifications SET read_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING id, read_at', [request.params.id, request.user.sub])
  return rows[0] ?? reply.code(404).send({ error: 'Notification not found' })
})

app.setErrorHandler((error, request, reply) => { request.log.error(error); reply.code(500).send({ error: 'Internal server error' }) })

const port = Number(process.env.PORT ?? 3001)
await app.listen({ port, host: process.env.HOST ?? '127.0.0.1' })
