export {};

declare global {
  interface Window {
    secureDm?: {
      initializeDevice: (payload: Record<string, unknown>) => Promise<any>;
      getDeviceBundle: (payload: Record<string, unknown>) => Promise<any>;
      createConversation: (payload: Record<string, unknown>) => Promise<any>;
      adoptConversationId: (payload: Record<string, unknown>) => Promise<any>;
      importConversation: (payload: Record<string, unknown>) => Promise<any>;
      createMessage: (payload: Record<string, unknown>) => Promise<any>;
      receiveMessage: (payload: Record<string, unknown>) => Promise<any>;
      listConversations: (payload: Record<string, unknown>) => Promise<any>;
      listMessages: (payload: Record<string, unknown>) => Promise<any>;
    };
  }
}
