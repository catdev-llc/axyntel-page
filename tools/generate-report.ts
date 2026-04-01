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
import { PDFDocument } from "pdf-lib";

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const { values } = parseArgs({
  options: {
    input: { type: "string", short: "i" },
    output: { type: "string", short: "o" },
    type: { type: "string", short: "t" },
  },
  strict: true,
});

if (!values.input) {
  console.error("Usage: generate-report.ts --input <file.md> [--output <file.pdf>] [--type <label>]");
  console.error("");
  console.error("  --type, -t   Document type shown on title page (default: Research Report)");
  console.error("               Examples: Regulatory Analysis, Competitive Landscape, Market Brief,");
  console.error("               Due Diligence Report, Policy Research, Battlecard");
  process.exit(1);
}

const documentType = values.type || "Research Report";

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
// Shared CSS
// ---------------------------------------------------------------------------

const sharedCss = `
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
}`;

// ---------------------------------------------------------------------------
// CSS for content pages (headings, lists, tables, etc.)
// ---------------------------------------------------------------------------

const contentCss = `
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
pre code { background: none; padding: 0; border-radius: 0; }

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
table { width: 100%; border-collapse: collapse; margin: 0 0 18px 0; font-size: 9.5pt; }
thead th {
  background: ${brand.midnight};
  color: ${brand.snow};
  font-weight: 600;
  text-align: left;
  padding: 8px 12px;
}
thead th:first-child { border-radius: 4px 0 0 0; }
thead th:last-child { border-radius: 0 4px 0 0; }
tbody td { padding: 7px 12px; border-bottom: 1px solid #E2E8F0; }
tbody tr:nth-child(even) { background: #F8FAFC; }

/* Horizontal rules */
hr { border: none; height: 2px; background: ${brand.blue}; margin: 28px 0; opacity: 0.3; }

/* Images */
img { max-width: 100%; border-radius: 4px; margin: 8px 0; }

.page-break { page-break-before: always; height: 0; }
`;

// ---------------------------------------------------------------------------
// HTML documents (two separate docs for separate PDF generation)
// ---------------------------------------------------------------------------

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Pre-build TOC list items
const tocListHtml = tocEntries.map((entry) => {
  if (entry.level === 1) {
    return `<li class="toc-h1"><a href="#${entry.slug}">${entry.text}</a></li>`;
  } else {
    return `<li class="toc-h2"><a href="#${entry.slug}">${entry.text}</a></li>`;
  }
}).join("\n");

const tocChapters = tocEntries.filter(e => e.level === 1).length;
const tocSections = tocEntries.filter(e => e.level === 2).length;

// Part 1: Title page + TOC (no header/footer)
const frontHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" />
<style>
${sharedCss}

/* ===== Title Page ===== */
.title-page {
  width: 100%; height: 100vh;
  background: ${brand.midnight};
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 0;
}

/* Subtle grid pattern overlay */
.title-page::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(59,130,246,0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(59,130,246,0.03) 1px, transparent 1px);
  background-size: 40px 40px;
  pointer-events: none;
}

/* Gradient glow orb */
.title-glow {
  position: absolute;
  top: -120px;
  right: -120px;
  width: 480px;
  height: 480px;
  background: radial-gradient(circle, rgba(59,130,246,0.12) 0%, transparent 70%);
  border-radius: 50%;
  pointer-events: none;
}

.title-glow-bottom {
  position: absolute;
  bottom: -80px;
  left: -80px;
  width: 320px;
  height: 320px;
  background: radial-gradient(circle, rgba(59,130,246,0.06) 0%, transparent 70%);
  border-radius: 50%;
  pointer-events: none;
}

/* Top bar with logo */
.title-top {
  position: relative;
  z-index: 1;
  padding: 56px 64px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.title-brand {
  font-size: 16pt;
  font-weight: 700;
  letter-spacing: 2px;
  color: ${brand.snow};
  text-transform: lowercase;
}
.title-brand span { color: ${brand.blue}; }

.title-type {
  font-size: 8pt;
  font-weight: 500;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: ${brand.blue};
  border: 1px solid rgba(59,130,246,0.3);
  padding: 6px 16px;
  border-radius: 2px;
}

/* Main content area */
.title-main {
  position: relative;
  z-index: 1;
  padding: 0 64px;
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.title-accent {
  width: 48px;
  height: 3px;
  background: ${brand.blue};
  margin-bottom: 32px;
  border-radius: 2px;
}

.title-text {
  font-size: 32pt;
  font-weight: 700;
  color: ${brand.snow};
  line-height: 1.2;
  max-width: 520px;
  margin-bottom: 24px;
  letter-spacing: -0.5px;
}

.title-subtitle {
  font-size: 11pt;
  color: ${brand.steel};
  line-height: 1.6;
  max-width: 440px;
}

/* Bottom bar with metadata */
.title-bottom {
  position: relative;
  z-index: 1;
  padding: 40px 64px 56px;
  border-top: 1px solid rgba(255,255,255,0.06);
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
}

.title-meta-left {
  display: flex;
  gap: 48px;
}

.title-meta-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.title-meta-label {
  font-size: 7pt;
  font-weight: 600;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: ${brand.steel};
}

.title-meta-value {
  font-size: 9.5pt;
  font-weight: 500;
  color: ${brand.snow};
}

.title-conf {
  font-size: 7.5pt;
  font-weight: 500;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: rgba(239,68,68,0.7);
}

/* ===== TOC Page ===== */
.toc-page { padding: 60px 72px; }
.toc-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 36px;
  padding-bottom: 16px;
  border-bottom: 2px solid ${brand.blue};
}
.toc-title { font-size: 20pt; color: ${brand.heading}; font-weight: 700; }
.toc-subtitle { font-size: 9pt; color: ${brand.steel}; }
.toc-list { list-style: none; padding: 0; }
.toc-list li { padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
.toc-list li:last-child { border-bottom: none; }
.toc-list li a { color: ${brand.body}; text-decoration: none; font-size: 10.5pt; }
.toc-h1 a { font-weight: 600; font-size: 11pt; color: ${brand.heading}; }
.toc-h2 { padding-left: 24px; }
.toc-h2 a { color: ${brand.steel}; font-size: 10pt; }
</style>
</head>
<body>

<!-- Title Page -->
<div class="title-page">
  <div class="title-glow"></div>
  <div class="title-glow-bottom"></div>

  <div class="title-top">
    <div class="title-brand">axyntel<span>.</span></div>
    <div class="title-type">${escapeHtml(documentType)}</div>
  </div>

  <div class="title-main">
    <div class="title-accent"></div>
    <div class="title-text">${escapeHtml(reportTitle)}</div>
    <div class="title-subtitle">Structured research intelligence — every claim traced to its source.</div>
  </div>

  <div class="title-bottom">
    <div class="title-meta-left">
      <div class="title-meta-item">
        <span class="title-meta-label">Date</span>
        <span class="title-meta-value">${reportDate}</span>
      </div>
      <div class="title-meta-item">
        <span class="title-meta-label">Prepared by</span>
        <span class="title-meta-value">Axyntel Research</span>
      </div>
    </div>
    <div class="title-conf">Confidential</div>
  </div>
</div>

<!-- TOC -->
<div style="page-break-before: always;"></div>
<div class="toc-page">
  <div class="toc-header">
    <h2 class="toc-title">Contents</h2>
    <span class="toc-subtitle">${tocChapters} chapters &middot; ${tocSections} sections</span>
  </div>
  <ul class="toc-list">${tocListHtml}</ul>
</div>

</body>
</html>`;

// Part 2: Content pages (with header/footer)
const contentHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" />
<style>
${sharedCss}
${contentCss}
.content { padding: 0; }

/* CSS-based running header & footer (works reliably in print) */
@page {
  margin: 2.5cm 2cm;

  @top-left {
    content: "Axyntel · Confidential";
    font-size: 7.5pt;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    color: #94a3b8;
  }

  @bottom-right {
    content: "Page " counter(page) " of " counter(pages);
    font-size: 7.5pt;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    color: #94a3b8;
  }
}
</style>
</head>
<body>
<div class="content">
${bodyHtml}
</div>
</body>
</html>`;

// ---------------------------------------------------------------------------
// PDF generation — two passes, then merge
// ---------------------------------------------------------------------------

async function generatePdf() {
  console.log(`Reading:  ${inputPath}`);
  console.log(`Title:    ${reportTitle}`);
  console.log(`Sections: ${tocEntries.filter((e) => e.level === 1).length} chapters, ${tocEntries.filter((e) => e.level === 2).length} sub-sections`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  // --- Pass 1: Title page + TOC (no header/footer) ---
  const page1 = await browser.newPage();
  await page1.setContent(frontHtml, { waitUntil: "domcontentloaded" });
  const frontPdfBytes = await page1.pdf({
    format: "A4",
    printBackground: true,
    displayHeaderFooter: false,
    margin: { top: "0", bottom: "0", left: "0", right: "0" },
  });

  // --- Pass 2: Content pages (with header/footer, page numbers from 1) ---
  const page2 = await browser.newPage();
  await page2.setContent(contentHtml, { waitUntil: "domcontentloaded" });
  const contentPdfBytes = await page2.pdf({
    format: "A4",
    printBackground: true,
    displayHeaderFooter: false,
    margin: { top: "2.5cm", bottom: "2.5cm", left: "2cm", right: "2cm" },
  });

  await browser.close();

  // --- Merge PDFs ---
  const merged = await PDFDocument.create();

  const frontDoc = await PDFDocument.load(frontPdfBytes);
  const frontPages = await merged.copyPages(frontDoc, frontDoc.getPageIndices());
  for (const p of frontPages) merged.addPage(p);

  const contentDoc = await PDFDocument.load(contentPdfBytes);
  const contentPages = await merged.copyPages(contentDoc, contentDoc.getPageIndices());
  for (const p of contentPages) merged.addPage(p);

  const mergedBytes = await merged.save();
  fs.writeFileSync(outputPath, mergedBytes);

  const sizeKb = (mergedBytes.length / 1024).toFixed(0);
  console.log(`Output:   ${outputPath} (${sizeKb} KB)`);
  console.log("Done.");
}

generatePdf().catch((err) => {
  console.error("PDF generation failed:", err);
  process.exit(1);
});
