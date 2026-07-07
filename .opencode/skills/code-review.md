---
name: code-review
description: Performs a structured code review on changed files
---

# Code Review Skill

When this skill is invoked, perform a thorough code review of the specified files.

## Review checklist

### Security
- [ ] No hardcoded credentials, API keys, or secrets
- [ ] User inputs are validated and sanitized
- [ ] SQL queries use parameterized inputs (no string concatenation)
- [ ] Sensitive data is not logged

### Correctness
- [ ] Edge cases are handled (empty arrays, null values, network failures)
- [ ] Error handling is present and meaningful
- [ ] Functions do what their names suggest

### Performance
- [ ] No N+1 query patterns
- [ ] No unnecessary loops inside loops for large datasets
- [ ] Expensive operations are cached where appropriate

### Maintainability
- [ ] Functions are small and focused (ideally < 30 lines)
- [ ] Variable names are descriptive
- [ ] Complex logic has comments explaining *why*, not *what*

## Output format

Respond with:
1. A brief summary of what the code does
2. Issues found, grouped by severity (Critical / Warning / Suggestion)
3. Specific line references for each issue
4. A verdict: Approve / Approve with suggestions / Request changes