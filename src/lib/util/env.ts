export const env = {
  analyticsUrl: import.meta.env.MERMAID_ANALYTICS_URL ?? '',
  domain: import.meta.env.MERMAID_DOMAIN ?? '',
  isEnabledMermaidChartLinks: import.meta.env.MERMAID_IS_ENABLED_MERMAID_CHART_LINKS === 'true',
  // Default enabled to preserve existing behavior; set to 'false' to disable.
  isEnabledPlaygroundLinks: import.meta.env.MERMAID_IS_ENABLED_PLAYGROUND_LINKS !== 'false',
  // Default enabled to preserve existing behavior; set to 'false' to disable.
  isEnabledPromotions: import.meta.env.MERMAID_IS_ENABLED_PROMOTIONS !== 'false',
  krokiRendererUrl: import.meta.env.MERMAID_KROKI_RENDERER_URL ?? '',
  rendererUrl: import.meta.env.MERMAID_RENDERER_URL ?? ''
} as const;
