import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("app/page.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");

assert.match(page, /from "framer-motion"/);
assert.match(page, /from "@phosphor-icons\/react"/);
assert.match(page, /function RuntimeProgress/);
assert.match(page, /function DetailsDrawer/);
assert.match(page, /客服对话/);
assert.match(page, /流程详情/);
assert.doesNotMatch(page, /className="route-summary"/);
assert.doesNotMatch(page, /className="main-grid service-grid"/);

assert.match(css, /\.customer-shell/);
assert.match(css, /\.conversation-card/);
assert.match(css, /\.runtime-progress/);
assert.match(css, /\.details-drawer/);
assert.match(css, /@media \(max-width: 720px\)/);

console.log("ui shell tests passed");
