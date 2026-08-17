export interface MarkdownToken {
  type: "text" | "strong" | "em" | "code" | "link";
  text: string;
  href?: string;
}

export interface MarkdownBlock {
  type: "paragraph" | "heading" | "list";
  level?: 3 | 4 | 5;
  ordered?: boolean;
  lines?: MarkdownToken[][];
  items?: MarkdownToken[][];
}

function isSafeHref(href: string): boolean {
  return /^(https?:|mailto:|tel:|#|\/)/i.test(href.trim());
}

function parseInlineMarkdown(value: string): MarkdownToken[] {
  const tokens: MarkdownToken[] = [];
  let index = 0;

  const pushText = (text: string) => {
    if (text) tokens.push({ type: "text", text });
  };

  while (index < value.length) {
    const rest = value.slice(index);

    if (rest.startsWith("`")) {
      const end = value.indexOf("`", index + 1);
      if (end > index + 1) {
        tokens.push({ type: "code", text: value.slice(index + 1, end) });
        index = end + 1;
        continue;
      }
    }

    if (rest.startsWith("[")) {
      const labelEnd = value.indexOf("]", index + 1);
      const hrefStart = labelEnd >= 0 ? labelEnd + 1 : -1;
      if (hrefStart > 0 && value[hrefStart] === "(") {
        const hrefEnd = value.indexOf(")", hrefStart + 1);
        if (hrefEnd > hrefStart + 1) {
          const label = value.slice(index + 1, labelEnd);
          const href = value.slice(hrefStart + 1, hrefEnd).trim();
          if (label && isSafeHref(href))
            tokens.push({ type: "link", text: label, href });
          else pushText(label || href);
          index = hrefEnd + 1;
          continue;
        }
      }
    }

    const marker =
      rest.startsWith("**") || rest.startsWith("__")
        ? rest.slice(0, 2)
        : rest[0];
    if (["**", "__", "*", "_"].includes(marker)) {
      const end = value.indexOf(marker, index + marker.length);
      if (end > index + marker.length) {
        tokens.push({
          type: marker.length === 2 ? "strong" : "em",
          text: value.slice(index + marker.length, end),
        });
        index = end + marker.length;
        continue;
      }
    }

    const nextSpecial = ["`", "[", "*", "_"]
      .map((char) => value.indexOf(char, index + 1))
      .filter((next) => next >= 0)
      .sort((a, b) => a - b)[0];
    const nextIndex = nextSpecial ?? value.length;
    pushText(value.slice(index, nextIndex));
    index = nextIndex;
  }

  return tokens;
}

function paragraphBlock(lines: string[]): MarkdownBlock {
  return { type: "paragraph", lines: lines.map(parseInlineMarkdown) };
}

export function parseMarkdown(value?: string | null): MarkdownBlock[] {
  if (!value) return [];

  const blocks: MarkdownBlock[] = [];
  const lines = value.replace(/\r\n?/g, "\n").split("\n");
  let paragraph: string[] = [];
  let listItems: MarkdownToken[][] = [];
  let orderedList = false;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(paragraphBlock(paragraph));
    paragraph = [];
  };

  const flushList = () => {
    if (!listItems.length) return;
    blocks.push({ type: "list", ordered: orderedList, items: listItems });
    listItems = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({
        type: "heading",
        level: (heading[1].length + 2) as 3 | 4 | 5,
        lines: [parseInlineMarkdown(heading[2])],
      });
      continue;
    }

    const unordered = trimmed.match(/^[-*+]\s+(.+)$/);
    const ordered = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph();
      const nextOrdered = Boolean(ordered);
      if (listItems.length && orderedList !== nextOrdered) flushList();
      orderedList = nextOrdered;
      listItems.push(parseInlineMarkdown((unordered || ordered)?.[1] ?? ""));
      continue;
    }

    flushList();
    paragraph.push(trimmed);
  }

  flushParagraph();
  flushList();
  return blocks;
}
