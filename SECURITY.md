# Security

pdfdiff opens untrusted PDF files in the browser and in the Node CLI. Treat
unexpected parser or renderer behavior as a security issue.

## Report a vulnerability

Email [akarsh@pdfdiff.app](mailto:akarsh@pdfdiff.app) with:

- a description of the issue
- a proof-of-concept PDF if you have one
- affected version or commit if you know it

Please do not open a public GitHub issue for an unreleased parser, renderer,
or worker bug.

There are no accounts or uploaded files on pdfdiff.app. The site is static.
A vulnerability in PDF.js itself should also be reported upstream at
https://github.com/mozilla/pdf.js.
