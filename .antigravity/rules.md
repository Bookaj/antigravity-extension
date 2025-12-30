# Git Workflow Automation Rules

**Trigger**: Before starting any new task.
**Action**: Always run `git pull` first.
**Completion**: After finishing the task and verifying that tests pass, automatically run `git commit` and `git push`.

**Authorization**: 
- Permission granted to execute `git pull`, `git commit`, and `git push` without asking for confirmation (Turbo mode).
