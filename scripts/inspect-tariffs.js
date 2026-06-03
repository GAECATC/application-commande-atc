const XLSX = require("xlsx");

const files = process.argv.slice(2);

for (const file of files) {
  const workbook = XLSX.readFile(file, { cellDates: true });
  console.log(`\nFILE: ${file}`);
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    console.log(`SHEET: ${sheetName} rows=${rows.length}`);
    rows.slice(0, 18).forEach((row, index) => {
      const compact = row.map((value) => String(value).trim()).filter(Boolean);
      if (compact.length) console.log(`${index + 1}: ${compact.join(" | ")}`);
    });
  }
}
