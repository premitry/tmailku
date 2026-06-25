export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  if (!API_BASE && path.startsWith("/api")) {
    throw new Error("URL API belum disetel. Cek NEXT_PUBLIC_API_BASE di Cloudflare Pages.");
  }

  let res: Response;
  try {
    res = await fetch(API_BASE + path, {
      ...opts,
      credentials: "include",
      headers: { "content-type": "application/json", ...(opts.headers || {}) },
      cache: "no-store",
    });
  } catch {
    throw new Error("Gagal mengambil email, coba refresh kembali.");
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      (data as any).error || "Gagal mengambil email, coba refresh kembali. (" + res.status + ")",
    );
  }
  return res.json() as Promise<T>;
}

export interface Branding {
  appName: string;
  logoUrl: string;
  faviconUrl: string;
  heroTitle: string;
  heroSubtitle: string;
  defaultTheme: string;
  defaultLang: string;
  siteLocked: boolean;
}

export interface EmailSummary {
  id: string;
  from_addr: string;
  from_name?: string;
  subject: string;
  otp_code?: string | null;
  has_attachment: number;
  seen: number;
  received_at: number;
}

export const api = {
  branding: () => req<Branding>("/api/branding"),
  upload: async (file: File): Promise<{ url: string }> => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(API_BASE + "/api/admin/upload", {
      method: "POST",
      credentials: "include",
      body: fd,
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error((d as any).error || "upload gagal");
    }
    return res.json();
  },
  domains: () => req<{ domains: string[] }>("/api/domains"),
  createAddress: (body: {
    domain?: string;
    local?: string;
    ttlMinutes?: number;
  }) =>
    req<{
      address: string;
      ownerToken: string;
      expiresAt: number;
      domain: string;
    }>("/api/address", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  inbox: (addr: string, sync = false) =>
    req<{ emails: EmailSummary[] }>(
      "/api/inbox/" + encodeURIComponent(addr) + (sync ? "?sync=1" : ""),
    ),
  email: (id: string) => req<any>("/api/email/" + id),
  deleteEmail: (id: string) =>
    req<{ ok: boolean }>("/api/email/" + id, { method: "DELETE" }),

  // setup
  setupStatus: () => req<{ setupCompleted: boolean }>("/api/setup/status"),
  setup: (b: { email: string; password: string; name?: string }) =>
    req<{ ok: boolean }>("/api/setup", {
      method: "POST",
      body: JSON.stringify(b),
    }),

  // admin
  login: (email: string, password: string) =>
    req<{ ok: boolean; token: string; mustChangePassword: boolean }>(
      "/api/admin/login",
      {
        method: "POST",
        body: JSON.stringify({ email, password }),
      },
    ),
  logout: () => req<{ ok: boolean }>("/api/admin/logout", { method: "POST" }),
  me: () => req<any>("/api/admin/me"),
  stats: () => req<any>("/api/admin/stats"),
  activity: () => req<{ events: any[] }>("/api/admin/activity"),
  adminDomains: () => req<{ domains: any[] }>("/api/admin/domains"),
  addDomain: async (b: any) => {
    const created = await req<any>("/api/admin/domains", {
      method: "POST",
      body: JSON.stringify(b),
    });
    if (b?.receive_imap_enabled && created?.id) {
      await req<any>("/api/admin/domains/" + created.id, {
        method: "PATCH",
        body: JSON.stringify({ verified: true, is_verified: true }),
      }).catch(() => {});
    }
    return created;
  },
  patchDomain: (id: string, b: any) =>
    req<any>("/api/admin/domains/" + id, {
      method: "PATCH",
      body: JSON.stringify(b),
    }),
  verifyDomain: (id: string) =>
    req<{ verified: boolean }>("/api/admin/domains/" + id + "/verify", {
      method: "POST",
    }),
  delDomain: (id: string) =>
    req<any>("/api/admin/domains/" + id, { method: "DELETE" }),
  testNewDomainImap: (imap: any) =>
    req<{ ok: boolean; error?: string }>("/api/admin/domains/imap/test", {
      method: "POST",
      body: JSON.stringify({ imap }),
    }),
  testDomainImap: async (id: string, imap?: any) => {
    const result = await req<{ ok: boolean; error?: string }>(
      "/api/admin/domains/" + id + "/imap/test",
      { method: "POST", body: JSON.stringify(imap ? { imap } : {}) },
    );
    if (result.ok) {
      await req<any>("/api/admin/domains/" + id, {
        method: "PATCH",
        body: JSON.stringify({ verified: true, is_verified: true }),
      }).catch(() => {});
    }
    return result;
  },
  syncDomainImap: (id: string) =>
    req<any>("/api/admin/domains/" + id + "/imap/sync", { method: "POST" }),
  // IMAP Profiles (reusable)
  imapProfiles: () => req<{ profiles: any[] }>("/api/admin/imap-profiles"),
  addImapProfile: (b: { name: string; imap: any }) =>
    req<{ ok: boolean; id: string }>("/api/admin/imap-profiles", {
      method: "POST",
      body: JSON.stringify(b),
    }),
  patchImapProfile: (id: string, b: { name?: string; imap?: any }) =>
    req<{ ok: boolean }>("/api/admin/imap-profiles/" + id, {
      method: "PATCH",
      body: JSON.stringify(b),
    }),
  delImapProfile: (id: string) =>
    req<{ ok: boolean }>("/api/admin/imap-profiles/" + id, {
      method: "DELETE",
    }),
  testImapProfile: (id: string) =>
    req<{ ok: boolean; error?: string }>(
      "/api/admin/imap-profiles/" + id + "/test",
      { method: "POST" },
    ),
  checkImapProfile: (imap: any) =>
    req<{ match: any | null }>("/api/admin/imap-profiles/check", {
      method: "POST",
      body: JSON.stringify({ imap }),
    }),
  admins: () => req<{ admins: any[] }>("/api/admin/admins"),
  addAdmin: (b: any) =>
    req<any>("/api/admin/admins", { method: "POST", body: JSON.stringify(b) }),
  delAdmin: (id: string) =>
    req<any>("/api/admin/admins/" + id, { method: "DELETE" }),
  settings: (group?: string) =>
    req<{ settings: any }>(
      "/api/admin/settings" + (group ? "?group=" + group : ""),
    ),
  saveSettings: (b: Record<string, string>) =>
    req<any>("/api/admin/settings", { method: "PUT", body: JSON.stringify(b) }),
  apiKeys: () => req<{ keys: any[] }>("/api/admin/api-keys"),
  addApiKey: (b: any) =>
    req<{ id: string; plaintext: string; key_prefix: string }>(
      "/api/admin/api-keys",
      { method: "POST", body: JSON.stringify(b) },
    ),
  patchApiKey: (id: string, b: any) =>
    req<any>("/api/admin/api-keys/" + id, {
      method: "PATCH",
      body: JSON.stringify(b),
    }),
  delApiKey: (id: string) =>
    req<any>("/api/admin/api-keys/" + id, { method: "DELETE" }),
  integrations: () => req<{ settings: any[] }>("/api/admin/integrations"),
  saveIntegrations: (b: Record<string, string>) =>
    req<any>("/api/admin/integrations", {
      method: "PUT",
      body: JSON.stringify(b),
    }),
  testIntegration: () =>
    req<{ telegram: boolean; webhook: boolean }>(
      "/api/admin/integrations/test",
      { method: "POST" },
    ),
  updateProfile: (b: any) =>
    req<any>("/api/admin/me", { method: "PATCH", body: JSON.stringify(b) }),
};
