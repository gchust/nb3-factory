import type { AssistantAnswer } from './types.js';

/**
 * The assistant conversation is kept per signed-in user in browser storage, so
 * a refresh restores the question, the retrieval result and the note draft.
 * Drafts are deliberately *not* business records: nothing here writes to a
 * ticket. The draft only becomes a business record when the user confirms it
 * inside the work-order transition form, which is the single explicit save
 * boundary. The store is keyed by user so two accounts on one browser never see
 * each other's conversation.
 */

const STORAGE_PREFIX = 'service:assistant:v1:';

export interface AssistantDraft {
  readonly text: string;
  readonly updatedAt: string;
}

export interface AssistantConversation {
  readonly question: string;
  readonly answer: AssistantAnswer | null;
  readonly draft: AssistantDraft | null;
}

const EMPTY: AssistantConversation = {
  question: '',
  answer: null,
  draft: null,
};

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function keyFor(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

export function loadAssistantConversation(
  userId: string | undefined,
): AssistantConversation {
  if (!userId) return EMPTY;
  const store = storage();
  if (!store) return EMPTY;
  const raw = store.getItem(keyFor(userId));
  if (!raw) return EMPTY;
  try {
    const parsed = JSON.parse(raw) as Partial<AssistantConversation>;
    return {
      question: typeof parsed.question === 'string' ? parsed.question : '',
      answer: parsed.answer ?? null,
      draft: parsed.draft ?? null,
    };
  } catch {
    return EMPTY;
  }
}

export function saveAssistantConversation(
  userId: string | undefined,
  conversation: AssistantConversation,
): void {
  if (!userId) return;
  const store = storage();
  if (!store) return;
  try {
    store.setItem(keyFor(userId), JSON.stringify(conversation));
  } catch {
    // A full or unavailable store must not break the page; the in-memory
    // conversation still works for this session.
  }
}

export function clearAssistantConversation(userId: string | undefined): void {
  if (!userId) return;
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(keyFor(userId));
  } catch {
    // Ignore: nothing to clear.
  }
}

/** The note draft waiting to be applied inside a work-order transition. */
export function loadAssistantDraft(
  userId: string | undefined,
): AssistantDraft | null {
  return loadAssistantConversation(userId).draft;
}
