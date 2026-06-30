import { clearAppStateForLocalStorage } from "@excalidraw/excalidraw/appState";
import { getNonDeletedElements } from "@excalidraw/element";

import type { ExcalidrawElement } from "@excalidraw/element/types";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";

const REMOTE_SCENE_ENDPOINT = "/api/scene";
const REMOTE_SCENE_VERSION = 1;

export type RemoteSceneSnapshot = {
  type: "excalidraw-remote-scene";
  version: number;
  updatedAt: number;
  elements: readonly ExcalidrawElement[];
  appState: Partial<AppState>;
  files: BinaryFiles;
};

const isRemoteSceneSnapshot = (data: any): data is RemoteSceneSnapshot => {
  return (
    data?.type === "excalidraw-remote-scene" &&
    typeof data.version === "number" &&
    typeof data.updatedAt === "number" &&
    Array.isArray(data.elements) &&
    data.appState &&
    typeof data.appState === "object" &&
    data.files &&
    typeof data.files === "object"
  );
};

export const createRemoteSceneSnapshot = (
  elements: readonly ExcalidrawElement[],
  appState: AppState,
  files: BinaryFiles,
): RemoteSceneSnapshot => {
  return {
    type: "excalidraw-remote-scene",
    version: REMOTE_SCENE_VERSION,
    updatedAt: Date.now(),
    elements: getNonDeletedElements(elements),
    appState: clearAppStateForLocalStorage(appState),
    files,
  };
};

export const loadRemoteScene =
  async (): Promise<ExcalidrawInitialDataState | null> => {
    const response = await fetch(REMOTE_SCENE_ENDPOINT, {
      cache: "no-store",
      credentials: "same-origin",
      redirect: "manual",
    });

    if (response.status === 404) {
      return null;
    }

    if (response.status >= 300 && response.status < 400) {
      throw new Error("Sign in again to load remote scene");
    }

    if (!response.ok) {
      throw new Error("Failed to load remote scene");
    }

    const data = await response.json();

    if (!isRemoteSceneSnapshot(data)) {
      throw new Error("Remote scene has an invalid format");
    }

    return {
      elements: data.elements,
      appState: data.appState,
      files: data.files,
      scrollToContent: true,
    };
  };

export const saveRemoteScene = async (
  elements: readonly ExcalidrawElement[],
  appState: AppState,
  files: BinaryFiles,
) => {
  const response = await fetch(REMOTE_SCENE_ENDPOINT, {
    method: "PUT",
    cache: "no-store",
    credentials: "same-origin",
    redirect: "manual",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(createRemoteSceneSnapshot(elements, appState, files)),
  });

  if (response.status >= 300 && response.status < 400) {
    throw new Error("Sign in again to save remote scene");
  }

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error || "Failed to save remote scene");
  }
};
