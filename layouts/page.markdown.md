# {{ .Title }}
{{ with .Description }}
> {{ . }}
{{ end }}
<!-- Canonical: {{ .Permalink }} — raw-markdown mirror for agents and LLMs. -->
{{ .RawContent }}
