/** `{ text } | { append: TaggedText[] } | { tag: [T, TaggedText] }`. */
export type TaggedText<T> = { text: string } | { append: TaggedText<T>[] } | { tag: [T, TaggedText<T>] };

/** The tag payload (`SubexprInfo`) is not used by the fast mode. */
export type CodeWithInfos = TaggedText<unknown>;

/**
 * Concatenates all text leaves. Tolerant of unexpected nodes (they contribute nothing) so that a
 * server-side format change degrades the output instead of breaking the panel.
 */
export function flattenTaggedText(t: unknown): string {
  const out: string[] = [];
  const stack: unknown[] = [t];
  while (stack.length > 0) {
    const node = stack.pop();
    if (typeof node !== 'object' || node === null) continue;
    if ('text' in node && typeof node.text === 'string') {
      out.push(node.text);
    } else if ('append' in node && Array.isArray(node.append)) {
      for (let i = node.append.length - 1; i >= 0; i--) stack.push(node.append[i]);
    } else if ('tag' in node && Array.isArray(node.tag)) {
      stack.push(node.tag[1]);
    }
  }
  return out.join('');
}
