import React, { useEffect, useMemo, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { LikeC4 } from 'likec4';
import { LikeC4ModelProvider, ReactLikeC4, type DiagramView } from 'likec4/react';

type IconComponent = React.ComponentType<Record<string, unknown>>;

// Build an icon map from the published likec4 icons.
// Keys are like "tech:nextjs", "aws:ec2-vpc", etc.
const iconModules = import.meta.glob<Record<string, IconComponent>>(
  '/node_modules/likec4/icons/**/*.js',
  { eager: true }
);

const iconMap: Record<string, IconComponent> = Object.fromEntries(
  Object.entries(iconModules).map(([path, mod]) => {
    const key = path.replace(/^.*likec4\/icons\//, '').replace(/\.js$/, '').replace(/\//g, ':');
    const component = (mod as { default?: IconComponent }).default;
    return [key, component as IconComponent];
  })
);

const renderIcon = (node: { icon?: string }) => {
  if (!node?.icon) return null;
  const Comp = iconMap[node.icon];
  return Comp ? <Comp /> : null;
};

type ViewerAppProps = {
  code: string;
  viewId?: string | null;
  fitView?: boolean;
  onReady?: (payload: { views: Array<{ id: string; title: string }>; viewId: string }) => void;
  onError?: (payload: { message: string }) => void;
};

const ViewerApp = ({ code, viewId, background, fitView, onReady, onError }: ViewerAppProps) => {
  const [state, setState] = useState<{
    view: DiagramView | null;
    model: unknown | null;
  }>({ view: null, model: null });

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const likec4 = await LikeC4.fromSource(code, {
          graphviz: 'wasm',
          logger: false,
          printErrors: false,
          throwIfInvalid: false,
          watch: false
        });
        if (likec4.hasErrors()) {
          const message = likec4.getErrors().map((e) => e.message).join('\n') || 'LikeC4 parse error';
          onError?.({ message });
          return;
        }
        likec4.ensureSingleProject();
        const projectId = likec4.projects()[0];
        // Build layouted model for provider and layouted diagrams for the view.
        const layoutedModel = await likec4.langium.likec4.LanguageServices.layoutedModel(
          projectId
        );
        const diagrams = await likec4.viewsService.diagrams(projectId);
        if (!diagrams.length) {
          onError?.({ message: 'No LikeC4 views found. Add a `views { view ... }` section.' });
          return;
        }
        const selected =
          (viewId ? diagrams.find((v) => v.id === viewId) : undefined) ?? diagrams[0];
        const views = diagrams.map((v) => ({ id: v.id, title: v.title ?? v.id }));
        if (cancelled) {
          await likec4.dispose();
          return;
        }
        setState({ view: selected ?? null, model: layoutedModel });
        onReady?.({ views, viewId: selected?.id ?? diagrams[0].id });
        await likec4.dispose();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        onError?.({ message });
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [code, viewId, onReady, onError]);

  const memoView = useMemo(() => state.view ?? undefined, [state.view]);

  if (!memoView || !state.model) {
    return null;
  }

  return (
    <LikeC4ModelProvider likec4model={state.model as any}>
      <ReactLikeC4
        viewId={memoView.id as any}
        renderIcon={({ node }) => renderIcon(node)}
        enableRelationshipDetails={false}
        enableElementDetails={false}
        enableRelationshipBrowser={false}
        keepAspectRatio={false}
      />
    </LikeC4ModelProvider>
  );
};

class LikeC4ViewerElement extends HTMLElement {
  #root: Root | null = null;
  #code = '';
  #viewId: string | null = null;
  #fitView = true;

  connectedCallback(): void {
    if (!this.shadowRoot && typeof this.attachShadow === 'function') {
      this.attachShadow({ mode: 'open' });
    }
    this.render();
  }

  disconnectedCallback(): void {
    this.#root?.unmount();
    this.#root = null;
  }

  set code(value: string | null) {
    this.#code = value ?? '';
    this.render();
  }

  set viewId(value: string | null) {
    this.#viewId = value ?? null;
    this.render();
  }

  set fitView(value: boolean) {
    this.#fitView = value;
    this.render();
  }

  setView(viewId: string | null): void {
    this.#viewId = viewId;
    this.render();
  }

  render(): void {
    if (typeof window === 'undefined') return;
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
    }

    if (!this.shadowRoot!.querySelector('style[data-likec4-fix]')) {
      const style = document.createElement('style');
      style.setAttribute('data-likec4-fix', '');
      style.textContent = `
        :host, .likec4-root { width: 100%; height: 100%; display: block; }
        .react-flow__renderer, .react-flow__pane, .react-flow__viewport { width: 100%; height: 100%; }
        /* Force identity transform to avoid tiny zoom */
        .react-flow__viewport { transform: translate(0px, 0px) scale(1) !important; }
      `;
      this.shadowRoot!.append(style);
    }

    if (!this.#root) {
      const container = document.createElement('div');
      container.style.width = '100%';
      container.style.height = '100%';
      this.shadowRoot!.append(container);
      this.#root = createRoot(container);
    }

    const onReady = (detail: { views: Array<{ id: string; title: string }>; viewId: string }) => {
      this.dispatchEvent(
        new CustomEvent('likec4ready', {
          detail,
          bubbles: true,
          composed: true
        })
      );
    };

    const onError = (detail: { message: string }) => {
      this.dispatchEvent(
        new CustomEvent('likec4error', {
          detail,
          bubbles: true,
          composed: true
        })
      );
    };

    this.#root.render(
      <React.StrictMode>
        <ViewerApp
          code={this.#code}
          viewId={this.#viewId}
          fitView={this.#fitView}
          onReady={onReady}
          onError={onError}
        />
      </React.StrictMode>
    );

    const enforceViewport = () => {
      const root = this.shadowRoot;
      if (!root) return;
      const renderer = root.querySelector<HTMLElement>('.react-flow__renderer');
      if (renderer) {
        renderer.style.width = '100%';
        renderer.style.height = '100%';
      }
      const viewport = root.querySelector<HTMLElement>('.react-flow__viewport');
      if (viewport) {
        viewport.style.width = '100%';
        viewport.style.height = '100%';
        viewport.style.transform = 'translate(0px, 0px) scale(1)';
        viewport.style.transformOrigin = '0 0';
      }
    };

    // React Flow applies transforms after render; adjust on next ticks.
    queueMicrotask(enforceViewport);
    setTimeout(enforceViewport, 50);
  }
}

if (typeof window !== 'undefined' && !customElements.get('likec4-viewer')) {
  customElements.define('likec4-viewer', LikeC4ViewerElement);
  const warnedRefKey = '__likec4_ref_warned__';
  const origError = console.error;
  console.error = (...args: unknown[]) => {
    const first = args[0];
    if (
      typeof first === 'string' &&
      first.includes('Function components cannot be given refs') &&
      !(window as any)[warnedRefKey]
    ) {
      (window as any)[warnedRefKey] = true;
      return;
    }
    return origError(...args);
  };
}
