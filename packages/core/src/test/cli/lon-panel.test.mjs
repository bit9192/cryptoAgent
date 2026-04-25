import test from "node:test";
import assert from "node:assert/strict";

import {
  applyExecEntryToPanel,
  createLonPanelState,
  renderLonTopPanel,
  setPanelAwaitingInput,
} from "../../cli/lon-panel.mjs";

test("lon panel: 空会话可渲染默认面板", () => {
  const text = renderLonTopPanel({ panel: createLonPanelState() });
  assert.match(text, /Result Panel/);
  assert.match(text, /status: idle/);
  assert.match(text, /Input/);
});

test("lon panel: 成功记录会更新状态与摘要", () => {
  const panel = createLonPanelState();
  applyExecEntryToPanel(panel, {
    status: "ok",
    task: "assets:query",
    timestamp: "2026-04-25T00:00:00.000Z",
    result: {
      ok: true,
      priceUsd: 123.45,
      privateKey: "PRIVATE_KEY_PLACEHOLDER",
    },
  });

  assert.equal(panel.status, "ok");
  assert.equal(panel.task, "assets:query");
  assert.match(panel.summary, /priceUsd/);
  assert.doesNotMatch(panel.summary, /PRIVATE_KEY_PLACEHOLDER/);
});

test("lon panel: 交互输入阶段会切到 awaiting_input", () => {
  const panel = createLonPanelState();
  setPanelAwaitingInput(panel, "请输入密码", [
    { name: "password", type: "password", required: true, initial: "PRIVATE_KEY_PLACEHOLDER" },
    { name: "confirmed", type: "confirm", required: false },
  ]);
  assert.equal(panel.status, "awaiting_input");
  assert.match(panel.summary, /请输入密码/);
  assert.match(panel.summary, /password<password>\*/);
  assert.match(panel.summary, /confirmed<confirm>/);
  assert.doesNotMatch(panel.summary, /PRIVATE_KEY_PLACEHOLDER/);
});

test("lon panel: 交互字段非法结构时回退通用提示", () => {
  const panel = createLonPanelState();
  setPanelAwaitingInput(panel, "需要补全参数", [null, { foo: "bar" }, "invalid"]);
  assert.equal(panel.status, "awaiting_input");
  assert.match(panel.summary, /任务请求输入/);
});
