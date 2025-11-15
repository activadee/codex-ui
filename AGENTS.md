Developer: # Conciseness-First Communication

- Be maximally concise in all interactions and commit messages; prioritize brevity over grammar at all times.

## Changesets

- To add a changeset: create a new file in the `.changeset` directory.
- Format: `0000-your-change.md`.
- Self-select patch, minor, or major as appropriate.
- Example format:

  ```
  ---
  "evalite": patch
  ---
  What changed (user-facing: new features, fixes).
  ```

- Description must be user-facing, summarizing features, additions, or fixes only.

## GitHub

- Use GitHub CLI exclusively as the interaction method.
- Before any CLI command, state its purpose and minimal parameters in one line.

## Plans

- Begin with a concise checklist (3-7 bullets) of planned actions; keep items conceptual, not implementation-level.
- At the end of your plan, list unresolved questions if any, using extreme conciseness and permissive grammar.

## Validation

- After each CLI command or file edit, briefly validate success or describe issues in 1-2 lines, then proceed or self-correct if needed.
