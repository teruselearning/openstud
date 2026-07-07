---
name: plan-feature
description: Creates a structured implementation plan for a new feature
---

# Feature Planning Skill

When asked to plan a feature, follow these steps:

## Step 1: Clarify requirements
Ask these questions if not already answered:
- What problem does this feature solve for the user?
- What are the acceptance criteria (how do we know it's done)?
- Are there any constraints (performance, backward compatibility)?

## Step 2: Explore the codebase
Use CodeGraph to understand:
- Which existing modules are relevant?
- What patterns does the codebase already use?
- Where will the new code live?

## Step 3: Write the plan
Structure your plan as:

### Feature: [Name]
**Goal:** One sentence.

**Affected files:**
- List every file that will be created or modified

**Implementation steps:**
1. Numbered steps in order
2. Each step should be completable in a single coding session
3. Note dependencies between steps

**Testing plan:**
- What unit tests are needed?
- What integration scenarios should be verified?

**Wiki updates needed:**
- Which wiki pages will need updating after this is built?

## Step 4: Log the plan
Append the plan to `.llm-wiki/wiki/decisions/` as a new ADR (Architecture Decision Record).