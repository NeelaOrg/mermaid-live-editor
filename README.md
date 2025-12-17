[![Join our Discord!](https://img.shields.io/static/v1?message=join%20chat&color=9cf&logo=discord&label=discord)](https://discord.gg/sKeNQX4Wtj)
[![Netlify Status](https://api.netlify.com/api/v1/badges/27fa023d-7c73-4a3f-9791-b3b657a47100/deploy-status)](https://app.netlify.com/sites/mermaidjs/deploys)

# Mermaid Live Editor

Edit, preview and share mermaid charts/diagrams.

## Features

- Edit and preview flowcharts, sequence diagrams, gantt diagrams in real time.
- Save the result as a svg
- Get a link to a viewer of the diagram so that you can share it with others.
- Get a link to edit the diagram so that someone else can tweak it and send a new link back

## Live demo

You can try out a [live version](https://mermaid.live/).

# Contributors are welcome!

If you want to speed up the progress for mermaid-live-editor, join the Discord channel and contact knsv.

## Docker

### Run published image

```bash
docker run --platform linux/amd64 --publish 8000:8080 ghcr.io/mermaid-js/mermaid-live-editor
```

### To configure renderer URL

When building set the MERMAID_RENDERER_URL build argument to the rendering
service.
Example:
Default is`https://mermaid.ink`.
Set to empty string to disable PNG and SVG links under Actions

### To configure Kroki Instance URL

When building set the MERMAID_KROKI_RENDERER_URL build argument to your Kroki
instance.
Default is `https://kroki.io`
Set to empty string to disable Kroki link under Actions

### To configure Analytics

When building set the MERMAID_ANALYTICS_URL build argument to your plausible instance, and MERMAID_DOMAIN to your domain.

Default is empty, disabling analytics.

### To enable Mermaid Chart links and promotion

When building set the MERMAID_IS_ENABLED_MERMAID_CHART_LINKS build argument to `true`

Default is empty, disabling button to save to Mermaid Chart and promotional banner.

To keep Mermaid Chart links enabled but hide promotional banners, set
MERMAID_IS_ENABLED_PROMOTIONS to `false`.

To keep Mermaid Chart links enabled but hide Mermaid Chart Playground links, set
MERMAID_IS_ENABLED_PLAYGROUND_LINKS to `false`.

### To update the Security modal

The modal shown on clicking the security link assumes analytics, renderer, Kroki
and Mermaid chart are enabled. You can update it by modifying `Privacy.svelte`
if you wish.

### Development

```bash
docker compose up --build
```

Then open http://localhost:3000

### MCP (tools/list + tools/call)

When running the dev server (`pnpm dev`), the app exposes a JSON-RPC MCP-compatible endpoint at
`POST /api/mcp` (and `OPTIONS /api/mcp` for CORS). Use `tools/list` to discover tools and
`tools/call` to execute them (e.g. render Mermaid to SVG).

To avoid embedding large SVG strings in JSON, use the `mermaid.render_svg_store` tool. It returns an
`id` and a relative `url` (served from `GET /api/rendered/:id`) that returns `image/svg+xml`.

### AI Edit (Azure OpenAI)

The left pane includes an "AI Edit" card that can apply natural-language changes to the current
Mermaid code. It calls a SvelteKit endpoint (`POST /api/ai/mermaid-edit`) which uses Azure OpenAI
Responses API.

Set these environment variables (use `.env.local`, do not commit secrets):

- `AZURE_OPENAI_ENDPOINT` (e.g. `https://YOUR-RESOURCE.openai.azure.com`)
- `AZURE_OPENAI_API_KEY`
- `AZURE_OPENAI_DEPLOYMENT`
- `AZURE_OPENAI_API_VERSION` (optional, default `2024-10-01-preview`)

Notes:
- `AZURE_OPENAI_ENDPOINT` can be either the resource root (`https://YOUR-RESOURCE.openai.azure.com`) or the
  OpenAI-compatible endpoint (`https://YOUR-RESOURCE.openai.azure.com/openai/v1`).
- If you use the `/openai/v1` form, set `AZURE_OPENAI_MODEL` (or keep using `AZURE_OPENAI_DEPLOYMENT` as the model name).

### Building and running images locally

#### Build

```bash
docker build -t mermaid-js/mermaid-live-editor .
```

#### Run

```bash
docker run --detach --name mermaid-live-editor --publish 8080:8080 mermaid-js/mermaid-live-editor
```

Visit: <http://localhost:8080>

#### Stop

```bash
docker stop mermaid-live-editor
```

## Setup

Below link will help you making a copy of the repository in your local system.

https://docs.github.com/en/get-started/quickstart/fork-a-repo

## Requirements

- [Node.js](https://nodejs.org/en/) current LTS version
- [pnpm](https://pnpm.io/) package manager. Install with `corepack enable pnpm`

## Development

```sh
pnpm install
pnpm dev -- --open
```

This app is created with Svelte Kit.

## Release

When a PR is created targeting master, it will be built and deployed by Netlify.
The URL will be indicated in a Comment in the PR.

Once the PR is merged, it will automatically be released.
