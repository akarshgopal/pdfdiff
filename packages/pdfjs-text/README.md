# @pdfdiff/pdfjs-text

DOM-free PDF.js text extraction. Both `@pdfdiff/pdfjs-browser` and
`pdfdiff` use this so a CLI report describes changes in the same
line-level terms the viewer shows.

```ts
import { extractPageText } from "@pdfdiff/pdfjs-text";

const page = await extractPageText({ pdf, pageCount: pdf.numPages }, 1);
```

The document argument is duck-typed: `getPage`, `getViewport`, and
`getTextContent`. There is no canvas dependency.
