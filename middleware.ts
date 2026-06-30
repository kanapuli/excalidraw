const LOGIN_USERNAME =
  process.env.LOGIN_USERNAME ?? process.env.BASIC_AUTH_USER;
const LOGIN_PASSWORD =
  process.env.LOGIN_PASSWORD ?? process.env.BASIC_AUTH_PASSWORD;
const LOGIN_SESSION_SECRET =
  process.env.LOGIN_SESSION_SECRET ?? LOGIN_PASSWORD ?? "";

const COOKIE_NAME = "__Host-excalidraw_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const encoder = new TextEncoder();

export const config = {
  matcher: "/(.*)",
};

const html = (body: string, status = 200) =>
  new Response(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/html; charset=utf-8",
    },
  });

const redirect = (request: Request, pathname: string) =>
  Response.redirect(new URL(pathname, request.url), 303);

const timingSafeEqual = (left: string, right: string) => {
  if (left.length !== right.length) {
    return false;
  }

  let result = 0;

  for (let index = 0; index < left.length; index++) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return result === 0;
};

const base64UrlEncode = (bytes: ArrayBuffer) => {
  const binary = String.fromCharCode(...new Uint8Array(bytes));

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

const sign = async (payload: string) => {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(LOGIN_SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  return base64UrlEncode(
    await crypto.subtle.sign("HMAC", key, encoder.encode(payload)),
  );
};

const createSession = async () => {
  const payload = Date.now().toString();

  return `${payload}.${await sign(payload)}`;
};

const isValidSession = async (session: string | undefined) => {
  if (!session) {
    return false;
  }

  const [payload, signature] = session.split(".");

  if (!payload || !signature) {
    return false;
  }

  const createdAt = Number(payload);

  if (
    !Number.isFinite(createdAt) ||
    Date.now() - createdAt > SESSION_MAX_AGE_SECONDS * 1000
  ) {
    return false;
  }

  return timingSafeEqual(signature, await sign(payload));
};

const getCookie = (request: Request, name: string) => {
  const cookies = request.headers.get("cookie")?.split(";") ?? [];
  const prefix = `${name}=`;

  return cookies
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(prefix))
    ?.slice(prefix.length);
};

const getSafeNextPath = (request: Request) => {
  const requestUrl = new URL(request.url);
  const next = requestUrl.searchParams.get("next");

  if (!next?.startsWith("/") || next.startsWith("//")) {
    return "/";
  }

  return next;
};

const loginPage = (request: Request, error = false) => {
  const next = getSafeNextPath(request);
  const errorMarkup = error
    ? '<p class="error" role="alert">Invalid username or password.</p>'
    : "";

  return html(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Sign in</title>
    <style>
      :root {
        color-scheme: light;
        font-family:
          Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
          "Segoe UI", sans-serif;
        background: #f8f7fb;
        color: #1f1f29;
      }

      * {
        box-sizing: border-box;
      }

      body {
        align-items: center;
        display: flex;
        justify-content: center;
        margin: 0;
        min-height: 100vh;
        padding: 24px;
      }

      main {
        background: #ffffff;
        border: 1px solid #dedbe8;
        border-radius: 8px;
        box-shadow: 0 18px 60px rgb(31 31 41 / 10%);
        max-width: 400px;
        padding: 32px;
        width: 100%;
      }

      h1 {
        font-size: 1.5rem;
        line-height: 1.2;
        margin: 0 0 8px;
      }

      p {
        color: #6b6878;
        margin: 0 0 24px;
      }

      label {
        display: block;
        font-size: 0.875rem;
        font-weight: 600;
        margin: 16px 0 8px;
      }

      input {
        border: 1px solid #c8c4d6;
        border-radius: 6px;
        font: inherit;
        padding: 12px;
        width: 100%;
      }

      input:focus {
        border-color: #6965db;
        outline: 3px solid rgb(105 101 219 / 20%);
      }

      button {
        background: #6965db;
        border: 0;
        border-radius: 6px;
        color: #ffffff;
        cursor: pointer;
        font: inherit;
        font-weight: 700;
        margin-top: 24px;
        padding: 12px;
        width: 100%;
      }

      button:focus {
        outline: 3px solid rgb(105 101 219 / 30%);
        outline-offset: 2px;
      }

      .error {
        background: #fff0f0;
        border: 1px solid #ffc4c4;
        border-radius: 6px;
        color: #a51212;
        margin: 0 0 16px;
        padding: 10px 12px;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Sign in to Excalidraw</h1>
      <p>Enter the username and password configured for this deployment.</p>
      ${errorMarkup}
      <form method="post" action="/login?next=${encodeURIComponent(next)}">
        <label for="username">Username</label>
        <input id="username" name="username" autocomplete="username" required />
        <label for="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autocomplete="current-password"
          required
        />
        <button type="submit">Sign in</button>
      </form>
    </main>
  </body>
</html>`);
};

const login = async (request: Request) => {
  const body = new URLSearchParams(await request.text());
  const username = body.get("username") ?? "";
  const password = body.get("password") ?? "";

  if (
    timingSafeEqual(username, LOGIN_USERNAME ?? "") &&
    timingSafeEqual(password, LOGIN_PASSWORD ?? "")
  ) {
    const response = redirect(request, getSafeNextPath(request));

    response.headers.set(
      "Set-Cookie",
      `${COOKIE_NAME}=${await createSession()}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}`,
    );

    return response;
  }

  return loginPage(request, true);
};

const logout = (request: Request) => {
  const response = redirect(request, "/login");

  response.headers.set(
    "Set-Cookie",
    `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
  );

  return response;
};

export default async function middleware(request: Request) {
  const { pathname, search } = new URL(request.url);

  if (!LOGIN_USERNAME || !LOGIN_PASSWORD || !LOGIN_SESSION_SECRET) {
    return new Response("Login is not configured", { status: 500 });
  }

  if (pathname === "/login" && request.method === "GET") {
    return loginPage(request);
  }

  if (pathname === "/login" && request.method === "POST") {
    return login(request);
  }

  if (pathname === "/logout") {
    return logout(request);
  }

  if (await isValidSession(getCookie(request, COOKIE_NAME))) {
    return;
  }

  return redirect(
    request,
    `/login?next=${encodeURIComponent(`${pathname}${search}`)}`,
  );
}
