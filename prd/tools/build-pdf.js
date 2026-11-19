#!/usr/bin/env node
/**
 * Builds the print edition of the Margsutra PRD.
 *
 *   node build-pdf.js
 *
 * Reads ../Margsutra-PRD.md, renders the cover full-bleed, prints the body with
 * running footers, and merges the two into one A4 PDF.
 */
const fs = require("fs");
const path = require("path");
const { marked } = require("marked");
const puppeteer = require("puppeteer");
const { PDFDocument } = require("pdf-lib");

const SRC = path.resolve(__dirname, "../Margsutra-PRD.md");
const OUT = path.resolve(__dirname, "../site/Anirban-Panda-Margsutra-PRD.pdf");
const TMP = path.resolve(__dirname, ".build");

fs.mkdirSync(TMP, { recursive: true });

const md = fs.readFileSync(SRC, "utf8");

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/* The document body starts at section 0; everything before it is cover matter. */
const bodyStart = md.indexOf("## 0. TL;DR");
const frontMd = md.slice(0, bodyStart);
const mainMd = md.slice(bodyStart);

const frontHtml = marked.parse(frontMd, { gfm: true });
const docTable = (frontHtml.match(/<table>[\s\S]*?<\/table>/) || [""])[0];

const bodyHtml = marked
  .parse(mainMd, { gfm: true })
  .replace(/<h2>([\s\S]*?)<\/h2>/g, (_, inner) => `<h2 id="${slug(inner)}">${inner}</h2>`)
  .replace(/<table>([\s\S]*?)<\/table>/g, (whole, inner) =>
    /FR-\d/.test(inner) ? `<table class="req">${inner}</table>` : whole
  );

const headings = [...bodyHtml.matchAll(/<h2 id="([^"]+)">([\s\S]*?)<\/h2>/g)].map(
  ([, id, html]) => ({ id, text: html.replace(/<[^>]+>/g, "") })
);

const contents = headings
  .map((h) => {
    const num = (h.text.match(/^(\d+)\./) || [, ""])[1];
    const label = h.text.replace(/^\d+\.\s*/, "");
    return `<li><a href="#${h.id}"><span class="toc-num">${num}</span>${label}</a></li>`;
  })
  .join("");

const cover = `
<section class="cover">
  <div class="cover-frame"></div>
  <div class="cover-mark">MP</div>
  <p class="cover-kicker">Product Requirements Document</p>
  <h1 class="cover-title">Margsutra</h1>
  <p class="cover-sub">Keeping trekkers visible when the signal disappears.</p>
  <div class="cover-meta">
    <div><span>Author</span>Anirban Panda</div>
    <div><span>Role</span>Product Manager</div>
    <div><span>Status</span>Shipped · MVP v1.0</div>
    <div><span>Edition</span>November 2026</div>
  </div>
  <p class="cover-foot">Safety-first expedition management for guided treks</p>
</section>`;

const css = `
  :root{
    --ink:#17201c;
    --muted:#5b6660;
    --line:#d9d5ca;
    --accent:#c2410c;
    --deep:#0e1a15;
    --cream:#f7f3ea;
  }
  *{box-sizing:border-box}
  html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{
    margin:0;
    font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;
    font-size:9.6pt;line-height:1.55;color:var(--ink);background:#fff;
  }

  /* ── Cover ─────────────────────────────────────────────── */
  .cover{
    width:210mm;height:297mm;background:var(--deep);color:var(--cream);
    padding:34mm 26mm 22mm;position:relative;display:flex;flex-direction:column;
    page-break-after:always;
  }
  .cover-frame{
    position:absolute;inset:20mm;border:1px solid rgba(247,243,234,.14);
  }
  .cover-mark{
    width:14mm;height:14mm;border:1px solid rgba(247,243,234,.45);
    display:flex;align-items:center;justify-content:center;
    font-size:9.5pt;letter-spacing:.08em;color:var(--cream);
  }
  .cover-kicker{
    margin:38mm 0 0;font-size:8pt;letter-spacing:.22em;
    text-transform:uppercase;color:#c9c2b2;
  }
  .cover-title{
    font-family:Georgia,"Times New Roman",serif;font-size:56pt;line-height:.94;
    font-weight:400;margin:7mm 0 0;letter-spacing:-.025em;
  }
  .cover-sub{
    font-family:Georgia,"Times New Roman",serif;font-size:15.5pt;line-height:1.35;
    color:#e6dfcf;margin:8mm 0 0;max-width:124mm;
  }
  .cover-meta{
    margin-top:auto;display:grid;grid-template-columns:1fr 1fr;gap:7mm 12mm;
    border-top:1px solid rgba(247,243,234,.18);padding-top:7mm;font-size:9pt;
  }
  .cover-meta div{min-height:12mm}
  .cover-meta span{
    display:block;font-size:6.6pt;letter-spacing:.16em;text-transform:uppercase;
    color:#a79f8e;margin-bottom:1.5mm;
  }
  .cover-foot{
    margin:9mm 0 0;font-size:7.2pt;letter-spacing:.14em;
    text-transform:uppercase;color:#8d8574;
  }

  /* ── Contents ──────────────────────────────────────────── */
  .toc{padding-top:4mm}
  .toc-title,.plain{
    font-family:Georgia,serif;font-size:22pt;font-weight:400;
    margin:0 0 8mm;color:var(--ink);border:0;padding:0;page-break-before:auto;
  }
  .plain{font-size:14pt;margin-bottom:5mm}
  .toc ul{list-style:none;margin:0;padding:0;columns:2;column-gap:16mm}
  .toc li{break-inside:avoid;margin:0 0 3.4mm;font-size:9.4pt}
  .toc a{color:var(--ink);text-decoration:none;display:flex;gap:3.5mm;align-items:baseline}
  .toc-num{
    font-family:"SFMono-Regular",Menlo,Consolas,monospace;
    font-size:7.2pt;color:var(--accent);min-width:5mm;
  }

  /* ── Document control ──────────────────────────────────── */
  .doc-control{margin-top:14mm}

  /* ── Body ──────────────────────────────────────────────── */
  h1{font-family:Georgia,serif;font-size:24pt;font-weight:400;margin:0 0 4mm}
  h2{
    font-family:Georgia,serif;font-size:16pt;font-weight:400;
    margin:11mm 0 5mm;padding-bottom:2.5mm;border-bottom:1.5px solid var(--ink);
    break-before:auto;break-after:avoid;
  }
  h3{font-size:10.6pt;margin:7mm 0 2.4mm;color:var(--ink)}
  h3:after{content:"";display:block;width:9mm;height:2px;background:var(--accent);margin-top:2mm}
  p{margin:0 0 3.2mm}
  strong{font-weight:700}
  em{color:#3d4842}
  ul,ol{margin:0 0 3.6mm;padding-left:5mm}
  li{margin:0 0 1.4mm}
  a{color:var(--accent);text-decoration:none}
  hr{border:0;border-top:1px solid var(--line);margin:7mm 0}

  blockquote{
    margin:3mm 0 5mm;padding:3mm 0 3mm 6mm;border-left:2px solid var(--accent);
    font-family:Georgia,serif;font-size:10.5pt;color:#35413b;
  }
  blockquote p{margin:0 0 2mm}
  blockquote p:last-child{margin:0}

  code{
    font-family:"SFMono-Regular",Menlo,Consolas,monospace;
    font-size:8.4pt;background:#f2efe7;padding:.4mm 1.2mm;border-radius:2px;
  }
  pre{
    background:#f2efe7;padding:4mm;overflow:hidden;font-size:7.6pt;line-height:1.45;
    border-left:2px solid var(--line);margin:0 0 4mm;
  }
  pre code{background:none;padding:0}

  table{width:100%;border-collapse:collapse;margin:0 0 5mm;font-size:8.1pt;line-height:1.4}
  thead{display:table-header-group}
  th{
    text-align:left;font-size:6.8pt;letter-spacing:.1em;text-transform:uppercase;
    color:var(--muted);border-bottom:1.2px solid var(--ink);padding:0 2.2mm 2mm 0;
    vertical-align:bottom;
  }
  td{border-bottom:.6px solid var(--line);padding:2.2mm 2.2mm 2.2mm 0;vertical-align:top}
  tr{break-inside:avoid}
  table code{font-size:7.4pt}

  /* Requirement tables: keep the ID column on one line. */
  .req th:nth-child(1),.req td:nth-child(1){width:13mm;white-space:nowrap}
  .req th:nth-child(3),.req td:nth-child(3){width:10mm}
  .req th:nth-child(4),.req td:nth-child(4){width:12mm}

  .doc-control table{font-size:8.6pt;margin-top:2mm}
  .doc-control td:first-child{
    color:var(--muted);width:30mm;font-size:6.9pt;
    letter-spacing:.09em;text-transform:uppercase;
  }
`;

const baseHtml = (inner) => `<!doctype html><html lang="en"><head>
<meta charset="utf-8">
<title>Margsutra — Product Requirements Document</title>
<meta name="author" content="Anirban Panda">
<style>${css}</style></head><body>${inner}</body></html>`;

const body = `
<section class="toc">
  <h2 class="toc-title">Contents</h2>
  <ul>${contents}</ul>
</section>
<section class="doc-control">
  <h2 class="plain">Document control</h2>
  ${docTable}
</section>
${bodyHtml}`;

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--font-render-hinting=none"],
  });
  const page = await browser.newPage();

  /* Cover — no margins, full bleed. */
  await page.setContent(baseHtml(cover), { waitUntil: "load" });
  const coverPdfPath = path.join(TMP, "cover.pdf");
  await page.pdf({
    path: coverPdfPath,
    format: "A4",
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  });

  /* Body — margins and running footer. */
  await page.setContent(baseHtml(body), { waitUntil: "load" });
  const bodyPdfPath = path.join(TMP, "body.pdf");
  await page.pdf({
    path: bodyPdfPath,
    format: "A4",
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: `<div></div>`,
    footerTemplate: `
      <div style="width:100%;padding:0 14mm;display:flex;justify-content:space-between;
                  font-family:Helvetica,Arial,sans-serif;font-size:7pt;color:#8b8b83;">
        <span>Margsutra · Product Requirements Document · v1.0</span>
        <span class="pageNumber"></span>
      </div>`,
    margin: { top: "14mm", right: "14mm", bottom: "16mm", left: "14mm" },
  });

  await browser.close();

  /* Merge cover + body. */
  const merged = await PDFDocument.create();
  merged.setTitle("Margsutra — Product Requirements Document");
  merged.setAuthor("Anirban Panda");
  merged.setSubject("MVP v1.0 — product requirements for a safety-first expedition platform");
  merged.setKeywords(["PRD", "product management", "expedition safety", "offline", "LoRa", "Socket.IO"]);
  merged.setCreationDate(new Date());

  for (const file of [coverPdfPath, bodyPdfPath]) {
    const src = await PDFDocument.load(fs.readFileSync(file));
    const pages = await merged.copyPages(src, src.getPageIndices());
    pages.forEach((p) => merged.addPage(p));
  }

  fs.writeFileSync(OUT, await merged.save());
  fs.rmSync(TMP, { recursive: true, force: true });

  const kb = Math.round(fs.statSync(OUT).size / 1024);
  console.log(`PDF written: ${OUT} (${kb} KB)`);
})();
