import assert from "node:assert/strict";
import test from "node:test";
import {
  descriptionHtmlToMarkdown,
  descriptionMarkdownToHtml,
} from "./description-markdown";

for (const [name, html] of [
  ["one blank line", "<p>First</p><p></p><p>Last</p>"],
  ["multiple blank lines", "<p>First</p><p></p><p></p><p>Last</p>"],
  ["leading and trailing blank lines", "<p></p><p>Text</p><p></p>"],
  ["consecutive hard breaks", "<p>First<br><br>Last</p>"],
  ["trailing hard breaks", "<p>First<br><br></p>"],
] as const) {
  test(`preserves ${name} across repeated save/reopen cycles`, () => {
    let reopened: string = html;
    const saved = descriptionHtmlToMarkdown(html);
    for (let cycle = 0; cycle < 3; cycle++) {
      reopened = descriptionMarkdownToHtml(descriptionHtmlToMarkdown(reopened));
      assert.equal(descriptionHtmlToMarkdown(reopened), saved);
    }
    assert.equal(reopened.replace(/\n/g, ""), html);
  });
}

test("clearing the editor saves an empty description", () => {
  for (const html of ["", "<p></p>", "<p><br></p>"]) {
    assert.equal(descriptionHtmlToMarkdown(html), "");
  }
  assert.equal(descriptionMarkdownToHtml(""), "");
});

test("existing paragraphs, links, and lists keep their Markdown formatting", () => {
  const markdown = 'First\n\n[Link](https://example.com "Title")\n\n- One\n- Two';
  assert.equal(
    descriptionHtmlToMarkdown(descriptionMarkdownToHtml(markdown)),
    'First\n\n[Link](https://example.com "Title")\n\n-   One\n-   Two'
  );
  assert.equal(descriptionMarkdownToHtml("First\n\nLast"), "<p>First</p>\n<p>Last</p>\n");
});

test("restoring blank lines keeps raw HTML disabled", () => {
  assert.equal(
    descriptionMarkdownToHtml('<script>alert(1)</script>'),
    '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>\n'
  );
});
