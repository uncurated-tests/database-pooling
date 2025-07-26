type MutateResponseHeadersBeforeFlushHandler = (headers: Headers) => void;

type Context = {
  waitUntil?: (promise: Promise<unknown>) => void;
};

export const SYMBOL_FOR_REQ_CONTEXT = Symbol.for("@vercel/request-context");

export const getRequestContext = (): Context => {
  const fromSymbol: typeof globalThis & {
    [SYMBOL_FOR_REQ_CONTEXT]?: { get?: () => Context };
  } = globalThis;

  return fromSymbol[SYMBOL_FOR_REQ_CONTEXT]?.get?.() ?? {};
};
