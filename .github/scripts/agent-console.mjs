const STREAM_DELTA_TYPES = new Set([
  'stream_event',
  'message_update',
  'message_delta',
  'content_block_delta',
]);
const MAX_CONSOLE_LINE_CHARS = 16 * 1024;

/**
 * Keep actual text and tool payloads visible in Actions. Only duplicate streaming
 * deltas and binary data are omitted; the artifact retains the complete events.
 * The harness redacts secrets before formatting so truncation cannot expose them.
 */
export function formatConsoleLine(line, event) {
  if (STREAM_DELTA_TYPES.has(event.type)) return null;
  const formatted = JSON.stringify(consoleValue(event));
  if (formatted.length <= MAX_CONSOLE_LINE_CHARS) return formatted;
  return `${formatted.slice(0, MAX_CONSOLE_LINE_CHARS)}…[truncated; full event in JSONL artifact]`;
}

function consoleValue(value) {
  if (typeof value === 'string') {
    const text = value.replaceAll(
      /data:[^\s;,"']+;base64,[A-Za-z0-9+/=]+/gu,
      '[base64 data omitted]',
    );
    return text.length > 8_192
      ? `${text.slice(0, 8_192)}…[truncated ${text.length} chars; full content in JSONL artifact]`
      : text;
  }
  if (Array.isArray(value)) return value.map(consoleValue);
  if (!value || typeof value !== 'object') return value;
  if (value.type === 'base64') {
    return {
      type: value.type,
      media_type: value.media_type,
      data: '[base64 data omitted]',
    };
  }
  // Images may also use URL sources; omit the binary payload at any nesting
  // depth, including images inside a tool_result content array.
  if (value.type === 'image') {
    return {
      type: value.type,
      mediaType: value.source?.media_type,
      omitted: true,
    };
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, consoleValue(item)]),
  );
}
