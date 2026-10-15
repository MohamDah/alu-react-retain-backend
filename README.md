<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Local database

PostgreSQL runs in Docker on `127.0.0.1:5434`. The local database and user are
`retain`, with password `retain_local`. These credentials are for local development only.

The initial setup includes a local `.env`. On a fresh checkout, copy `.env.example`
to `.env`, then run from this directory:

```bash
npm run db:up
npm run db:generate
```

Apply the committed migration with `npm run db:deploy`. It creates the application
tables and the protected `Uncategorized` category. For later model changes, use
`npm run db:migrate -- --name describe_change`. Use `npm run db:studio` to inspect
the database. PrismaService is exported by PrismaModule for feature modules.

`npm run db:down` stops PostgreSQL while preserving its data in a Docker volume.
Building the backend or starting watch mode automatically regenerates the Prisma client.

## Prisma schema

The schema is in [prisma/schema.prisma](prisma/schema.prisma):

- `User`: UUID, unique normalized email, scrypt password hash, USER/ADMIN role, registration timestamp.
- `Category`: UUID, unique name, isDefault flag. The seeded Uncategorized category is immutable.
- `Expense`: UUID, title, decimal amount, category, date, payment method, nullable notes, owner, creation timestamp.
- `Budget`: UUID, decimal amount, month, year, owner. One budget per user/month/year.

Amounts are positive, with at most two decimal places. JSON request amounts must
be numbers; response amounts are decimal strings. Aggregated values always have
two decimal places. Dates use `YYYY-MM-DD`; payment methods are strings (such as
`CARD`, `CASH`, or `TRANSFER`). All spending is assumed to use one currency.

## Authentication

Set `JWT_SECRET` in `.env` to a random secret of at least 32 characters. The included
local secret must never be used in production. Generate a replacement with:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

`POST /auth/signup` and `POST /auth/signin` accept:

```json
{ "email": "person@example.com", "password": "Strong-password-123" }
```

Signup returns 201, signin returns 200. Both return `accessToken`, `tokenType`,
`expiresIn` (3600 seconds), and `user` (id, email, role). Password hashes are never
returned. Use `Authorization: Bearer <accessToken>` for every other API route.
The starter `GET /` remains public.

Signup always creates a USER. To provision an admin, sign up normally and use
`npm run db:studio` to change that user's role to ADMIN. There is deliberately no
public role-changing endpoint. Guards reload the user's role on every request,
so promotion/demotion applies immediately to existing tokens.

Auth endpoints are limited to 10 requests per minute per IP, and other endpoints
to 120. The limiter uses process-local storage; multi-instance production deployments
need shared storage. JWTs expire after one hour; refresh tokens and logout/revocation
are not implemented.

## Render And Netlify

Deploy this backend as a Render web service and set `DATABASE_URL`, `JWT_SECRET`,
and `FRONTEND_ORIGIN` in Render's environment settings. `FRONTEND_ORIGIN` must be
the exact Netlify site origin (scheme and hostname only, no path or trailing slash),
for example `https://retain-app.netlify.app`. Multiple deployed origins can be
comma-separated. Add custom Netlify domains as additional origins. The backend
only returns CORS permission for configured origins.

In Netlify's build environment, set `VITE_API_BASE_URL` to the Render service's
HTTPS origin, for example `https://retain-api.onrender.com` (no `/api` suffix),
then redeploy the frontend. Vite embeds this value into the static build.
Development can leave it unset and use the Vite `/api` proxy instead.

## REST API

| Resource          | Methods            | Access              |
| ----------------- | ------------------ | ------------------- |
| `/expenses`       | GET, POST          | Authenticated owner |
| `/expenses/:id`   | GET, PATCH, DELETE | Authenticated owner |
| `/budgets`        | GET, POST          | Authenticated owner |
| `/budgets/:id`    | GET, PATCH, DELETE | Authenticated owner |
| `/categories`     | GET                | Authenticated users |
| `/categories/:id` | GET                | Authenticated users |
| `/categories`     | POST               | Admin               |
| `/categories/:id` | PATCH, DELETE      | Admin               |
| `/admin/insights` | GET                | Admin               |

Expense creation:

```json
{
  "title": "Lunch",
  "amount": 12.34,
  "categoryId": "00000000-0000-4000-8000-000000000001",
  "date": "2026-10-11",
  "paymentMethod": "CARD",
  "notes": "Cafe"
}
```

`GET /expenses` accepts `page` (default 1), `limit` (default 20, maximum 100),
`categoryId`, `startDate`, `endDate` (inclusive), `paymentMethod`, `search`
(case-insensitive title), `minAmount`, and `maxAmount`. It returns `items`, `total`,
`page`, `limit`, and `totalPages`, ordered by date descending with stable ID ties.

Budget creation: `{"amount":500,"month":10,"year":2026}`. Budget listing accepts
optional `month` and `year` filters. Category creation accepts `name` and optional
`isDefault`. The flag identifies default categories; all deletion reassignment
specifically targets the seeded Uncategorized category.

PATCH accepts only editable fields. Expense notes can be cleared with `null`.
Clients cannot set `userId`, `role`, or IDs. Deletes return 204; missing or other-user
records return 404, invalid input returns 400, missing/invalid tokens return 401,
admin-only access violations return 403, and unique/foreign-key conflicts return 409.

Category deletion locks the category, reassigns **all users'** affected expenses,
and deletes it in one transaction. Any failure rolls back the entire operation.
Uncategorized cannot be renamed, changed, or deleted through the API.

## Admin insights

`GET /admin/insights` returns a consistent snapshot containing:

- `totalRegisteredUsers`, `totalExpensesRecorded`, `totalValueOfExpenses`.
- `currentMonth`: UTC `month`, `year`, `totalExpenses`, and `totalValue`, based on expense dates.
- `spendingPerCategory`: categoryId, name, totalExpenses, totalValue for every category, including zero spending.
- `top5Categories`, `bottom5Categories`: ranked by total value, with name-based ties.
- `recentExpenses`, `recentUsers`: at most five each, ordered by creation/registration time, without password hashes.

## Verification

```bash
npm run db:up
npm run test:all
npm run lint
```

API tests use the compiled Nest app to preserve decorator metadata. Each suite
creates a temporary PostgreSQL schema, applies committed migrations, and removes
the schema afterward without touching development data. The database user needs
permission to create/drop schemas. Tests cover authentication, ownership, validation,
pagination, budget uniqueness, admin restrictions, category reassignment/rollback,
and insight totals/rankings. Build/type checks remain strict.

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Observability

In production applications, observability is essential for understanding how your system behaves, detecting issues early, and maintaining reliable performance.

[NestJS Observe](https://observe.nestjs.com) automatically instruments your NestJS application, giving you deep visibility into your system with minimal setup:

- **Distributed tracing:** Follow requests across services and understand how they flow through your system.
- **Waterfall analysis:** Visualize request execution and identify slow operations, bottlenecks, and unexpected delays.
- **Performance analysis:** Analyze application performance in real time and quickly pinpoint areas that need optimization.
- **Metrics:** Track key application and infrastructure metrics to understand system health and performance trends.
- **Logging:** Centralize and correlate logs with traces and other telemetry to make debugging easier.
- **Error tracking:** Detect errors quickly and investigate their root causes with the surrounding context.
- **SLA monitoring:** Track service-level objectives and identify when your application is approaching or exceeding defined thresholds.
- **Alarms and alerts:** Set up alerts for critical errors, performance degradation, SLA violations, and other anomalies so your team can react quickly.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Auto-instrument your application with [NestJS Observer](https://observer.nestjs.com). Distributed tracing, metrics, and logging made easy. Error tracking and performance monitoring for your NestJS applications.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
