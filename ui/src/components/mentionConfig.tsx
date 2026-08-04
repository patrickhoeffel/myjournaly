import { ReactRenderer } from "@tiptap/react";
import Mention from "@tiptap/extension-mention";
import type { SuggestionProps, SuggestionKeyDownProps } from "@tiptap/suggestion";
import MentionList, { type MentionItem, type MentionListRef } from "./MentionList";
import { apiFetch } from "../lib/api";

// ── Cache fetched entities so we don't re-fetch on every keystroke ──

let peopleCache: MentionItem[] | null = null;
let feelingsCache: MentionItem[] | null = null;
let beliefsCache: MentionItem[] | null = null;
let tagsCache: MentionItem[] | null = null;
let lossesCache: MentionItem[] | null = null;

async function getPeople(): Promise<MentionItem[]> {
  if (peopleCache) return peopleCache;
  try {
    const data = await apiFetch("/people");
    peopleCache = data.map((p: Record<string, string>) => ({
      id: p.id,
      label: `${p.first_name}${p.last_name ? ` ${p.last_name}` : ""}`,
      mentionType: "person" as const,
      extra: p.relationship || undefined,
    }));
  } catch {
    peopleCache = [];
  }
  return peopleCache!;
}

async function getFeelings(): Promise<MentionItem[]> {
  if (feelingsCache) return feelingsCache;
  try {
    const data = await apiFetch("/feelings");
    feelingsCache = data.map((f: Record<string, string>) => ({
      id: f.id,
      label: f.name,
      mentionType: "feeling" as const,
      extra: f.valence,
    }));
  } catch {
    feelingsCache = [];
  }
  return feelingsCache!;
}

async function getBeliefs(): Promise<MentionItem[]> {
  if (beliefsCache) return beliefsCache;
  try {
    const data = await apiFetch("/beliefs");
    beliefsCache = data
      .filter((b: Record<string, unknown>) => b.is_active)
      .map((b: Record<string, string>) => ({
        id: b.id,
        label: b.statement,
        mentionType: "belief" as const,
        extra: b.category || undefined,
        valence: b.valence || undefined,
      }));
  } catch {
    beliefsCache = [];
  }
  return beliefsCache!;
}

async function getLosses(): Promise<MentionItem[]> {
  if (lossesCache) return lossesCache;
  try {
    const data = await apiFetch("/losses");
    lossesCache = data.map((l: Record<string, string>) => ({
      id: l.id,
      label: l.name,
      mentionType: "loss" as const,
    }));
  } catch {
    lossesCache = [];
  }
  return lossesCache!;
}

async function getTags(): Promise<MentionItem[]> {
  if (tagsCache) return tagsCache;
  try {
    const data = await apiFetch("/tags");
    tagsCache = data.map((t: Record<string, string>) => ({
      id: t.id,
      label: t.name,
      mentionType: "tag" as const,
      color: t.color || undefined,
    }));
  } catch {
    tagsCache = [];
  }
  return tagsCache!;
}

/** Call to clear caches when entities are modified externally */
export function clearMentionCaches() {
  peopleCache = null;
  feelingsCache = null;
  beliefsCache = null;
  tagsCache = null;
  lossesCache = null;
}

// ── Suggestion popup renderer (shared) ──

function updatePopupPosition(props: SuggestionProps<MentionItem>, popup: HTMLDivElement) {
  if (!props.clientRect) return;
  const rect = props.clientRect();
  if (!rect) return;
  popup.style.left = `${rect.left + window.scrollX}px`;
  popup.style.top = `${rect.bottom + window.scrollY + 4}px`;
}

function createSuggestionRenderer(getMode: (query: string) => string) {
  return () => {
    let component: ReactRenderer<MentionListRef> | null = null;
    let popup: HTMLDivElement | null = null;

    return {
      onStart: (props: SuggestionProps<MentionItem>) => {
        component = new ReactRenderer(MentionList, {
          props: { ...props, mode: getMode(props.query) },
          editor: props.editor,
        });

        popup = document.createElement("div");
        popup.style.position = "absolute";
        popup.style.zIndex = "9999";
        document.body.appendChild(popup);
        popup.appendChild(component.element);
        updatePopupPosition(props, popup);
      },

      onUpdate: (props: SuggestionProps<MentionItem>) => {
        component?.updateProps({ ...props, mode: getMode(props.query) });
        if (popup) updatePopupPosition(props, popup);
      },

      onKeyDown: (props: SuggestionKeyDownProps) => {
        if (props.event.key === "Escape") {
          popup?.remove();
          component?.destroy();
          popup = null;
          component = null;
          return true;
        }
        return component?.ref?.onKeyDown(props) ?? false;
      },

      onExit: () => {
        popup?.remove();
        component?.destroy();
        popup = null;
        component = null;
      },
    };
  };
}

// ── @ mode detection ──

function getAtMode(query: string): string {
  if (query.startsWith("@")) return "Feelings";
  if (query.startsWith("#")) return "Beliefs";
  if (query.startsWith("!")) return "Losses";
  return "People";
}

// ── @ Mention extension: People / @@Feelings / @#Beliefs ──

export const AtMention = Mention.extend({
  name: "mention",

  addAttributes() {
    return {
      id: { default: null },
      label: { default: null },
      mentionType: {
        default: "person",
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-mention-type") || "person",
        renderHTML: (attributes: Record<string, string>) => ({
          "data-mention-type": attributes.mentionType,
        }),
      },
    };
  },

  renderHTML({ node, HTMLAttributes }) {
    const mentionType = node.attrs.mentionType || "person";
    const label = node.attrs.label || "";
    const prefix =
      mentionType === "person" ? "@" :
      mentionType === "loss" ? "!" :
      "";

    return [
      "span",
      {
        ...HTMLAttributes,
        "data-type": this.name,
        "data-mention-type": mentionType,
        class: `mention mention-${mentionType}`,
      },
      `${prefix}${label}`,
    ];
  },

  parseHTML() {
    return [{ tag: `span[data-type="${this.name}"]` }];
  },
}).configure({
  suggestion: {
    char: "@",
    allowSpaces: false,
    allowToIncludeChar: true,

    items: async ({ query }: { query: string }): Promise<MentionItem[]> => {
      if (query.startsWith("@")) {
        const search = query.slice(1).toLowerCase();
        const all = await getFeelings();
        return search
          ? all.filter((f) => f.label.toLowerCase().includes(search))
          : all;
      }
      if (query.startsWith("#")) {
        const search = query.slice(1).toLowerCase();
        const all = await getBeliefs();
        return search
          ? all.filter((b) => b.label.toLowerCase().includes(search))
          : all;
      }
      if (query.startsWith("!")) {
        const search = query.slice(1).toLowerCase();
        const all = await getLosses();
        return search
          ? all.filter((l) => l.label.toLowerCase().includes(search))
          : all;
      }
      const search = query.toLowerCase();
      const all = await getPeople();
      return search
        ? all.filter((p) => p.label.toLowerCase().includes(search))
        : all;
    },

    command: ({ editor, range, props }) => {
      editor
        .chain()
        .focus()
        .insertContentAt(range, [
          {
            type: "mention",
            attrs: {
              id: props.id,
              label: props.label,
              mentionType: (props as unknown as MentionItem).mentionType || "person",
            },
          },
          { type: "text", text: " " },
        ])
        .run();
    },

    render: createSuggestionRenderer(getAtMode),
  },
});

// ── # Mention extension: Tags ──

export const TagMention = Mention.extend({
  name: "tagMention",

  addAttributes() {
    return {
      id: { default: null },
      label: { default: null },
      mentionType: {
        default: "tag",
      },
    };
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      {
        ...HTMLAttributes,
        "data-type": this.name,
        class: "mention mention-tag",
      },
      `#${node.attrs.label || ""}`,
    ];
  },

  parseHTML() {
    return [{ tag: `span[data-type="${this.name}"]` }];
  },
}).configure({
  suggestion: {
    char: "#",
    allowSpaces: false,

    items: async ({ query }: { query: string }): Promise<MentionItem[]> => {
      const search = query.toLowerCase().trim();
      const all = await getTags();
      if (!search) return all;
      const filtered = all.filter((t) => t.label.toLowerCase().includes(search));
      const exactMatch = all.some((t) => t.label.toLowerCase() === search);
      if (!exactMatch && search.length > 0) {
        filtered.push({
          id: `__create__${search}`,
          label: search,
          mentionType: "tag" as const,
          extra: "__create__",
        });
      }
      return filtered;
    },

    command: ({ editor, range, props }) => {
      const item = props as unknown as MentionItem;
      if (item.extra === "__create__") {
        // Create the tag, then insert the mention with real ID
        const tagName = item.label;
        apiFetch("/tags", {
          method: "POST",
          body: JSON.stringify({ name: tagName }),
        }).then((created: { id: string; name: string }) => {
          // Invalidate cache so future lookups include the new tag
          tagsCache = null;
          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              {
                type: "tagMention",
                attrs: {
                  id: created.id,
                  label: created.name,
                  mentionType: "tag",
                },
              },
              { type: "text", text: " " },
            ])
            .run();
        }).catch(() => {
          // Fallback: insert with temp id so text isn't lost
          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              { type: "text", text: `#${tagName} ` },
            ])
            .run();
        });
        return;
      }
      editor
        .chain()
        .focus()
        .insertContentAt(range, [
          {
            type: "tagMention",
            attrs: {
              id: props.id,
              label: props.label,
              mentionType: "tag",
            },
          },
          { type: "text", text: " " },
        ])
        .run();
    },

    render: createSuggestionRenderer(() => "Tags"),
  },
});

// ── Extract mention entities from editor content ──

interface MentionEntity {
  id: string;
  label: string;
  mentionType: "person" | "feeling" | "belief" | "tag" | "loss";
}

export function extractMentions(editor: ReturnType<typeof import("@tiptap/react").useEditor>): MentionEntity[] {
  if (!editor) return [];
  const mentions: MentionEntity[] = [];
  const doc = editor.state.doc;

  doc.descendants((node) => {
    if (node.type.name === "mention" || node.type.name === "tagMention") {
      mentions.push({
        id: node.attrs.id,
        label: node.attrs.label,
        mentionType: node.attrs.mentionType || (node.type.name === "tagMention" ? "tag" : "person"),
      });
    }
  });

  return mentions;
}
