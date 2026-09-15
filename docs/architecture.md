# Arhitectura platformei LinguaPro

## Decizii tehnice

MVP-ul folosește **React 19 + TypeScript + Vite**. Interfața este componentizată, responsive și păstrează datele demonstrative în `localStorage`, astfel încât fluxul să poată fi testat fără infrastructură externă. Pentru producție, clientul comunică printr-un API REST cu un serviciu Node.js (Fastify), iar datele persistă în PostgreSQL. Această separare permite scalarea independentă a interfeței, API-ului și motorului de recomandări.

Autentificarea de producție folosește parole hash-uite (Argon2), token-uri JWT scurte cu refresh token rotativ și control de acces bazat pe roluri (RBAC): `admin`, `trainer`, `learner`.

## Componente

```text
React client
  |-- pagini pentru cursant / formator / administrator
  |-- client REST, stocare token securizată
  +--> Fastify REST API
         |-- autentificare şi RBAC
         |-- conţinut, evaluări, progres, recomandări
         |-- notificări programate
         +--> PostgreSQL
```

## Model relaţional

```text
roles 1--* users
users 1--* learner_profiles
users 1--* placement_attempts
professional_domains 1--* courses 1--* lessons 1--* exercises
courses *--* users (enrollments)
users 1--* exercise_results *--1 exercises
users 1--* lesson_progress *--1 lessons
users 1--* learning_goals
users 1--* notifications
users 1--* recommendations
```

### Tabele principale

| Tabel | Câmpuri esenţiale |
| --- | --- |
| `roles` | `id`, `name` |
| `users` | `id`, `name`, `email`, `password_hash`, `role_id`, `created_at` |
| `learner_profiles` | `user_id`, `target_language`, `domain_id`, `cefr_level`, `weekly_goal` |
| `professional_domains` | `id`, `name`, `description` |
| `courses` | `id`, `domain_id`, `author_id`, `title`, `level`, `published` |
| `lessons` | `id`, `course_id`, `title`, `content`, `position`, `duration_minutes` |
| `exercises` | `id`, `lesson_id`, `type`, `prompt`, `payload`, `answer_key` |
| `exercise_results` | `id`, `user_id`, `exercise_id`, `answer`, `score`, `feedback`, `completed_at` |
| `lesson_progress` | `user_id`, `lesson_id`, `status`, `percent`, `updated_at` |
| `placement_attempts` | `id`, `user_id`, `score`, `cefr_level`, `answers`, `completed_at` |
| `learning_goals` | `id`, `user_id`, `title`, `target_date`, `status` |
| `notifications` | `id`, `user_id`, `type`, `message`, `read_at`, `scheduled_for` |
| `recommendations` | `id`, `user_id`, `lesson_id`, `reason`, `score`, `created_at` |

## Reguli de personalizare

La finalizarea evaluării iniţiale, nivelul CEFR, domeniul şi obiectivul utilizatorului determină cursurile înscrise. După fiecare exerciţiu, scorurile sunt agregate pe tip de competenţă. O medie sub 70% generează o recomandare de recapitulare pentru lecţia sau competenţa asociată. Obiectivul săptămânal şi notificările sunt evaluate zilnic de un job programat.

## Structura proiectului

```text
src/
  components/     # componente UI reutilizabile
  data/           # conţinut demonstrativ şi tipuri
  services/       # client API / persistenţă locală
  App.tsx         # orchestrarea interfeţelor şi rolurilor
docs/
  architecture.md
  api.md
server/           # Fastify + PostgreSQL (următoarea etapă de producţie)
```
