import PDFDocument from "pdfkit";

export function sendPdf(res, title, sections) {
  const doc = new PDFDocument({ margin: 42 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${title}.pdf"`);
  doc.pipe(res);

  doc.fontSize(20).text(title);
  doc.moveDown(0.6);

  sections.forEach((section) => {
    doc.fontSize(13).text(section.heading, { underline: true });
    doc.moveDown(0.3);
    section.lines.forEach((line) => {
      doc.fontSize(10).text(line);
    });
    doc.moveDown(0.8);
  });

  doc.end();
}
