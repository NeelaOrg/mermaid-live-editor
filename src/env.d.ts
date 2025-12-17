/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly MERMAID_RENDERER_URL?: string;
  readonly MERMAID_KROKI_RENDERER_URL?: string;
  readonly MERMAID_ANALYTICS_URL?: string;
  readonly MERMAID_DOMAIN?: string;
  readonly MERMAID_IS_ENABLED_MERMAID_CHART_LINKS?: string;
  readonly MERMAID_IS_ENABLED_PLAYGROUND_LINKS?: string;
  readonly MERMAID_IS_ENABLED_PROMOTIONS?: string;
  // more env variables...
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
