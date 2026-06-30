const { del, get, put } = require("@vercel/blob");

type RequestBody = string | Record<string, unknown> | undefined;

type SceneRequest = AsyncIterable<string | Buffer> & {
  body?: RequestBody;
  method?: string;
};

type SceneResponse = {
  status: (statusCode: number) => SceneResponse;
  setHeader: (name: string, value: string) => void;
  json: (body: Record<string, unknown>) => void;
  send: (body: string) => void;
  end: () => void;
};

const SCENE_BLOB_PATH = "excalidraw/scenes/default.json";
const MAX_SCENE_BYTES = 20 * 1024 * 1024;

const config = {
  api: {
    bodyParser: {
      sizeLimit: "20mb",
    },
  },
};

const json = (
  response: SceneResponse,
  statusCode: number,
  body: Record<string, unknown>,
) => {
  response.status(statusCode);
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json");
  response.json(body);
};

const readRequestBody = async (request: SceneRequest) => {
  if (typeof request.body === "string") {
    return request.body;
  }

  if (request.body && typeof request.body === "object") {
    return JSON.stringify(request.body);
  }

  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
};

async function handler(request: SceneRequest, response: SceneResponse) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return json(response, 500, {
      error: "BLOB_READ_WRITE_TOKEN is not configured",
    });
  }

  if (request.method === "GET") {
    try {
      const scene = await get(SCENE_BLOB_PATH, {
        access: "private",
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });

      if (!scene) {
        return json(response, 404, { error: "Scene not found" });
      }

      const sceneText = await new Response(scene.stream).text();

      response.status(200);
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Content-Type", "application/json");
      response.send(sceneText);
      return;
    } catch (error: any) {
      if (error?.status === 404 || error?.statusCode === 404) {
        return json(response, 404, { error: "Scene not found" });
      }

      console.error(error);
      return json(response, 500, { error: "Failed to load scene" });
    }
  }

  if (request.method === "PUT") {
    try {
      const body = await readRequestBody(request);

      if (Buffer.byteLength(body, "utf8") > MAX_SCENE_BYTES) {
        return json(response, 413, {
          error: "Scene snapshot is too large",
        });
      }

      JSON.parse(body);

      await put(SCENE_BLOB_PATH, body, {
        access: "private",
        allowOverwrite: true,
        contentType: "application/json; charset=utf-8",
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });

      return json(response, 200, {
        ok: true,
        updatedAt: Date.now(),
      });
    } catch (error: any) {
      if (error instanceof SyntaxError) {
        return json(response, 400, {
          error: "Invalid scene JSON",
        });
      }

      console.error(error);
      return json(response, 500, { error: "Failed to save scene" });
    }
  }

  if (request.method === "DELETE") {
    try {
      await del(SCENE_BLOB_PATH, {
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
      return json(response, 200, { ok: true });
    } catch (error: any) {
      if (error?.status === 404 || error?.statusCode === 404) {
        return json(response, 404, { error: "Scene not found" });
      }

      console.error(error);
      return json(response, 500, { error: "Failed to delete scene" });
    }
  }

  response.status(405);
  response.setHeader("Allow", "GET, PUT, DELETE");
  response.setHeader("Cache-Control", "no-store");
  response.end();
}

module.exports = handler;
module.exports.config = config;
