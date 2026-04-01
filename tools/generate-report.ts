#!/usr/bin/env npx tsx

/**
 * Axyntel PDF Report Generator
 *
 * Converts a Markdown file into a professionally branded PDF report.
 *
 * Usage:
 *   npx tsx tools/generate-report.ts --input report.md [--output report.pdf]
 */

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import MarkdownIt from "markdown-it";
import puppeteer from "puppeteer";

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const { values } = parseArgs({
  options: {
    input: { type: "string", short: "i" },
    output: { type: "string", short: "o" },
  },
  strict: true,
});

if (!values.input) {
  console.error("Usage: generate-report.ts --input <file.md> [--output <file.pdf>]");
  process.exit(1);
}

const inputPath = path.resolve(values.input);
const outputPath = values.output
  ? path.resolve(values.output)
  : inputPath.replace(/\.md$/i, ".pdf");

if (!fs.existsSync(inputPath)) {
  console.error(`File not found: ${inputPath}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Brand tokens
// ---------------------------------------------------------------------------

const brand = {
  midnight: "#0A0F1E",
  blue: "#3B82F6",
  snow: "#F1F5F9",
  body: "#1E293B",
  steel: "#64748B",
  heading: "#0F172A",
} as const;

// ---------------------------------------------------------------------------
// Markdown parsing
// ---------------------------------------------------------------------------

const raw = fs.readFileSync(inputPath, "utf-8");
const md = new MarkdownIt({ html: true, typographer: true, linkify: true });

// Extract first # heading as the report title
const titleMatch = raw.match(/^#\s+(.+)$/m);
const reportTitle = titleMatch ? titleMatch[1].trim() : "Untitled Report";

// Extract headings for TOC (# and ##)
interface TocEntry {
  level: 1 | 2;
  text: string;
  slug: string;
}

const tocEntries: TocEntry[] = [];
let isFirstH1 = true;

for (const line of raw.split("\n")) {
  const h1 = line.match(/^#\s+(.+)$/);
  const h2 = line.match(/^##\s+(.+)$/);
  if (h1) {
    // Skip the first h1 — it's the document title shown on the cover page
    if (isFirstH1) {
      isFirstH1 = false;
      continue;
    }
    const text = h1[1].trim();
    tocEntries.push({ level: 1, text, slug: slugify(text) });
  } else if (h2) {
    const text = h2[1].trim();
    tocEntries.push({ level: 2, text, slug: slugify(text) });
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

// Render markdown to HTML
let bodyHtml = md.render(raw);

// Remove the first <h1> from the body — it's the document title already on the cover page
bodyHtml = bodyHtml.replace(/<h1>.*?<\/h1>/, "");

// Inject id attributes on headings so TOC links work
bodyHtml = bodyHtml.replace(/<h1>(.*?)<\/h1>/g, (_match, inner) => {
  const slug = slugify(inner.replace(/<[^>]*>/g, ""));
  return `<h1 id="${slug}">${inner}</h1>`;
});
bodyHtml = bodyHtml.replace(/<h2>(.*?)<\/h2>/g, (_match, inner) => {
  const slug = slugify(inner.replace(/<[^>]*>/g, ""));
  return `<h2 id="${slug}">${inner}</h2>`;
});

// Insert page-break before every <h1 (except the very first one in the body)
let h1Count = 0;
bodyHtml = bodyHtml.replace(/<h1/g, () => {
  h1Count++;
  if (h1Count > 1) {
    return '<div class="page-break"></div><h1';
  }
  return "<h1";
});

// ---------------------------------------------------------------------------
// Date formatting
// ---------------------------------------------------------------------------

const reportDate = new Date().toLocaleDateString("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

// ---------------------------------------------------------------------------
// TOC HTML
// ---------------------------------------------------------------------------

function buildTocHtml(): string {
  const items = tocEntries.map((entry) => {
    if (entry.level === 1) {
      return `<li class="toc-h1"><a href="#${entry.slug}">${entry.text}</a></li>`;
    } else {
      return `<li class="toc-h2"><a href="#${entry.slug}">${entry.text}</a></li>`;
    }
  });
  return `
    <div class="toc-page">
      <h2 class="toc-title">Table of Contents</h2>
      <ul class="toc-list">${items.join("\n")}</ul>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Full HTML document
// ---------------------------------------------------------------------------

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<style>
/* ===== Reset ===== */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

@page { size: A4; margin: 0; }

body {
  font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
  font-size: 11pt;
  line-height: 1.65;
  color: ${brand.body};
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* ===== Title Page ===== */
.title-page {
  width: 100%;
  height: 100vh;
  background: ${brand.midnight};
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  padding: 60px 80px;
  page-break-after: always;
}
.title-brand {
  font-size: 18pt;
  font-weight: 700;
  letter-spacing: 3px;
  color: ${brand.blue};
  text-transform: lowercase;
  margin-bottom: 48px;
}
.title-accent {
  width: 64px;
  height: 3px;
  background: ${brand.blue};
  margin: 0 auto 48px auto;
  border-radius: 2px;
}
.title-text {
  font-size: 28pt;
  font-weight: 700;
  color: ${brand.snow};
  line-height: 1.25;
  max-width: 600px;
  margin-bottom: 48px;
}
.title-meta {
  color: ${brand.steel};
  font-size: 10pt;
  line-height: 1.8;
}
.title-meta .date { color: ${brand.snow}; font-weight: 500; }
.title-meta .conf { color: ${brand.steel}; font-style: italic; margin-top: 4px; }

/* ===== TOC Page ===== */
.toc-page {
  padding: 72px 72px 60px;
  page-break-after: always;
}
.toc-title {
  font-size: 20pt;
  color: ${brand.heading};
  margin-bottom: 32px;
  padding-bottom: 12px;
  border-bottom: 2px solid ${brand.blue};
}
.toc-list {
  list-style: none;
  padding: 0;
}
.toc-list li {
  margin-bottom: 6px;
}
.toc-list li a {
  color: ${brand.body};
  text-decoration: none;
  font-size: 10.5pt;
}
.toc-list li a:hover { color: ${brand.blue}; }
.toc-h1 a { font-weight: 600; font-size: 11pt; }
.toc-h2 { padding-left: 24px; }
.toc-h2 a { color: ${brand.steel}; }

/* ===== Content ===== */
.content {
  padding: 60px 72px;
}

.page-break {
  page-break-before: always;
  height: 0;
}

/* Headings */
h1 {
  font-size: 22pt;
  font-weight: 700;
  color: ${brand.heading};
  margin: 0 0 20px 0;
  padding-top: 12px;
  padding-bottom: 10px;
  border-bottom: 2px solid ${brand.blue};
  line-height: 1.3;
}
h2 {
  font-size: 15pt;
  font-weight: 600;
  color: ${brand.heading};
  margin: 32px 0 12px 0;
  padding-bottom: 6px;
  border-bottom: 1px solid #E2E8F0;
}
h3 {
  font-size: 12.5pt;
  font-weight: 600;
  color: ${brand.heading};
  margin: 24px 0 8px 0;
}
h4, h5, h6 {
  font-size: 11pt;
  font-weight: 600;
  color: ${brand.steel};
  margin: 20px 0 6px 0;
}

/* Paragraphs & inline */
p { margin: 0 0 12px 0; }
strong { font-weight: 600; }
em { font-style: italic; }
a { color: ${brand.blue}; text-decoration: none; }

/* Lists */
ul, ol { margin: 0 0 14px 0; padding-left: 24px; }
li { margin-bottom: 4px; }
li > ul, li > ol { margin-top: 4px; margin-bottom: 4px; }

/* Code */
code {
  font-family: "SF Mono", "Fira Code", "Consolas", monospace;
  font-size: 9.5pt;
  background: #F1F5F9;
  padding: 1px 5px;
  border-radius: 3px;
  color: #0F172A;
}
pre {
  background: #F8FAFC;
  border: 1px solid #E2E8F0;
  border-left: 3px solid ${brand.blue};
  border-radius: 4px;
  padding: 14px 18px;
  margin: 0 0 16px 0;
  overflow-x: auto;
  font-size: 9pt;
  line-height: 1.55;
}
pre code {
  background: none;
  padding: 0;
  border-radius: 0;
}

/* Blockquotes */
blockquote {
  border-left: 3px solid ${brand.blue};
  margin: 0 0 16px 0;
  padding: 10px 20px;
  background: #F8FAFC;
  color: ${brand.steel};
  font-style: italic;
}
blockquote p { margin: 0; }

/* Tables */
table {
  width: 100%;
  border-collapse: collapse;
  margin: 0 0 18px 0;
  font-size: 9.5pt;
}
thead th {
  background: ${brand.midnight};
  color: ${brand.snow};
  font-weight: 600;
  text-align: left;
  padding: 8px 12px;
}
thead th:first-child { border-radius: 4px 0 0 0; }
thead th:last-child { border-radius: 0 4px 0 0; }
tbody td {
  padding: 7px 12px;
  border-bottom: 1px solid #E2E8F0;
}
tbody tr:nth-child(even) { background: #F8FAFC; }

/* Horizontal rules */
hr {
  border: none;
  height: 2px;
  background: ${brand.blue};
  margin: 28px 0;
  opacity: 0.3;
}

/* Images */
img {
  max-width: 100%;
  border-radius: 4px;
  margin: 8px 0;
}
</style>
</head>
<body>

<!-- Title Page -->
<div class="title-page">
  <div class="title-brand">axyntel.</div>
  <div class="title-accent"></div>
  <div class="title-text">${escapeHtml(reportTitle)}</div>
  <div class="title-meta">
    <p class="date">${reportDate}</p>
    <p class="conf">Confidential</p>
  </div>
</div>

<!-- Table of Contents -->
${buildTocHtml()}

<!-- Content -->
<div class="content">
${bodyHtml}
</div>

</body>
</html>`;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// PDF generation
// ---------------------------------------------------------------------------

async function generatePdf() {
  console.log(`Reading:  ${inputPath}`);
  console.log(`Title:    ${reportTitle}`);
  console.log(`Sections: ${tocEntries.filter((e) => e.level === 1).length} chapters, ${tocEntries.filter((e) => e.level === 2).length} sub-sections`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "domcontentloaded" });

  await page.pdf({
    path: outputPath,
    format: "A4",
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: `
      <div style="width:100%; font-size:7pt; font-family:Helvetica,Arial,sans-serif; color:${brand.steel}; padding:8px 48px 0; text-align:right;">
        <span class="pageNumber"></span>
      </div>
    `,
    footerTemplate: `
      <div style="width:100%; font-size:7pt; font-family:Helvetica,Arial,sans-serif; color:${brand.steel}; padding:0 48px 8px; display:flex; justify-content:space-between;">
        <span>Axyntel | Confidential</span>
        <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
      </div>
    `,
    margin: {
      top: "40px",
      bottom: "48px",
      left: "0",
      right: "0",
    },
  });

  await browser.close();

  const stat = fs.statSync(outputPath);
  const sizeKb = (stat.size / 1024).toFixed(0);
  console.log(`Output:   ${outputPath} (${sizeKb} KB)`);
  console.log("Done.");
}

generatePdf().catch((err) => {
  console.error("PDF generation failed:", err);
  process.exit(1);
});
