<script lang="ts">
  import Card from '$/components/Card/Card.svelte';
  import { Button } from '$/components/ui/button';
  import { copyToClipboard } from '$/util/util';
  import { getSampleDiagrams } from '$/util/mermaid';
  import { stateStore } from '$/util/state';
  import { updateCode } from '$lib/util/state';
  import { logEvent } from '$lib/util/stats';
  import ShapesIcon from '~icons/material-symbols/account-tree-outline-rounded';
  import CopyIcon from '~icons/material-symbols/content-copy-outline-rounded';

  const extras = {
    LikeC4: `specification {
  element system
  element user
}

model {
  customer = user 'Customer'
  cloud = system 'System'
}

views {
  view index {
    include *
  }
}`,
    ZenUML: `zenuml
    title Order Service
    @Actor Client #FFEBE6
    @Boundary OrderController #0747A6
    @EC2 <<BFF>> OrderService #E3FCEF
    group BusinessService {
      @Lambda PurchaseService
      @AzureFunction InvoiceService
    }

    @Starter(Client)
    // \`POST /orders\`
    OrderController.post(payload) {
      OrderService.create(payload) {
        order = new Order(payload)
        if(order != null) {
          par {
            PurchaseService.createPO(order)
            InvoiceService.createInvoice(order)      
          }      
        }
      }
    }
    `
  };

  const samples = { ...getSampleDiagrams(), ...extras } as const;

  let { embedded = false }: { embedded?: boolean } = $props();
  let lastLoadedSample = $state<string | null>(null);

  const getSampleCode = (diagramType: string | null): string | null => {
    if (!diagramType) return null;
    return samples[diagramType as keyof typeof samples] ?? null;
  };

  const loadSampleDiagram = (diagramType: string): void => {
    updateCode(samples[diagramType], {
      resetPanZoom: true,
      updateDiagram: true
    });
    lastLoadedSample = diagramType;
    logEvent('loadSampleDiagram', { diagramType });
  };

  const mainDiagrams = [
    'Flowchart',
    'Class',
    'Sequence',
    'Entity Relationship',
    'State',
    'Mindmap'
  ];

  const diagramOrder = [
    ...mainDiagrams,
    ...Object.keys(samples)
      .filter((key) => !mainDiagrams.includes(key))
      .sort()
  ];
</script>

{#snippet sampleList()}
  <div class="flex flex-col gap-2 p-2">
    {#if lastLoadedSample}
      <div class="flex items-center justify-between gap-2">
        <span class="text-xs text-muted-foreground">Loaded: {lastLoadedSample}</span>
        <Button
          size="sm"
          class="inline-flex items-center gap-1"
          title="Copy sample code"
          onclick={async () => {
            const code = getSampleCode(lastLoadedSample);
            if (!code) return;
            await copyToClipboard(code);
          }}>
          <CopyIcon class="size-3.5" />
          Copy
        </Button>
      </div>
    {/if}
    <div class="flex h-fit max-h-64 flex-wrap gap-2 overflow-y-auto">
      {#each (($stateStore.language ?? 'mermaid') === 'likec4' ? ['LikeC4'] : diagramOrder) as sample (sample)}
        <Button
          size="sm"
          class="w-fit min-w-20 flex-grow normal-case"
          onclick={() => loadSampleDiagram(sample)}>
          {sample}
        </Button>
      {/each}
    </div>
  </div>
{/snippet}

{#if embedded}
  {@render sampleList()}
{:else}
  <Card title="Sample Diagrams" isOpen isStackable icon={{ component: ShapesIcon }}>
    {@render sampleList()}
  </Card>
{/if}
