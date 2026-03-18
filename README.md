# meow-db

Minimal PostgreSQL CLI for listing tables and inspecting rows.

## 1) Quick Overview

Official root command: `meow`

Current v1 surface:

- `meow db add <name> <url>`
- `meow db list`
- `meow db use <name>`
- `meow db info`
- `meow db remove <name>`
- `meow tables [schema]`
- `meow rows <table> [--schema <schema>] [--limit <n>]`

Out of v1 scope for now: `schemas`

## 2) Install

```bash
npm install --global meow-db
```

## 3) Quick Start (happy path)

```bash
# 1) Add db
meow db add local postgresql://user:pass@localhost:5432/app

# 2) Select active db
meow db use local

# 3) List tables
meow tables

# 4) Inspect rows from a table
meow rows users --limit 20
```

## 4) Command Structure

```text
meow
  db
    add <name> <url>
    list
    use <name>
    info
    remove <name>
  tables [schema]
  rows <table> [--schema <schema>] [--limit <n>]
```

### Global flags (standard)

- `-h, --help`: show help for any command level.
- `--version`: show CLI version.
- `--json`: structured output for scripts.
- `-q, --quiet`: reduce output noise.

Recommended contextual help:

```bash
meow --help
meow db --help
meow rows --help
```

## 5) Per-command Examples

### Connection

```bash
meow db add prod postgresql://user:pass@db.example.com:5432/app
meow db list
meow db use prod
meow db info
meow db remove prod
```

### Tables

```bash
meow tables
meow tables analytics
```

### Rows

```bash
meow rows users
meow rows users --schema analytics
meow rows users --limit 100
meow rows users --json
```

## 6) Output and Error Conventions

### Output

- Default: human-readable.
- `--json`: stable format for automation.
- `--quiet`: only essential information.

### Errors

- Messages must be short and actionable.
- No stack traces in normal flow.
- Always suggest a next step when possible.

Actionable error example:

```text
Error: db "prod" not found.
Hint: run `meow db list` to see available names.
```

## Reference

- CLI design guidelines: https://clig.dev/

## Next Steps

- Implement the v1 command behavior exactly as documented above.
