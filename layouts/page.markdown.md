# {{ .Title }}
{{ with .Description }}
> {{ . }}
{{ end }}
{{- with index .Params "applies-to" }}
{{ partial "applies-to.html" . }}.
{{ end }}
<!-- Canonical: {{ .Permalink }} — raw-markdown mirror for agents and LLMs. -->
{{ .RawContent }}
