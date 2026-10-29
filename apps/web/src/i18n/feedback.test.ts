import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ref } from "vue";

const api = vi.hoisted(() => ({
  getMessageHistory: vi.fn(),
  sendMessage: vi.fn(),
  getConversations: vi.fn(),
  createConversation: vi.fn(),
}));
vi.mock("../api/conversations", () => api);
vi.mock("../auth/session", () => ({
  session: { user: { sub: "owner", email: "owner@example.test" } },
}));

import { setLanguagePreference } from "./index";
import { ApiError } from "../api/client";
import { useRegistrationForm } from "../auth/registration";
import { useLoginForm } from "../auth/login";
import { useConversations } from "../useConversations";
import { useConversationMessages } from "../useConversationMessages";

beforeEach(() => {
  vi.clearAllMocks();
  setLanguagePreference("en");
});
afterEach(() => setLanguagePreference("en"));

it("retranslates existing validation/server/auth feedback without another request", async () => {
  const register = vi.fn().mockRejectedValue(new ApiError(409, "RAW_SERVER"));
  const state = useRegistrationForm(register);
  state.email.value = "user@example.test";
  state.password.value = "river lantern mango orbit";
  await state.submit();
  expect(state.emailError.value).toBe("This email is already registered.");
  setLanguagePreference("pt-BR");
  expect(state.emailError.value).toBe("Este e-mail já está cadastrado.");
  expect(register).toHaveBeenCalledTimes(1);
  state.password.value = "short";
  expect(state.passwordError.value).toBe("Use de 15 a 256 caracteres.");
  const login = useLoginForm(
    vi.fn().mockRejectedValue(new Error("RAW_SERVER")),
  );
  await login.submit();
  expect(login.errorMessage.value).toBe(
    "Não foi possível entrar. Tente novamente.",
  );
  setLanguagePreference("en");
  expect(login.errorMessage.value).toBe("Unable to log in. Please try again.");
});

it("retranslates list and creation errors without refreshing or changing input", async () => {
  api.getConversations.mockRejectedValue(new Error("network"));
  const state = useConversations();
  try {
    await state.loadConversations();
    state.participantEmail.value = "owner@example.test";
    await state.submitConversation();
    setLanguagePreference("pt-BR");
    expect(state.listError.value).toBe(
      "Não foi possível carregar as conversas. Tente novamente.",
    );
    expect(state.creationError.value).toBe(
      "Você não pode iniciar uma conversa consigo mesmo.",
    );
    expect(state.participantEmail.value).toBe("owner@example.test");
    expect(api.getConversations).toHaveBeenCalledTimes(1);
    expect(api.createConversation).not.toHaveBeenCalled();
  } finally {
    state.dispose();
  }
});

it("preserves a pending/failed send and its client ID across locale changes", async () => {
  api.getMessageHistory.mockResolvedValue({ messages: [], nextCursor: null });
  let reject!: (error: Error) => void;
  api.sendMessage.mockImplementationOnce(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
  );
  const selected = ref<string | null>("conversation");
  const state = useConversationMessages(selected);
  try {
    await vi.waitFor(() => expect(state.isLoadingMessages.value).toBe(false));
    state.messageContent.value = "  Preserve this draft  ";
    const pending = state.submitMessage();
    const original = api.sendMessage.mock.calls[0];
    setLanguagePreference("pt-BR");
    expect(state.isSendingMessage.value).toBe(true);
    expect(selected.value).toBe("conversation");
    expect(state.messageContent.value).toBe("  Preserve this draft  ");
    reject(new ApiError(429, "RAW_SERVER"));
    await pending;
    expect(state.messageErrorMessage.value).toBe(
      "Muitas solicitações. Aguarde antes de reenviar esta mensagem.",
    );
    const id = state.pendingMessage.value?.clientMessageId;
    setLanguagePreference("en");
    expect(state.messageErrorMessage.value).toBe(
      "Too many requests. Wait before retrying this message.",
    );
    expect(state.pendingMessage.value?.clientMessageId).toBe(id);
    expect(api.sendMessage).toHaveBeenCalledTimes(1);
    api.sendMessage.mockResolvedValueOnce({
      id: "message",
      clientMessageId: id,
      conversationId: "conversation",
      senderId: "owner",
      content: "Preserve this draft",
      createdAt: "2026-10-10T12:00:00.123456Z",
    });
    await state.submitMessage();
    expect(api.sendMessage.mock.calls[1]).toEqual(original);
  } finally {
    state.dispose();
  }
});
