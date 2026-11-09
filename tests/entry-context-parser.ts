import assert from "node:assert/strict";
import { parseContextEntryIds } from "../src/lib/entry-context-link";
assert.deepEqual(parseContextEntryIds("101,102"),[101,102]);
assert.deepEqual(parseContextEntryIds("101,101"),[101]);
for (const value of [null,"","1,2,3","-1,2","1.5,2","1x,2","9007199254740992,2","<script>"]) assert.deepEqual(parseContextEntryIds(value),[]);
console.log("PASS: validated context entry IDs");
