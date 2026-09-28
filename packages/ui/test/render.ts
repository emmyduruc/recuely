// Renders a component to HTML with vue's server renderer, so no DOM library is needed.
// Nuxt's <UIcon> is stubbed with a span that keeps the icon name.
import { createSSRApp, defineComponent, h, type Component } from 'vue';
import { renderToString } from 'vue/server-renderer';

const UIcon = defineComponent({
  props: { name: { type: String, required: true } },
  setup(props) {
    return () => h('span', { 'data-icon': props.name });
  },
});

export async function render(component: Component, props: Record<string, unknown>): Promise<string> {
  const app = createSSRApp({ render: () => h(component, props) });
  app.component('UIcon', UIcon);
  return renderToString(app);
}

/** Text content of the HTML: tags and SSR comment anchors removed, entities decoded. */
export function textOf(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
