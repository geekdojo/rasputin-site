# {{ .Title }}
{{ with .Description }}
> {{ . }}
{{ end }}
<!-- Canonical: {{ .Permalink }} — raw-markdown mirror for agents and LLMs. -->
{{ .RawContent }}

## Nodes

| Hardware | Arch | Status | Where that comes from |
| --- | --- | --- | --- |
{{ range hugo.Data.hardware.nodes -}}
| {{ .name }} | `{{ .arch }}` | {{ if eq .status "tested" }}tested{{ else }}untested — should work{{ end }} | {{ .evidence }} |
{{ end }}
## Carrier boards

Multi-node carriers Rasputin has been run on, and whether it drives their baseboard management controller.

| Carrier | BMC backend | Status | Where that comes from |
| --- | --- | --- | --- |
{{ range hugo.Data.hardware.carriers -}}
| {{ .name }} — {{ .detail }} | `{{ .backend }}` ({{ .transport }}) | {{ if eq .status "tested" }}tested{{ else }}untested — should work{{ end }} | {{ .evidence }}{{ with .note }} {{ . }}{{ end }} |
{{ end }}
