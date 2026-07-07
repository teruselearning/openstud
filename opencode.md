# Project Instructions — Strict Workflow

This project uses an LLM Wiki at `.llm-wiki/`. Read `.llm-wiki/AGENTS.md` at session start.

**You MUST follow the workflow below after every code change.** These are not suggestions — they are required steps. Do not skip them.

---

## Mandatory post-change sequence

After you make **any** code change (edit, create, or delete a file), you MUST:

### Step 1: Commit via `@git`
Invoke `@git commit` to save the changes. The git agent will inspect the diff, stage relevant files, and write a commit message matching the repo's style. Do NOT batch unrelated changes into one commit.

### Step 2: Wiki update via `@wiki-writer`
Invoke `@wiki-writer` with a summary of what changed and why. Let it update the wiki before moving on.

---

## Feature-completion sequence

When you believe a feature is finished (all code working, no more TODOs), you MUST additionally:

### Step 3: Translation check via `@translation-checker`
Invoke `@translation-checker` with the list of files you modified. It will scan for hardcoded strings and add missing translation keys. **Do NOT skip this step** — even if you think no UI strings changed.

### Step 4: Create a PR via `@git pr`
Invoke `@git pr` to push the branch and open a pull request against `main`. Return the PR URL to the user.

---

## Starting new work

Before making changes for a new feature or bugfix, invoke `@git new-branch <name>` to create and switch to a feature branch off `main`. Use prefixes: `feat/`, `fix/`, `refactor/`, `chore/`.

---

## Available subagents

| Agent | When to use |
|---|---|
| `@git` | All git operations — commit, branch, PR, status check |
| `@wiki-writer` | After every code change — updates `.llm-wiki/` |
| `@translation-checker` | Before finishing a feature — validates frontend strings |
| `@researcher` | When you need to look up libraries, docs, or external APIs | 


