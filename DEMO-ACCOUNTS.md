# Examify Proof-of-Concept Demo Accounts

All accounts below are fictional and intended only for presentations/testing.

## Institutions

| Institution | Username | Password |
|---|---|---|
| Northbridge Academy | `demo.northbridge@examify.test` | `Northbridge!2026` |
| Riverside Technical Institute | `demo.riverside@examify.test` | `Riverside!2026` |
| Horizon Learning Center | `demo.horizon@examify.test` | `Horizon!2026` |

## Teachers

| Teacher | Username | Password | Assigned institution/class |
|---|---|---|---|
| Daniel Carter | `demo.daniel.carter@examify.test` | `DanielTeacher!26` | Northbridge Academy · Computer Science 10-A |
| Sofia Rivera | `demo.sofia.rivera@examify.test` | `SofiaTeacher!26` | Riverside Technical Institute · Applied Mathematics 11-B |
| Michael Chen | `demo.michael.chen@examify.test` | `MichaelTeacher!26` | Horizon Learning Center · STEM & Robotics 10-C |

## Parents

| Parent | Username | Password | Children |
|---|---|---|---|
| Laura Bennett | `demo.laura.bennett@examify.test` | `LauraParent!2026` | Emma Bennett, Ethan Bennett |
| Carlos Mendez | `demo.carlos.mendez@examify.test` | `CarlosParent!2026` | Sofia Mendez, Lucas Mendez |
| Priya Shah | `demo.priya.shah@examify.test` | `PriyaParent!2026` | Anika Shah, Aarav Shah |

## Students

| Student | Username | Password | Parent | Institution |
|---|---|---|---|---|
| Emma Bennett | `demo.emma.bennett@examify.test` | `EmmaStudent!2026` | Laura Bennett | Northbridge Academy |
| Ethan Bennett | `demo.ethan.bennett@examify.test` | `EthanStudent!2026` | Laura Bennett | Northbridge Academy |
| Sofia Mendez | `demo.sofia.mendez@examify.test` | `SofiaStudent!2026` | Carlos Mendez | Riverside Technical Institute |
| Lucas Mendez | `demo.lucas.mendez@examify.test` | `LucasStudent!2026` | Carlos Mendez | Riverside Technical Institute |
| Anika Shah | `demo.anika.shah@examify.test` | `AnikaStudent!2026` | Priya Shah | Horizon Learning Center |
| Aarav Shah | `demo.aarav.shah@examify.test` | `AaravStudent!2026` | Priya Shah | Horizon Learning Center |

## Demo relationships

- **Northbridge Academy → Daniel Carter → Emma & Ethan Bennett**
- **Riverside Technical Institute → Sofia Rivera → Sofia & Lucas Mendez**
- **Horizon Learning Center → Michael Chen → Anika & Aarav Shah**

Each parent has two linked minor children. Each institution has an academic year, one class, one assigned teacher, two enrolled students, accepted institution relationships, sample posts, and sample student/teacher message history.

## Install

Unzip this package into the Examify project, then make sure `.env.local` contains:

```bash
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

Do not commit that key to Git.

Then run:

```bash
node scripts/create-multi-poc-demo-accounts.mjs
```

The script is rerunnable: existing demo Auth accounts are updated rather than intentionally duplicated.