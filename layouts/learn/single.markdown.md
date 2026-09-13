{{- $e := partial "learn-lesson.html" . -}}
{{- if not $e }}{{ errorf "learn: page %q has no entry in data/learn.yaml" .Path }}{{ end -}}
{{- /* The note leads every lesson mirror so an agent that lands here from
     llms.txt or a search cannot mistake a lab for an operating procedure. */ -}}
*Teaching lesson, not a Rasputin procedure: any lab commands here run on a small practice setup or public servers, never on a Rasputin cluster. To operate a cluster, use the docs: {{ "docs/" | absURL }}*

# {{ $e.title }}

> {{ $e.description }}

{{ humanize $e.level }} · about {{ $e.minutes }} minutes · {{ partial "learn-lab-label.html" $e.lab }} · reviewed {{ $e.reviewed }}

{{ partial "applies-to.html" (index $e "applies-to") }}.

<!-- Canonical: {{ .Permalink }} — raw-markdown mirror for agents and LLMs. -->
{{ .RawContent }}
