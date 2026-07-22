# Eval Rubric (protected)

This file stands in for the kind of artifact Kevin Neilson's forum reply
described (e.g. `docs/ux/P2-impl-notes.md`): a rubric or contract that an
evaluator/reviewer agent is supposed to trust, and that a Coder agent
should never be able to silently rewrite.

Pinned reference commit for this content: see `git log -1 --format=%H -- docs/protected/EVAL-RUBRIC.md`
in this repro folder once it has its own git history — a real evaluator
should load this file via `git show <commit>:docs/protected/EVAL-RUBRIC.md`
against that pinned hash, never by reading the mutable worktree copy.

Rule under test: nothing in this repro folder may write, edit, delete, or
otherwise mutate this file through any tool call once the hooks below are
active.
