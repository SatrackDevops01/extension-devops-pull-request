# AGENTS.md

> **Mantenimiento obligatorio**: Cada vez que se modifiquen archivos del proyecto (código, configuración, manifiesto, scripts), este archivo **debe actualizarse** para reflejar los cambios. Incluye: nuevos inputs, cambios de arquitectura, convenciones modificadas, issues resueltos o agregados, y cambios de versión.

## Project Overview

Azure DevOps extension that adds a `pull-request-reviewer` pipeline task. It collects PR diffs via `simple-git`, sends them to Azure OpenAI (Azure AI Foundry format) for code review, and posts results as PR thread comments. See [README.md](README.md) for pipeline setup and task inputs.

## Build & Test

All commands run from `pull-request-reviewer/`:

```bash
npm install
npm run build       # clean + tsc → dist/
npm run dev         # tsc --watch
npm test            # jest (scaffold only — no tests implemented yet)
npm run lint        # eslint src/**/*.ts
npm run lint:fix    # eslint --fix
npm run package     # cd .. && tfx extension create (runs from repo root)
```

> `npm run package` uses a local `tfx-cli` (devDependency) and changes to the repo root before running, since `vss-extension.json` references relative paths like `images/` and `pull-request-reviewer/`.

## Architecture

```
pull-request-reviewer/src/
├── index.ts              # Entry point: reads task inputs, orchestrates review flow
├── config/               # Static data (binary file extensions list)
├── core/
│   ├── git/              # Low-level git: fetch branches, compute diffs, filter binaries
│   ├── repository/       # Repository class: wraps simple-git, applies include/exclude filters
│   └── review/           # AI review engine: prompt building, chunking, OpenAI REST calls, token tracking
├── services/
│   └── pr/               # Azure DevOps PR API: create/delete thread comments
├── types/                # Shared interfaces (git, pr, repository)
└── utils/                # Helpers: extract file extensions, normalize branch names
```

- `index.ts` is both the executable entry point and the package export surface (re-exports all modules).
- `core/review/review.ts` calls Azure OpenAI via direct `node-fetch` REST, not the `openai` SDK.

### API Call Format (Azure AI Foundry)

The extension uses the **Azure AI Foundry** endpoint format (not classic Azure OpenAI):

- **Auth header**: `Authorization: Bearer <api_key>` (not `api-key`)
- **Request body** always includes: `model`, `max_completion_tokens`, `temperature`, `messages`
- **Optional body fields**: `reasoning_effort` (only included when the task input is set)
- **Expected endpoint**: `https://<resource>.openai.azure.com/openai/v1/chat/completions`
- **Response format**: `response.choices[0].message.content` (standard Chat Completions API)

## Conventions

- **Barrel exports**: Every folder has an `index.ts` that re-exports its module. Always import from the folder, not the file directly.
- **Path aliases**: `@core/*`, `@services/*`, `@utils/*`, `@types/*`, `@config/*` are defined in `tsconfig.json`, but existing code mostly uses relative imports.
- **Naming**: Functions use `camelCase`. Exception: `Repository` class methods use `PascalCase` (`GetChangedFiles`, `GetDiff`).
- **Language**: Log messages, task descriptions, and prompts are written in **Spanish**.
- **TypeScript**: `strict: true`, target `ES2020`, output `commonjs`. Tests are excluded from compilation.
- **AGENTS.md updates**: Any change to code, config, or architecture **must** be reflected here before considering the task complete.

## Known Issues

- `index.ts` reads a `support_self_signed_certificate` input that is **not declared** in `task.json` (only `use_https` exists).
- The `openai` npm package is installed as a dependency but **unused** — review calls go through `node-fetch` directly. Safe to remove.
- Test directories (`tests/unit`, `tests/integration`, `tests/fixtures`) exist but contain no test files or Jest config.

## Task Inputs

Defined in [pull-request-reviewer/task.json](pull-request-reviewer/task.json):

| Input | Type | Required | Default | Description |
|---|---|---|---|---|
| `analysis_mode` | pickList (`file`/`global`) | no | `file` | Per-file comments or single global PR review |
| `api_key` | string | yes | `""` | Azure OpenAI / AI Foundry API key (used as Bearer token) |
| `model` | string | yes | `gpt-4o-mini` | Model deployment name sent in request body |
| `aoi_endpoint` | string | yes | `""` | Full Chat Completions endpoint URL |
| `aoi_tokenMax` | string | yes | `""` | `max_completion_tokens` value |
| `aoi_temperature` | string | yes | `"0"` | Sampling temperature (0–2) |
| `prompt` | multiLine | no | `""` | Custom system prompt (replaces default Spanish prompt) |
| `additional_prompts` | multiLine | no | `""` | Comma-separated additional instructions |
| `file_extensions` | string | no | `""` | Comma-separated file extensions to include |
| `file_excludes` | string | no | `""` | Comma-separated file names to exclude |
| `use_https` | boolean | yes | `true` | Use HTTPS agent (self-signed cert support) |
| `reasoning_effort` | pickList (`low`/`medium`/`high`) | no | `""` | Reasoning effort for reasoning models (o1, o3, etc.) |

## Extension Manifest

- **Publisher**: `SatrackSAS` | **Extension ID**: `pull-request-reviewer` | **Version**: `1.2.0`
- Task inputs are defined in [pull-request-reviewer/task.json](pull-request-reviewer/task.json).
- Marketplace listing content comes from [README.md](README.md).
