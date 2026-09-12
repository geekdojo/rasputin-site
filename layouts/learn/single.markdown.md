{{- $e := partial "learn-lesson.html" . -}}
{{- if not $e }}{{ errorf "learn: page %q has no entry in data/learn.yaml" .Path }}{{ end -}}
# {{ $e.title }}

> {{ $e.description }}

{{ humanize $e.level }} · about {{ $e.minutes }} minutes · lab: {{ $e.lab }} · written against Rasputin {{ index $e "applies-to" }}, reviewed {{ $e.reviewed }}

<!-- Canonical: {{ .Permalink }} — raw-markdown mirror for agents and LLMs. -->
{{ .RawContent }}
