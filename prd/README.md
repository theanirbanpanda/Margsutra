# Margsutra — PRD and case study

A product-management portfolio artifact for Margsutra: a 14-page PRD and a
single-page case study that links to it.

```
prd/
  Margsutra-PRD.md                      source of truth (Markdown)
  site/
    index.html                          single-page case study
    Anirban-Panda-Margsutra-PRD.pdf     downloadable PRD
  tools/
    build-pdf.js                        Markdown -> A4 PDF (Puppeteer)
```

## Rebuild the PDF

After editing `Margsutra-PRD.md`:

```bash
cd prd/tools
npm install          # first time only
node build-pdf.js
```

It writes `prd/site/Anirban-Panda-Margsutra-PRD.pdf`. The site links to that
filename directly.

## Deploy

**Fastest — Netlify Drop.** Go to <https://app.netlify.com/drop> and drag the
`prd/site` folder in. You get a public URL in seconds.

**Git deploy.** Connect the repository in Netlify. The root `netlify.toml`
sets the publish directory to `prd/site`; there is no build command.

Before publishing, confirm the demo credentials in `site/index.html` still work
and that the PDF opens from the deployed URL.

## Notes

- The page is self-contained: no external fonts, scripts or analytics.
- `prd/tools/node_modules` is ignored by the repo's root `.gitignore`.
- The PRD states shipped / prototype / next explicitly. Keep that honest when
  editing — it is the part interviewers probe.
