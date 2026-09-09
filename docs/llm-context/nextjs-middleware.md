<!-- source: https://nextjs.org/docs/app/api-reference/file-conventions/middleware.md
     fetched: 2026-09-09 -->

---
title: middleware.js
description: API reference for the middleware.js file (deprecated, renamed to proxy.js).
url: "https://nextjs.org/docs/app/api-reference/file-conventions/middleware"
docs_index: /docs/llms.txt
prerequisites:
  - "API Reference: /docs/app/api-reference"
  - "File-system conventions: /docs/app/api-reference/file-conventions"
related:
  - app/api-reference/file-conventions/proxy
---


> For an index of all Next.js documentation, see [/docs/llms.txt](/docs/llms.txt).
The `middleware.js` file convention has been **deprecated** in Next.js 16 and renamed to [`proxy.js`](/docs/app/api-reference/file-conventions/proxy).

All functionality remains the same — only the file and export names have changed. See the [Migration to Proxy](/docs/app/api-reference/file-conventions/proxy#migration-to-proxy) section for details on how to migrate.

You can automatically migrate by running:

```bash
npx @next/codemod@canary middleware-to-proxy .
```

For full documentation, see the [`proxy.js` API reference](/docs/app/api-reference/file-conventions/proxy).
## Learn more about Proxy- [proxy.js](/docs/app/api-reference/file-conventions/proxy)
  - API reference for the proxy.js file.

---

For a semantic overview of all documentation, see [/docs/sitemap.md](/docs/sitemap.md)

For an index of all available documentation, see [/docs/llms.txt](/docs/llms.txt)