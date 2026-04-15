import { google } from "googleapis";
import { getGoogleClient } from "./client";

export type Task = {
  id: string;
  title: string;
  notes?: string;
  due?: string;
  status: "needsAction" | "completed";
};

export async function listTasks(userId: string): Promise<Task[]> {
  const auth = await getGoogleClient(userId);
  const tasks = google.tasks({ version: "v1", auth });

  const lists = await tasks.tasklists.list({ maxResults: 10 });
  const defaultList = lists.data.items?.[0];
  if (!defaultList?.id) return [];

  const res = await tasks.tasks.list({
    tasklist: defaultList.id,
    showCompleted: false,
    maxResults: 100,
  });

  return (res.data.items ?? []).map((t) => ({
    id: t.id!,
    title: t.title ?? "",
    notes: t.notes ?? undefined,
    due: t.due ?? undefined,
    status: (t.status as "needsAction" | "completed") ?? "needsAction",
  }));
}

export async function addTask(userId: string, title: string, due?: string) {
  const auth = await getGoogleClient(userId);
  const tasks = google.tasks({ version: "v1", auth });
  const lists = await tasks.tasklists.list({ maxResults: 10 });
  const defaultList = lists.data.items?.[0];
  if (!defaultList?.id) throw new Error("No task list found");

  const res = await tasks.tasks.insert({
    tasklist: defaultList.id,
    requestBody: { title, due },
  });
  return res.data;
}

export async function findTaskByTitle(
  userId: string,
  query: string,
): Promise<Task | null> {
  const tasks = await listTasks(userId);
  const needle = query.toLowerCase().trim();
  return (
    tasks.find((t) => t.title.toLowerCase() === needle) ??
    tasks.find((t) => t.title.toLowerCase().includes(needle)) ??
    null
  );
}

export async function updateTask(
  userId: string,
  taskId: string,
  updates: { title?: string; notes?: string; due?: string },
): Promise<void> {
  const auth = await getGoogleClient(userId);
  const tasks = google.tasks({ version: "v1", auth });
  const lists = await tasks.tasklists.list({ maxResults: 10 });
  const defaultList = lists.data.items?.[0];
  if (!defaultList?.id) throw new Error("No task list found");
  await tasks.tasks.patch({
    tasklist: defaultList.id,
    task: taskId,
    requestBody: updates,
  });
}

export async function deleteTask(userId: string, taskId: string): Promise<void> {
  const auth = await getGoogleClient(userId);
  const tasks = google.tasks({ version: "v1", auth });
  const lists = await tasks.tasklists.list({ maxResults: 10 });
  const defaultList = lists.data.items?.[0];
  if (!defaultList?.id) throw new Error("No task list found");
  await tasks.tasks.delete({
    tasklist: defaultList.id,
    task: taskId,
  });
}

export async function completeTask(userId: string, taskId: string) {
  const auth = await getGoogleClient(userId);
  const tasks = google.tasks({ version: "v1", auth });
  const lists = await tasks.tasklists.list({ maxResults: 10 });
  const defaultList = lists.data.items?.[0];
  if (!defaultList?.id) throw new Error("No task list found");

  await tasks.tasks.patch({
    tasklist: defaultList.id,
    task: taskId,
    requestBody: { status: "completed" },
  });
}
