export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function handle(res: Response) {
  if (res.status === 204) return null;
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    throw new ApiError(body?.error || `Request failed (${res.status})`, res.status);
  }
  return body;
}

export async function apiGet(path: string) {
  const res = await fetch(`/api${path}`, { credentials: "include" });
  return handle(res);
}

export async function apiSend(method: "POST" | "PATCH" | "PUT" | "DELETE", path: string, data?: unknown) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: "include",
    headers: data ? { "Content-Type": "application/json" } : undefined,
    body: data ? JSON.stringify(data) : undefined,
  });
  return handle(res);
}

export async function apiUpload(method: "POST", path: string, formData: FormData) {
  const res = await fetch(`/api${path}`, { method, credentials: "include", body: formData });
  return handle(res);
}

export async function apiDownload(path: string, filenameFallback: string) {
  const res = await fetch(`/api${path}`, { credentials: "include" });
  if (!res.ok) throw new ApiError("Download failed", res.status);
  const blob = await res.blob();
  const disposition = res.headers.get("content-disposition") || "";
  const match = /filename=([^;]+)/i.exec(disposition);
  const filename = match ? match[1].replace(/"/g, "") : filenameFallback;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
