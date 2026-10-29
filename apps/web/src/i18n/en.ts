export const en = {
  "settings.title": "Settings",
  "settings.language": "App language",
  "settings.automatic": "Automatic",
  "settings.help":
    "Choose the interface language. Messages and contact details stay unchanged.",
  "common.close": "Close",
  "common.email": "Email",
  "common.password": "Password",
  "common.retry": "Retry",
  "common.retrying": "Retrying...",
  "common.loading": "Loading...",
  "common.participant": "Participant",
  "common.conversation": "Conversation",
  "nav.login": "Log in",
  "nav.register": "Register",
  "nav.logout": "Log out",
  "home.tagline": "A familiar kind of conversation",
  "home.title": "A real-time messenger with a little more character.",
  "home.description":
    "New Messenger keeps conversations focused, immediate, and easy to follow.",
  "home.start": "Start messaging",
  "home.ready": "Ready when you are",
  "home.you": "You say:",
  "home.contact": "Your contact says:",
  "home.exampleYou": "Let’s get this conversation started.",
  "home.exampleContact": "I’m here. What are we building?",
  "home.checking": "API checking",
  "home.available": "API available",
  "home.unavailable": "API unavailable",
  "login.welcome": "Welcome back",
  "login.description": "Pick up where your conversations left off.",
  "login.pending": "Logging in...",
  "login.needAccount": "Need an account?",
  "login.invalid": "Invalid email or password.",
  "login.failed": "Unable to log in. Please try again.",
  "register.title": "Create an account",
  "register.description": "Set up your address and join the conversation.",
  "register.guidance":
    "Use 15–256 characters: a unique, long password or several unrelated words. Spaces, accents and symbols are welcome; character categories are not required. Avoid only whitespace or your complete email address.",
  "register.pending": "Creating account...",
  "register.submit": "Create account",
  "register.hasAccount": "Already have an account?",
  "register.failed": "Unable to create your account. Please try again.",
  "register.invalidEmail": "Enter a valid email address.",
  "register.duplicate": "This email is already registered.",
  "register.passwordLength": "Use between 15 and 256 characters.",
  "register.passwordBlank": "Use a password that is not only whitespace.",
  "register.passwordEmail":
    "Your password must not contain your complete email address.",
  "session.title": "We could not verify your session",
  "session.description":
    "Your messages remain protected. Check your connection or try again when the service is available.",
  "conversation.shareEmail":
    "Share this email so someone can start a conversation with you.",
  "conversation.messages": "Messages",
  "conversation.title": "Conversations",
  "conversation.refresh": "Refresh",
  "conversation.refreshing": "Refreshing...",
  "conversation.empty":
    "No conversations yet. Start one using a contact email.",
  "conversation.emailLabel": "Email address",
  "conversation.placeholder": "person@example.com",
  "conversation.creating": "Creating...",
  "conversation.start": "Start",
  "conversation.openForm": "Start a conversation",
  "conversation.emptyTitle": "Your conversations live here",
  "conversation.emptyDescription":
    "Choose a conversation or start a new one to begin messaging.",
  "conversation.listFailed": "Unable to load conversations. Please try again.",
  "conversation.emailRequired":
    "Enter the email of the person you want to message.",
  "conversation.self": "You cannot start a conversation with yourself.",
  "conversation.createdRefreshFailed":
    "The conversation was created, but the list could not be updated. Use Refresh to find it.",
  "conversation.notFound": "No registered user was found with this email.",
  "conversation.invalidEmail":
    "Check the email address before starting a conversation.",
  "conversation.sessionExpired":
    "Your session has expired. Log in again to start a conversation.",
  "conversation.rateLimited":
    "Too many requests. Wait before starting another conversation.",
  "conversation.createFailed":
    "Unable to create the conversation. Please try again.",
  "conversation.networkFailed":
    "Unable to create the conversation. Check your connection and try again.",
  "conversation.selectFailed":
    "Unable to select the conversation. Please try again.",
  "participant.emptyTitle": "No participant selected",
  "participant.emptyDescription":
    "Choose a conversation to view its participant.",
  "message.label": "Message",
  "message.placeholder": "Type a message...",
  "message.sending": "Sending...",
  "message.retry": "Retry message",
  "message.send": "Send",
  "message.counter": "{count} / {limit} characters",
  "message.limit":
    "Messages must contain at most {limit} characters. Shorten your message before sending.",
  "message.historyFailed":
    "Unable to load messages. Please retry loading history.",
  "message.earlierFailed": "Unable to load earlier messages. Please try again.",
  "message.rejectedContent":
    "The message was rejected. Check its content and the 2,000-character limit before sending again.",
  "message.sessionExpired":
    "Your session has expired. Log in again to send this message.",
  "message.unavailable":
    "This conversation is unavailable. Refresh your conversations before sending again.",
  "message.rejected":
    "The message was rejected. Review the draft before sending again.",
  "message.rateLimited":
    "Too many requests. Wait before retrying this message.",
  "message.unconfirmed":
    "Unable to confirm the message was sent. Retry unchanged to avoid duplicates; editing sends a new message.",
  "message.recoveryFailed":
    "Unable to recover messages. Please retry loading history.",
  "message.retryHistory": "Retry loading history",
  "message.loadingEarlier": "Loading earlier messages...",
  "message.loadEarlier": "Load earlier messages",
  "message.loading": "Loading messages...",
  "message.emptyTitle": "No messages yet",
  "message.emptyDescription":
    "Send the first message to begin this conversation.",
  "message.youSay": "You say:",
  "message.participantSays": "{participant} says:",
  "connection.connecting": "Connection: connecting",
  "connection.connected": "Connection: connected",
  "connection.disconnected": "Connection: disconnected",
  "connection.limited": "Connection: limited",
  "connection.limitHelp":
    "You have reached the connection limit. Close another tab or session and try again.",
  "connection.tryAgain": "Try again",
  "connection.pending": "Connecting...",
  "announcement.connected": "Connection established.",
  "announcement.disconnected": "Connection lost. Reconnecting.",
  "announcement.incoming": "{participant} says: {content}",
} as const;

export type TranslationKey = keyof typeof en;
