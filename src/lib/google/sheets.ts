import { google } from "googleapis";
import { getGoogleClient } from "./client";

/**
 * Create a new Google Sheet with optional initial header row + rows.
 * Scope: drive.file is sufficient since we own files we create.
 */
export async function createSheet(
  userId: string,
  title: string,
  opts?: { headers?: string[]; rows?: (string | number)[][] },
): Promise<{ id: string; url: string }> {
  const auth = await getGoogleClient(userId);
  const sheets = google.sheets({ version: "v4", auth });

  const res = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: title.slice(0, 200) },
    },
    fields: "spreadsheetId",
  });

  const id = res.data.spreadsheetId;
  if (!id) throw new Error("Sheet creation returned no id");

  const initial: (string | number)[][] = [];
  if (opts?.headers?.length) initial.push(opts.headers);
  if (opts?.rows?.length) initial.push(...opts.rows);
  if (initial.length) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: id,
      range: "Sheet1!A1",
      valueInputOption: "RAW",
      requestBody: { values: initial },
    });
  }

  return { id, url: `https://docs.google.com/spreadsheets/d/${id}/edit` };
}

/**
 * Append rows to an existing sheet (anything we created with drive.file scope).
 * Returns the count appended.
 */
export async function appendRows(
  userId: string,
  spreadsheetId: string,
  rows: (string | number)[][],
  sheetName = "Sheet1",
): Promise<{ appended: number }> {
  const auth = await getGoogleClient(userId);
  const sheets = google.sheets({ version: "v4", auth });

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: rows },
  });

  return { appended: rows.length };
}

/**
 * Append columns to an existing sheet's header row. New columns are added
 * starting at the first empty column position. Verifies by reading back.
 */
export async function addColumns(
  userId: string,
  spreadsheetId: string,
  newHeaders: string[],
  sheetName = "Sheet1",
): Promise<{ added: number; total_columns: number; final_headers: string[] }> {
  const auth = await getGoogleClient(userId);
  const sheets = google.sheets({ version: "v4", auth });

  const get = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:ZZ1`,
  });
  const existing = (get.data.values?.[0] as string[] | undefined) ?? [];
  const startIdx = existing.length;
  const startCol = colLetter(startIdx + 1);
  const endCol = colLetter(startIdx + newHeaders.length);

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!${startCol}1:${endCol}1`,
    valueInputOption: "RAW",
    requestBody: { values: [newHeaders] },
  });

  const verify = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:ZZ1`,
  });
  const finalHeaders = (verify.data.values?.[0] as string[] | undefined) ?? [];

  return { added: newHeaders.length, total_columns: finalHeaders.length, final_headers: finalHeaders };
}

/**
 * Update a single cell by row + column letter (e.g. "L", "AA").
 */
export async function updateCell(
  userId: string,
  spreadsheetId: string,
  rowNumber: number,
  columnLetter: string,
  value: string,
  sheetName = "Sheet1",
): Promise<{ updated: 1 }> {
  if (rowNumber < 1) throw new Error("rowNumber must be >= 1");
  const auth = await getGoogleClient(userId);
  const sheets = google.sheets({ version: "v4", auth });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!${columnLetter}${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: { values: [[value]] },
  });
  return { updated: 1 };
}

function colLetter(n: number): string {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * Update a single row by 1-indexed row number. Pass full row values left-to-right
 * starting at column A.
 */
export async function updateRow(
  userId: string,
  spreadsheetId: string,
  rowNumber: number,
  values: (string | number)[],
  sheetName = "Sheet1",
): Promise<{ updated: number }> {
  if (rowNumber < 1) throw new Error("rowNumber must be >= 1");
  const auth = await getGoogleClient(userId);
  const sheets = google.sheets({ version: "v4", auth });

  const lastCol = colLetter(values.length);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A${rowNumber}:${lastCol}${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [values] },
  });

  return { updated: 1 };
}

/**
 * Read all rows from a sheet — useful for the Lead Gen agent to look up which
 * rows are marked "approved" before sending email.
 */
export async function readRows(
  userId: string,
  spreadsheetId: string,
  sheetName = "Sheet1",
): Promise<{ rows: string[][] }> {
  const auth = await getGoogleClient(userId);
  const sheets = google.sheets({ version: "v4", auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:Z1000`,
  });

  return { rows: (res.data.values as string[][] | undefined) ?? [] };
}
