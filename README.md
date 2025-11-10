# SoKEmpirePrologue

## Resolving merge conflicts: Keep current vs. keep incoming

When Git highlights a conflict, your editor may offer **Keep Current Changes** or **Keep Incoming Changes** as quick resolutions. They correspond to the two halves of the conflict markers in the file:

* **Current changes** (sometimes shown between `<<<<<<<` and `=======`) are the edits already present on your branch.
* **Incoming changes** (the lines between `=======` and `>>>>>>>`) are what Git is trying to merge in from the other branch or commit.

Choose the option that matches the content you need after the merge:

1. Select **Keep Current Changes** if your branch’s version is correct and you want to discard the incoming edits.
2. Select **Keep Incoming Changes** if the other branch’s version is the one you prefer.
3. Manually merge when both sides contain pieces you need—edit the file to combine them, then remove the conflict markers.

After resolving the conflict, save the file, stage it (`git add`), and continue with the merge (`git merge --continue` or complete the rebase, depending on the operation).
