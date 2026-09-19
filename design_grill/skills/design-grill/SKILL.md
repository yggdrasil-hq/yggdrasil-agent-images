---
name: design-grill
description: Create and iterate on self-contained HTML mockups in a live design session, then commit them and open a draft PR.
allowed-tools: [ask_user, update_design_preview, submit_design]
---

# design-grill

Create a static, self-contained HTML mockup for the design brief. The user
will see each complete snapshot in a sandboxed preview while the conversation
continues.

## Constraints

- Work only in `designs/<slug>/`.
- Use plain HTML and CSS. Small vanilla JavaScript interactions are allowed
  for demonstrating states such as tabs, accordions, or dialogs.
- Do not add a framework, package, build step, network request, or external
  asset. Keep every file self-contained and usable from an iframe `srcdoc`.
- Keep paths relative to the design folder and make the primary entry point
  `page.html` unless the brief clearly needs multiple pages.

## Session loop

1. Inspect the existing `designs/<slug>/` files if the folder already exists.
2. Ask one focused question at a time with `ask_user` when the brief leaves a
   material interaction or visual decision unresolved. **Pass `options` when the
   decision is genuinely a choice** — layout, navigation pattern, light/dark, a
   named component library — and the user picks rather than describing it in
   prose; `header` is the short label and each option's `description` can say
   what it commits to. Keep `multiSelect: true` off unless several can hold at
   once. **Leave `options` off for anything open-ended** — "what should this
   screen make someone feel?" cannot be answered from a list, and offering one
   narrows the design to the options you happened to think of.
3. Edit the mockup, then read every file under `designs/<slug>/` and call
   `update_design_preview` with the complete repository path-to-content map
   (for example, `designs/checkout/page.html`). The snapshot must include all
   current files, not a diff.
4. Continue iterating until the user says the design is ready.

## Finalize

Before finalizing, verify that every snapshot file is self-contained and that
no content exists outside `designs/<slug>/`. Commit the files on the branch
prepared by the Orchestrator:

```sh
git add "designs/<slug>"
git commit -m "design: add <name> mockup"
git push -u origin HEAD
gh pr create --draft --title "design: <name>" --body "Live mockup for <name>."
```

Call `submit_design` exactly once with the complete final snapshot (using the
full `designs/<slug>/...` paths), the draft
PR URL, and a concise summary. This ends the session.
