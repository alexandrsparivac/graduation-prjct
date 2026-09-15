# LinguaPro — învăţare profesională personalizată

O platformă web pentru învăţarea limbilor străine în contexte profesionale. Cursantul îşi stabileşte nivelul CEFR, domeniul şi obiectivul, apoi primeşte un parcurs cu lecţii, exerciţii, feedback şi recomandări relevante.

## Ce include MVP-ul

- autentificare demonstrativă şi roluri: cursant, formator, administrator;
- evaluare iniţială CEFR, domeniu profesional şi obiectiv personal;
- lecţii pentru comunicare, scriere, prezentări şi vocabular, cu feedback imediat;
- progres local, recomandări bazate pe scor şi simulare de practică orală;
- spaţiu de formator pentru cursuri şi cursanţi, plus administrare de roluri;
- design responsive, cu persistenţa datelor demo în `localStorage`.

## Stack şi motivaţie

Frontend-ul este React 19 + TypeScript + Vite: tipurile reduc erorile în fluxurile cu roluri şi date educaţionale, iar Vite oferă o experienţă rapidă de dezvoltare. Pentru producţie, arhitectura recomandă Fastify + PostgreSQL + JWT/Argon2. PostgreSQL este potrivit pentru relaţiile clare dintre cursuri, lecţii, rezultate şi progres; Fastify menţine API-ul REST performant şi uşor de testat.

MVP-ul nu trimite parole sau date în reţea; autentificarea şi datele sunt simulate local. Nu îl utiliza pentru conturi reale până când backend-ul documentat nu este implementat.

## Rulare locală

```bash
npm install
npm run dev
```

Deschide adresa afişată de Vite. Pentru un build de verificare:

```bash
npm run build
npm run lint
```

## Conturi demo

| Rol | Email |
| --- | --- |
| Cursant | `learner@linguapro.demo` |
| Formator | `trainer@linguapro.demo` |
| Administrator | `admin@linguapro.demo` |

Orice parolă de cel puţin şase caractere este acceptată în demo.

## Documentaţie

- [Arhitectură](docs/architecture.md)
- [Contract API REST](docs/api.md)
- [Testare funcţională](docs/testing.md)
