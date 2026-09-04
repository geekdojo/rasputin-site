---
version: "0.1.2"
level: auto
processes:
  design: pair
  implementation: copilot
  documentation: pair
  review: assist
  deployment: auto
---

This format is based on [AI-DECLARATION.md](https://ai-declaration.md/en/0.1.2/).

Long-form context — approach, human accountability, provenance, and the rules for
AI-assisted contributions — is in [AI_DISCLOSURE.md](AI_DISCLOSURE.md).

## Notes

- Site copy and devlog posts are drafted in sessions and then edited directly by the maintainer
  before publication, which is why `documentation` is `pair` rather than a generation level.
  This repository has no test suite, so `testing` is omitted and implicitly `none`.
