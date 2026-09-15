# API REST LinguaPro

Prefix: `/api/v1`. Toate răspunsurile sunt JSON. Endpoint-urile protejate cer antetul `Authorization: Bearer <access-token>`.

| Metodă | Endpoint | Rol | Scop |
| --- | --- | --- | --- |
| POST | `/auth/register` | public | Creează un cont. |
| POST | `/auth/login` | public | Returnează access şi refresh token. |
| GET | `/users/me` | orice rol | Profilul sesiunii curente. |
| GET/PATCH | `/users` şi `/users/:id` | admin | Listează şi gestionează utilizatori. |
| POST | `/placement-attempts` | learner | Salvează evaluarea şi nivelul CEFR calculat. |
| GET/PATCH | `/learning-goals` | learner | Citeşte sau actualizează obiectivele personale. |
| GET | `/courses` | autentificat | Filtrează după limbă, domeniu şi nivel. |
| POST/PATCH/DELETE | `/courses/:id` | trainer, admin | Gestionează cursuri proprii. |
| POST | `/exercise-results` | learner | Salvează răspuns, scor şi feedback. |
| GET | `/progress/me` | learner | Istoric agregat de progres. |
| GET | `/recommendations/me` | learner | Lecţii recomandate pe baza rezultatelor. |
| GET/PATCH | `/notifications` şi `/notifications/:id/read` | learner | Afişează şi marchează notificări. |

## Exemple

```json
POST /api/v1/auth/register
{
  "name": "Elena Rusu",
  "email": "elena@example.com",
  "password": "minimum-12-characters",
  "role": "learner"
}
```

```json
POST /api/v1/exercise-results
{
  "exerciseId": "f49c...",
  "answer": "Could we schedule a call?",
  "score": 100
}
```

Serverul deduce utilizatorul din token, validează permisiunea de acces la lecţie şi returnează feedback-ul calculat. Parolele, refresh token-urile şi răspunsurile la exerciţii nu se includ în log-uri.
