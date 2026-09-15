# Testare funcţională şi de utilizabilitate

## Verificări efectuate

La 16 septembrie 2026, build-ul de producţie (`npm run build`) şi analiza statică (`npm run lint`) au trecut fără erori. A fost verificat în browser fluxul de intrare cu contul demo de cursant şi navigarea către recomandări; pagina afișează lecţiile cu progres sub pragul de 70%.

## Checklist funcţional

| Modul | Scenariu de verificare | Rezultat aşteptat |
| --- | --- | --- |
| Autentificare | Intră cu unul dintre cele trei conturi demo | Se deschide spaţiul aferent rolului. |
| Înregistrare | Creează un cont de cursant cu email valid | Începe evaluarea iniţială. |
| Evaluare | Răspunde la cele trei întrebări şi completează domeniul/obiectivul | Se salvează nivelul calculat şi se afişează dashboard-ul. |
| Lecţii | Deschide o lecţie, selectează un răspuns şi finalizează | Apare feedback, iar progresul devine 100%. |
| Progres | Deschide pagina Progres după finalizare | Media şi bara lecţiei se actualizează. |
| Recomandări | Deschide Recomandări cu lecţii sub 70% | Sunt afişate doar zonele ce necesită recapitulare. |
| Oral | Introdu un răspuns de minimum 8 cuvinte şi cere feedback | Este afişat feedback de claritate/pronunţie. |
| Formator | Intră ca formator şi adaugă un curs | Cursul nou apare în lista locală. |
| Administrator | Intră ca administrator şi schimbă un rol | Eticheta de rol se actualizează local. |

## Flux de utilizabilitate

Parcursul principal de test este: **înregistrare → evaluare → dashboard personalizat → exerciţiu → progres → recomandare**. La 680px sau mai puţin, sidebar-ul devine un antet compact, cardurile de management se aşază pe o singură coloană, iar câmpurile din evaluare rămân uşor de completat.

## Limitări MVP

Persistenţa este locală în browser şi nu substituie un test end-to-end cu API şi PostgreSQL. În etapa de producţie, checklistul se automatizează cu Playwright pentru fluxul principal, teste de integrare Fastify pentru autorizare/RBAC şi teste de migrare PostgreSQL.
