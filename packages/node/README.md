# @pdfdiff/node

Headless PDF comparison for Node, plus the `pdfdiff` CLI. It extracts text with
`@pdfdiff/pdfjs-text`, aligns pages and diffs wording with `@pdfdiff/core`, and
writes a text, JSON, or CSV report. Visual diffs stay in the browser app.

```ts
import { comparePdfText } from "@pdfdiff/node";

const { report } = await comparePdfText("earlier.pdf", "newer.pdf");
```

```bash
pdfdiff earlier.pdf newer.pdf --report json --fail-on-change
```

Build with `pnpm build` from this workspace. The CLI bin is `pdfdiff`.
