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
      valueInputOption: "USER_ENTERED",
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
    valueInputOption: "USER_ENTERED",
    requestBody: { values: rows },
  });

  return { appended: rows.length };
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

  const lastCol = String.fromCharCode(64 + Math.min(values.length, 26));
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
