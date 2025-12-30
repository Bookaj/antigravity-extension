# Git Workflow Automation Rules

**Trigger**: Before starting any new task.
**Action**: Always run `git pull` first.
**Completion**: After finishing the task and verifying that tests pass, automatically run `git commit` and `git push`.

**Authorization**: 
- Permission granted to execute `git pull`, `git commit`, and `git push` without asking for confirmation (Turbo mode).

**Recovery Rule**:
- If a build fails or tests do not pass, you are authorized to analyze previous Git commits to identify what caused the error.
- You may use `git diff` or temporarily `git checkout` earlier versions to compare code, but always return to the current task branch to apply the final fix.
- Aim for autonomous self-correction before asking me for help.
