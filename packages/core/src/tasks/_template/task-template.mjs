import { defineTask } from "../../execute/define-task.mjs";
import { buildActionDispatcher } from "../../execute/action-dispatcher.mjs";

const TASK_ID = "domain:feature";

function getStore(ctx) {
  // Replace with your real dependency checks.
  return ctx?.store ?? null;
}

async function runStatus(ctx) {
  const store = getStore(ctx);
  return {
    ok: true,
    action: "domain.status",
    hasStore: Boolean(store),
    data: {},
  };
}

async function runExecute(ctx, input) {
  const store = getStore(ctx);
  return {
    ok: true,
    action: "domain.execute",
    hasStore: Boolean(store),
    received: {
      target: String(input?.target ?? "").trim() || null,
      strict: Boolean(input?.strict),
    },
    data: {},
  };
}

export const actionObject = Object.freeze({
  "domain.status": {
    taskId: TASK_ID,
    sub: "status",
    usage: "domain status",
    description: "Read-only status action",
    argsSchema: {
      required: [],
      properties: {},
    },
    handler: async (ctx) => await runStatus(ctx),
  },
  "domain.execute": {
    taskId: TASK_ID,
    sub: "execute",
    usage: "domain execute",
    description: "Write action with explicit argsSchema",
    argsSchema: {
      required: ["target"],
      properties: {
        target: { type: "string" },
        strict: { type: "boolean" },
      },
    },
    handler: async (ctx, input) => await runExecute(ctx, input),
  },
});

export const dispatcher = buildActionDispatcher({
  actionObject,
  actionLabel: `${TASK_ID} action`,
});

export const actionList = Object.freeze(dispatcher.listPublic());
export const operationList = Object.freeze(dispatcher.list());

export const task = defineTask({
  id: TASK_ID,
  title: "Domain Feature",
  description: "Template task using defineTask + action dispatcher",
  readonly: false,
  requiresConfirm: false,
  sourcePolicy: ["cli", "test", "api", "workflow"],
  tags: ["template"],
  operations: actionList.map((item) => ({
    action: item.action,
    sub: item.sub,
    usage: item.usage,
    description: item.description,
    argsSchema: item.argsSchema,
  })),
  inputSchema: {
    required: ["action"],
    properties: {
      action: { type: "string" },
      target: { type: "string" },
      strict: { type: "boolean" },
    },
  },
  async run(ctx) {
    const input = ctx.input();
    const action = String(input?.action ?? "").trim();
    return await dispatcher.dispatch(action, ctx, input);
  },
});

export default task;
