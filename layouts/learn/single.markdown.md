{{- $e := partial "learn-lesson.html" . -}}
{{- if not $e }}{{ errorf "learn: page %q has no entry in data/learn.yaml" .Path }}{{ end -}}
# {{ $e.title }}

> {{ $e.description }}

{{ humanize $e.level }} · about {{ $e.minutes }} minutes · {{ partial "learn-lab-label.html" $e.lab }} · reviewed {{ $e.reviewed }}

{{ partial "applies-to.html" (index $e "applies-to") }}.

<!-- Canonical: {{ .Permalink }} — raw-markdown mirror for agents and LLMs. -->
{{ .RawContent }}
