<script lang="ts">
  import Card from '$/components/Card/Card.svelte';
  import { Button } from '$/components/ui/button';
  import { stateStore, updateCode } from '$/util/state';
  import dayjs from 'dayjs';
  import ChatIcon from '~icons/material-symbols/chat-outline-rounded';
  import SendIcon from '~icons/material-symbols/send-rounded';

  type Message = {
    id: string;
    role: 'user' | 'assistant' | 'system';
    text: string;
    imageDataUrl?: string;
    time: number;
  };

  let instruction = $state('');
  let isSending = $state(false);
  let attachedImageDataUrl = $state<string | null>(null);
  let messages = $state<Message[]>([
    {
      id: crypto.randomUUID(),
      role: 'system',
      text: 'Describe the change you want to make to the current Mermaid code.',
      time: Date.now()
    }
  ]);

  const addMessage = (role: Message['role'], text: string, imageDataUrl?: string) => {
    messages = [
      ...messages,
      { id: crypto.randomUUID(), role, text, imageDataUrl, time: Date.now() }
    ];
  };

  const attachImageFromFile = async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    // Keep this reasonably small to avoid huge payloads.
    const maxBytes = 2_000_000;
    if (file.size > maxBytes) {
      addMessage('assistant', `Error: Image is too large (${Math.round(file.size / 1024)} KB).`);
      return;
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Failed to read image.'));
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(file);
    });

    if (!dataUrl.startsWith('data:image/')) {
      addMessage('assistant', 'Error: Unsupported image data.');
      return;
    }

    attachedImageDataUrl = dataUrl;
    addMessage('user', '[Image attached]', dataUrl);
  };

  const onPaste = async (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageItem = Array.from(items).find((i) => i.kind === 'file' && i.type.startsWith('image/'));
    if (!imageItem) return;

    const file = imageItem.getAsFile();
    if (!file) return;

    e.preventDefault();
    try {
      await attachImageFromFile(file);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addMessage('assistant', `Error: ${message}`);
    }
  };

  const send = async () => {
    const current = instruction.trim();
    if (!current || isSending) return;

    addMessage('user', current);
    instruction = '';
    isSending = true;

    try {
      const res = await fetch('/api/ai/mermaid-edit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: $stateStore.code,
          instruction: current,
          language: $stateStore.language ?? 'mermaid',
          imageDataUrl: attachedImageDataUrl
        })
      });

      const data = (await res.json().catch(() => null)) as
        | {
            status: 'success';
            updatedCode: string;
            summary: string | null;
            reasoning?: string | null;
            responseId?: string | null;
            toolCalls?: unknown;
          }
        | {
            status: 'fail';
            error: { message: string };
          }
        | null;

      if (!data) {
        throw new Error('Invalid response from AI endpoint.');
      }

      if (data.status !== 'success') {
        throw new Error(data.error?.message ?? 'AI request failed.');
      }

      updateCode(data.updatedCode, { resetPanZoom: true, updateDiagram: true });
      const parts: string[] = [];
      parts.push(data.summary ?? 'Updated the diagram.');
      if (data.responseId) {
        parts.push(`responseId: ${data.responseId}`);
      }
      const toolCalls = data.toolCalls;
      if (Array.isArray(toolCalls) && toolCalls.length) {
        const names = toolCalls
          .map((t) => (t as { toolName?: unknown }).toolName)
          .filter((n): n is string => typeof n === 'string' && n.trim());
        if (names.length) parts.push(`tools: ${Array.from(new Set(names)).join(', ')}`);
      }
      if (data.reasoning && data.reasoning.trim()) {
        const reasoning = data.reasoning.length > 1200 ? `${data.reasoning.slice(0, 1200)}…` : data.reasoning;
        parts.push(`reasoning:\n${reasoning}`);
      }
      addMessage('assistant', parts.join('\n'));
      attachedImageDataUrl = null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addMessage('assistant', `Error: ${message}`);
    } finally {
      isSending = false;
    }
  };
</script>

<Card title="AI Edit" isOpen isStackable icon={{ component: ChatIcon }}>
  <div class="flex flex-col gap-3 p-2">
    <div class="max-h-52 overflow-auto rounded-md border border-border bg-background/40 p-2 text-sm">
      {#each messages as m (m.id)}
        <div class="mb-2">
          <div class="flex items-center justify-between text-xs opacity-70">
            <span class="font-medium">{m.role}</span>
            <span>{dayjs(m.time).format('HH:mm:ss')}</span>
          </div>
          <div class="whitespace-pre-wrap">{m.text}</div>
          {#if m.imageDataUrl}
            <img
              class="mt-2 max-h-40 max-w-full rounded-md border border-border object-contain"
              alt="Pasted screenshot"
              src={m.imageDataUrl} />
          {/if}
        </div>
      {/each}
    </div>

    <div class="flex gap-2">
      <textarea
        class="min-h-10 flex-1 resize-y rounded-md border border-border bg-background px-3 py-2 text-sm"
        placeholder="e.g. Add a new actor called Admin and connect it to System"
        bind:value={instruction}
        onpaste={(e) => void onPaste(e)}
        onkeydown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void send();
          }
        }}
        disabled={isSending}></textarea>
      <Button
        title="Send (Ctrl/Cmd+Enter)"
        class="shrink-0"
        size="sm"
        onclick={() => void send()}
        disabled={isSending || !instruction.trim()}>
        <SendIcon />
      </Button>
    </div>
    {#if attachedImageDataUrl}
      <div class="flex items-center justify-between rounded-md border border-border bg-background/40 px-3 py-2 text-xs">
        <span>Image attached (will be sent with your next message).</span>
        <button
          class="underline underline-offset-2"
          type="button"
          onclick={() => (attachedImageDataUrl = null)}>
          Remove
        </button>
      </div>
    {/if}
    <div class="text-xs opacity-70">
      Ctrl/Cmd+Enter to send. Paste an image into the input to attach it. Uses Azure OpenAI via
      `/api/ai/mermaid-edit`.
    </div>
  </div>
</Card>
