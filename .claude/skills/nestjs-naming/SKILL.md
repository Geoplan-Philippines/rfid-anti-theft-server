---
name: nestjs-naming
description: Enforces concise, descriptive naming conventions for NestJS projects (controllers, services, DTOs, entities, modules, guards, interceptors, pipes, decorators, and more). Use this skill whenever generating or editing NestJS/TypeScript backend code — including scaffolding modules, writing CRUD endpoints, creating services, defining entities/DTOs, or reviewing existing NestJS code. Also trigger when the user asks to "clean up names", "fix naming", or requests NestJS best practices. Even if the user doesn't mention naming explicitly, apply these conventions any time NestJS code is produced.
---

# NestJS Naming Conventions

Apply these conventions to ALL NestJS code you generate or edit. Never fall back to generic CRUD names like `create`, `findAll`, `findOne`, `update`, `remove`.

---

## Core Principle

**Every name should read like a sentence describing what it does, scoped to its domain.**

```
BAD:  create(dto)          → What are we creating?
GOOD: createTeam(body)     → Clear, self-documenting
```

---

## Controllers & Services

Controllers and services share the same naming rules. Service methods mirror controller methods 1:1.

### Class naming
- `PluralEntity + Controller` / `PluralEntity + Service`: `TeamsController`, `TeamsService`

### Method naming
- **Verb + Entity** (singular): `createTeam`, `getTeam`, `updateTeam`, `archiveTeam`
- **Verb + Plural/Qualifier** for lists: `getAllTeams`, `getActiveTeams`, `searchTeams`
- Use domain-accurate verbs — `archive` not `remove` for soft-deletes, `revoke` for tokens, `assign` for roles
- Private service helpers use descriptive verbs: `validateTeamOwnership`, `buildTeamQuery`

### Controller-specific rules
- `@Body()` params are named `body` — the DTO type already describes the shape
- `async` on every handler, explicit `Promise<T>` return types

### Reference

```typescript
// ✅ CORRECT — controller
@Controller('teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Post()
  async createTeam(@Body() body: CreateTeamDTO): Promise<Team> {
    return this.teamsService.createTeam(body);
  }

  @Get()
  async getAllTeams(): Promise<Team[]> {
    return this.teamsService.getAllTeams();
  }

  @Get(':id')
  async getTeam(@Param('id', ParseUUIDPipe) id: string): Promise<Team> {
    return this.teamsService.getTeam(id);
  }

  @Patch(':id')
  async updateTeam(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateTeamDTO,
  ): Promise<Team> {
    return this.teamsService.updateTeam(id, body);
  }

  @Delete(':id')
  async archiveTeam(@Param('id', ParseUUIDPipe) id: string): Promise<Team> {
    return this.teamsService.archiveTeam(id);
  }
}

// ❌ WRONG — generic names, no async, verbose param names
export class TeamsController {
  @Post()
  create(@Body() createTeamDTO: CreateTeamDTO) { return this.teamsService.create(createTeamDTO); }
  @Get()
  findAll() { return this.teamsService.findAll(); }
  @Delete(':id')
  remove(@Param('id') id: string) { return this.teamsService.remove(id); }
}
```

---

## DTOs

### Class naming
- `Verb + Entity + DTO` in PascalCase
- `CreateTeamDTO`, `UpdateTeamDTO`, `InviteMemberDTO`, `FilterInvoicesDTO`
- Query/filter DTOs: `FilterTeamsDTO`, `PaginateTeamsDTO`, `SearchUsersDTO`

### Property naming
- camelCase, matching the entity field names exactly
- Boolean fields: `isActive`, `isVerified`, `hasAccess`

```typescript
// ✅ CORRECT
export class CreateTeamDTO {
  name: string;
  description?: string;
  isPublic: boolean;
}

// ❌ WRONG — generic name
export class CreateDto {
  name: string;
}
```

---

## Prisma Models

### Model naming
- Singular PascalCase: `Category`, `Team`, `OrganizationMember`

### Field naming
- camelCase for all fields: `createdAt`, `isArchived`, `parentCategory`
- Boolean fields prefixed with `is`/`has`: `isArchived`, `isActive`, `hasAccess`
- Map to snake_case columns with `@map()`, map table with `@@map()`
- Relations named after what they represent: `products`, `owner`, `members`

### Reference

```prisma
// ✅ CORRECT
model Category {
  id                            String                    @id @default(uuid())
  name                          String                    @unique
  description                   String?
  isArchived                    Boolean                   @default(false) @map("is_archived")

  products                      Product[]

  createdAt                     DateTime                  @default(now()) @map("created_at")
  updatedAt                     DateTime                  @updatedAt @map("updated_at")

  @@map("categories")
}

// ❌ WRONG — no @map, no @@map, snake_case fields
model category {
  id          String   @id @default(uuid())
  is_archived Boolean  @default(false)
  created_at  DateTime @default(now())
}
```

---

## Modules, Guards, Pipes, Interceptors, Decorators

| Type          | Pattern                        | Example                          |
|---------------|--------------------------------|----------------------------------|
| Module        | `PluralEntity + Module`        | `TeamsModule`, `AuthModule`      |
| Guard         | `Purpose + Guard`              | `RolesGuard`, `JwtAuthGuard`     |
| Pipe          | `Purpose + Pipe`               | `ParseUUIDPipe`, `TrimPipe`      |
| Interceptor   | `Purpose + Interceptor`        | `LoggingInterceptor`, `TimeoutInterceptor` |
| Decorator     | `@VerbOrNoun()`                | `@CurrentUser()`, `@OrgRoles()`, `@Public()` |
| Filter        | `Purpose + Filter`             | `HttpExceptionFilter`, `ValidationFilter` |
| Middleware    | `Purpose + Middleware`          | `CorsMiddleware`, `LoggerMiddleware` |

### Custom decorators
- Name reflects what they extract or enforce, not how
- `@CurrentUser()` not `@GetUserFromRequest()`
- `@CurrentOrganizationId()` not `@ExtractOrgId()`

---

## Files & Directories

```
teams/
├── teams.module.ts
├── teams.controller.ts
├── teams.service.ts
├── dto/
│   ├── create-team.dto.ts
│   └── update-team.dto.ts
├── guards/
│   └── team-membership.guard.ts
└── interfaces/
    └── team-with-members.interface.ts
```

- kebab-case for all filenames
- Suffix matches the NestJS construct: `.controller.ts`, `.service.ts`, `.module.ts`, `.guard.ts`, `.dto.ts`, `.interface.ts`, `.pipe.ts`, `.interceptor.ts`, `.filter.ts`, `.decorator.ts`

---

## Verb Cheat Sheet

Use domain-accurate verbs instead of generic CRUD:

| Instead of    | Consider (pick what fits)                                      |
|---------------|----------------------------------------------------------------|
| `create`      | `create` is fine — but scope it: `createTeam`, `createInvoice` |
| `findAll`     | `getAllTeams`, `getActiveUsers`, `listInvoices`, `searchOrders` |
| `findOne`     | `getTeam`, `getUser`, `getInvoiceById`                         |
| `update`      | `updateTeam`, `renameTeam`, `reassignOwner`, `markAsComplete`  |
| `remove`      | `archiveTeam`, `deleteUser`, `revokeToken`, `cancelInvite`     |
| `delete`      | `softDeleteTeam`, `hardDeleteUser`, `purgeExpiredTokens`       |

---

## Quick Checklist

Before submitting NestJS code, verify:

1. Every controller/service method name includes the entity: `createTeam` not `create`
2. `@Body()` params are named `body`, not `createSomethingDTO`
3. All handlers use `async` and declare `Promise<T>` return types
4. Filenames are kebab-case with proper suffixes
5. Prisma fields are camelCase, mapped to snake_case columns with `@map`/`@@map`
6. Custom decorators read naturally: `@CurrentUser()`, `@OrgRoles()`
7. Verbs match the actual operation — `archive` not `remove` for soft deletes