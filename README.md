# rasputin-site

Source for **[rasputin.geekdojo.com](https://rasputin.geekdojo.com)** — the
Rasputin landing page, design-partner offer, and devlog.

Rasputin itself lives at
[geekdojo/rasputin-releases](https://github.com/geekdojo/rasputin-releases)
(downloads) and the repos linked from there.

## Stack

[Hugo](https://gohugo.io) with a hand-rolled theme (no theme dependency, one
CSS file, no JavaScript). Pushes to `main` deploy to GitHub Pages via
`.github/workflows/deploy.yml`.

## Writing a devlog post

Add a markdown file under `content/devlog/`:

```markdown
---
title: "Post title"
date: 2026-07-16
description: "One-sentence summary (used for meta/OG tags)."
summary: "Same, shown on list cards."
---

Body in plain markdown.
```

Push to `main`. That's the whole publish flow. RSS at `/devlog/index.xml` is
generated automatically.

## Email capture

The form posts to Kit. `kitFormId` in `hugo.toml` holds the form ID; while it
is empty the page shows a GitHub-watch/RSS fallback instead of the form.

## Local preview

```sh
hugo server
```

## License

Site content © geekdojo, [CC-BY-SA-4.0](https://creativecommons.org/licenses/by-sa/4.0/).
Rasputin software is AGPL-3.0 in its own repos.
