const BASIC_AUTH_USER = process.env.BASIC_AUTH_USER;
const BASIC_AUTH_PASSWORD = process.env.BASIC_AUTH_PASSWORD;

export const config = {
  matcher: "/(.*)",
};

const unauthorized = () =>
  new Response("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Excalidraw"',
    },
  });

const decodeBasicAuth = (authorizationHeader: string) => {
  if (!authorizationHeader.startsWith("Basic ")) {
    return null;
  }

  try {
    const decoded = atob(authorizationHeader.slice("Basic ".length));
    const separatorIndex = decoded.indexOf(":");

    if (separatorIndex === -1) {
      return null;
    }

    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1),
    };
  } catch {
    return null;
  }
};

export default function middleware(request: Request) {
  if (!BASIC_AUTH_USER || !BASIC_AUTH_PASSWORD) {
    return new Response("Basic auth is not configured", { status: 500 });
  }

  const credentials = decodeBasicAuth(
    request.headers.get("authorization") ?? "",
  );

  if (
    credentials?.username === BASIC_AUTH_USER &&
    credentials.password === BASIC_AUTH_PASSWORD
  ) {
    return;
  }

  return unauthorized();
}
