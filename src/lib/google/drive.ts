import { google } from "googleapis";
import { getGoogleClient } from "./client";

export type DriveRole = "reader" | "commenter" | "writer";

export async function shareFile(
  userId: string,
  fileId: string,
  email: string,
  role: DriveRole,
  message?: string,
): Promise<{ permissionId: string }> {
  const auth = await getGoogleClient(userId);
  const drive = google.drive({ version: "v3", auth });

  const res = await drive.permissions.create({
    fileId,
    sendNotificationEmail: true,
    emailMessage: message,
    requestBody: {
      type: "user",
      role,
      emailAddress: email,
    },
    fields: "id",
  });

  return { permissionId: res.data.id ?? "" };
}
