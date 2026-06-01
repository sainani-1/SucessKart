import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const USERNAME_REGISTRY_KEY = "usernames_registry_v1";

const createAuthorizedClient = (supabaseUrl: string, anonKey: string, jwt: string) =>
  createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
    },
  });

type UsernameSeedUser = {
  id?: string;
  full_name?: string;
  created_at?: string | null;
};

type RequestPayload = {
  action?: "ensure" | "update";
  users?: UsernameSeedUser[];
  userId?: string;
  username?: string;
};

const toSlug = (value: string) =>
  String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .slice(0, 18);

const formatJoinStamp = (createdAt?: string | null) => {
  const date = createdAt ? new Date(createdAt) : new Date();
  const year = String(date.getFullYear()).slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
};

const buildSeed = (userId: string) =>
  String(userId || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 4)
    .toUpperCase() || "USER";

const normalizeUsername = (value: string) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

const parseRegistry = (value: string | null | undefined) => {
  if (!value) return {} as Record<string, { username: string; updatedAt?: string }>;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const usernameExists = (
  registry: Record<string, { username: string }>,
  username: string,
  excludeUserId: string | null = null,
) => {
  const target = String(username || "").toLowerCase();
  return Object.entries(registry || {}).some(([userId, record]) => {
    if (excludeUserId && String(userId) === String(excludeUserId)) return false;
    return String(record?.username || "").toLowerCase() === target;
  });
};

const generateDefaultUsername = ({
  fullName,
  userId,
  createdAt,
  registry,
}: {
  fullName: string;
  userId: string;
  createdAt?: string | null;
  registry: Record<string, { username: string }>;
}) => {
  const baseName = toSlug(fullName) || "User";
  const joinStamp = formatJoinStamp(createdAt);
  const seed = buildSeed(userId);
  let candidate = `SucessKart-${baseName}-${seed}-${joinStamp}`;
  let suffix = 2;
  while (usernameExists(registry, candidate, userId)) {
    candidate = `SucessKart-${baseName}-${seed}-${joinStamp}-${suffix}`;
    suffix += 1;
  }
  return candidate;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return new Response(JSON.stringify({ error: "Missing required Supabase environment variables." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing Authorization bearer token." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerJwt = authHeader.replace("Bearer ", "").trim();
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const authClient = createAuthorizedClient(supabaseUrl, anonKey, callerJwt);
    const {
      data: { user },
      error: callerError,
    } = await authClient.auth.getUser();
    if (callerError || !user?.id) {
      return new Response(JSON.stringify({ error: "Invalid session token." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerId = user.id;
    const { data: callerProfile, error: roleError } = await adminClient
      .from("profiles")
      .select("id, role")
      .eq("id", callerId)
      .maybeSingle();

    if (roleError || !callerProfile?.id) {
      return new Response(JSON.stringify({ error: "Profile not found." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isAdmin = callerProfile.role === "admin";
    const body = (await req.json()) as RequestPayload;
    const action = body?.action || "ensure";

    const { data: registryRow, error: registryError } = await adminClient
      .from("settings")
      .select("value")
      .eq("key", USERNAME_REGISTRY_KEY)
      .maybeSingle();
    if (registryError) {
      return new Response(JSON.stringify({ error: registryError.message || "Failed to load usernames registry." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const registry = parseRegistry(registryRow?.value);

    if (action === "ensure") {
      const incomingUsers = Array.isArray(body?.users) ? body.users.filter((user) => user?.id) : [];
      if (!incomingUsers.length) {
        return new Response(JSON.stringify({ usernames: {} }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!isAdmin && incomingUsers.some((user) => String(user.id) !== String(callerId))) {
        return new Response(JSON.stringify({ error: "You can only load your own username." }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let changed = false;
      const usernames: Record<string, string> = {};

      for (const user of incomingUsers) {
        const targetId = String(user.id);
        if (!registry[targetId]?.username) {
          registry[targetId] = {
            username: generateDefaultUsername({
              fullName: String(user.full_name || ""),
              userId: targetId,
              createdAt: user.created_at || null,
              registry,
            }),
            updatedAt: new Date().toISOString(),
          };
          changed = true;
        }
        usernames[targetId] = registry[targetId].username;
      }

      if (changed) {
        const { error: saveError } = await adminClient
          .from("settings")
          .upsert(
            {
              key: USERNAME_REGISTRY_KEY,
              value: JSON.stringify(registry),
            },
            { onConflict: "key" },
          );
        if (saveError) {
          return new Response(JSON.stringify({ error: saveError.message || "Failed to save usernames." }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      return new Response(JSON.stringify({ usernames }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update") {
      const targetUserId = String(body?.userId || "");
      const normalized = normalizeUsername(String(body?.username || ""));

      if (!targetUserId) {
        return new Response(JSON.stringify({ error: "User is required." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!isAdmin && targetUserId !== String(callerId)) {
        return new Response(JSON.stringify({ error: "You can only update your own username." }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!normalized) {
        return new Response(JSON.stringify({ error: "Username is required." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (normalized.length < 6) {
        return new Response(JSON.stringify({ error: "Username must be at least 6 characters." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (usernameExists(registry, normalized, targetUserId)) {
        return new Response(JSON.stringify({ error: "That username is already in use." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      registry[targetUserId] = {
        ...(registry[targetUserId] || {}),
        username: normalized,
        updatedAt: new Date().toISOString(),
      };

      const { error: saveError } = await adminClient
        .from("settings")
        .upsert(
          {
            key: USERNAME_REGISTRY_KEY,
            value: JSON.stringify(registry),
          },
          { onConflict: "key" },
        );
      if (saveError) {
        return new Response(JSON.stringify({ error: saveError.message || "Failed to save username." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ username: normalized }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unsupported action." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
