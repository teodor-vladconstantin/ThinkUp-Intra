export type AmbassadorCsvRow = {
  fullName: string;
  schoolName: string;
  email: string;
  phone: string;
  rowNumber: number;
};

const REQUIRED_HEADERS = ["full_name", "school_name", "email", "phone"] as const;

function parseRecords(csv: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  let closedQuote = false;

  for (let i = 0; i < csv.length; i += 1) {
    const char = csv[i];
    if (quoted) {
      if (char === '"') {
        if (csv[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
          closedQuote = true;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field.length === 0 && !closedQuote) {
      quoted = true;
    } else if (char === ",") {
      record.push(field);
      field = "";
      closedQuote = false;
    } else if (char === "\n" || char === "\r") {
      record.push(field);
      if (record.some((value) => value.trim() !== "")) records.push(record);
      record = [];
      field = "";
      closedQuote = false;
      if (char === "\r" && csv[i + 1] === "\n") i += 1;
    } else if (closedQuote) {
      throw new Error("CSV invalid: există text după un câmp între ghilimele.");
    } else {
      field += char;
    }
  }

  if (quoted) throw new Error("CSV invalid: un câmp între ghilimele nu este închis.");
  if (field !== "" || record.length > 0) {
    record.push(field);
    if (record.some((value) => value.trim() !== "")) records.push(record);
  }
  return records;
}

export function parseAmbassadorCsv(csv: string): AmbassadorCsvRow[] {
  const records = parseRecords(csv.replace(/^\uFEFF/, ""));
  if (records.length < 2) throw new Error("CSV-ul trebuie să conțină antetul și cel puțin un ambasador.");
  if (records.length - 1 > 500) throw new Error("Poți importa cel mult 500 de ambasadori odată.");

  const headers = records[0].map((header) => header.trim().toLowerCase());
  if (headers.length !== REQUIRED_HEADERS.length || REQUIRED_HEADERS.some((header) => !headers.includes(header))) {
    throw new Error(`Antet CSV invalid. Coloanele obligatorii sunt: ${REQUIRED_HEADERS.join(", ")}.`);
  }

  const index = Object.fromEntries(headers.map((header, i) => [header, i]));
  const rows = records.slice(1).map((record, i) => {
    if (record.length !== headers.length) throw new Error(`Rândul ${i + 2} are un număr invalid de coloane.`);
    const read = (header: (typeof REQUIRED_HEADERS)[number]) => record[index[header]].trim();
    return {
      fullName: read("full_name"),
      schoolName: read("school_name"),
      email: read("email"),
      phone: read("phone"),
      rowNumber: i + 2,
    };
  });

  return rows;
}

export function normalizeImportKey(value: string) {
  return value.trim().normalize("NFKC").toLocaleLowerCase("ro");
}
